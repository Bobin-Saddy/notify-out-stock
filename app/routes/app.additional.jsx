import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import { 
  FileText, Bell, Truck, Eye, MousePointer2, TrendingUp, Search, Settings, Package, Mail, Calendar, Filter, Download, ChevronDown, ExternalLink, ShoppingBag
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";
  const statusFilter = url.searchParams.get("status") || "all";

  const now = new Date();
  const dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  // Table Filters (Sirf list ke liye)
  const tableWhereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { variantId: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }),
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } }),
    ...(statusFilter === "notified" && { notified: true }),
    ...(statusFilter === "pending" && { notified: false }),
    ...(statusFilter === "opened" && { opened: true }),
    ...(statusFilter === "clicked" && { clicked: true })
  };

  // Base Query for Stats (Search/Status filter se independent, sirf Date range pe)
  const baseStatsWhere = {
    shop,
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } })
  };

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecordsForTrend,
    recentSubscribers,
    allVariantRecords
  ] = await Promise.all([
    prisma.backInStock.count({ where: baseStatsWhere }),
    prisma.backInStock.count({ where: { ...baseStatsWhere, notified: true } }),
    prisma.backInStock.count({ where: { ...baseStatsWhere, opened: true } }),
    prisma.backInStock.count({ where: { ...baseStatsWhere, clicked: true } }),
    prisma.backInStock.findMany({
      where: baseStatsWhere,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ 
      where: tableWhereClause, 
      take: 20, 
      orderBy: { createdAt: 'desc' } 
    }),
    prisma.backInStock.findMany({
      where: baseStatsWhere,
      select: { variantId: true }
    })
  ]);

  // Process top variants
  const variantCounts = {};
  allVariantRecords.forEach(record => {
    const variantId = record.variantId;
    variantCounts[variantId] = (variantCounts[variantId] || 0) + 1;
  });

  const topVariantIds = Object.entries(variantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topProducts = [];
  for (const [variantId, count] of topVariantIds) {
    try {
      const response = await admin.graphql(`
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            displayName
            product { title }
          }
        }
      `, { variables: { id: `gid://shopify/ProductVariant/${variantId}` } });
      const data = await response.json();
      const variant = data?.data?.productVariant;
      topProducts.push({
        variantId,
        productTitle: variant?.product?.title || 'Unknown Product',
        variantTitle: variant?.displayName || 'Default Variant',
        count
      });
    } catch (error) {
      topProducts.push({ variantId, productTitle: 'Unknown Product', variantTitle: 'N/A', count });
    }
  }

  // Fetch product details for table
  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              displayName
              sku
              product { title }
            }
          }
        `, { variables: { id: `gid://shopify/ProductVariant/${sub.variantId}` } });
        const data = await response.json();
        const variant = data?.data?.productVariant;
        return {
          ...sub,
          productTitle: variant?.product?.title || 'Unknown Product',
          variantTitle: variant?.displayName || 'Default Variant',
          sku: variant?.sku || 'N/A'
        };
      } catch (error) {
        return { ...sub, productTitle: 'Unknown Product', variantTitle: 'N/A', sku: 'N/A' };
      }
    })
  );

  // Trend Data with all 4 metrics
  const dateMap = {};
  allRecordsForTrend.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Sent: 0, Opens: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Sent += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
  });

  const conversionRate = notificationsSent > 0 ? ((emailsClicked / notificationsSent) * 100).toFixed(1) : 0;
  const openRate = notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(1) : 0;

  return json({
    stats: { 
      totalRequests, 
      notificationsSent, 
      emailsOpened, 
      emailsClicked,
      conversionRate,
      openRate
    },
    recentSubscribers: enrichedSubscribers,
    trendData: Object.values(dateMap).reverse(),
    topProducts,
    filters: { search: searchQuery, dateRange: dateFilter, status: statusFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, topProducts, filters } = useLoaderData();
  const submit = useSubmit();
  const [searchValue, setSearchValue] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    submit(formData, { method: "get" });
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, gradient, trend }) => (
    <div className="relative bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div className={`absolute inset-0 ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${gradient} bg-opacity-10 shadow-inner`}>
            <Icon size={24} className="text-white" />
          </div>
          {trend && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
              <TrendingUp size={12} className="text-green-600" />
              <span className="text-xs font-bold text-green-600">{trend}</span>
            </div>
          )}
        </div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</p>
        <p className="text-3xl font-black text-gray-900 mb-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 font-medium">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6 md:p-10">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Back In Stock Analytics</h1>
            <p className="text-sm text-gray-500">Monitor your product restock notifications</p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <Filter size={16} />
              Filters
            </button>
            <button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Search</label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    name="search"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Email or variant ID..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Date Range</label>
                <select name="dateRange" defaultValue={filters.dateRange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl">
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Status</label>
                <select name="status" defaultValue={filters.status} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl">
                  <option value="all">All Requests</option>
                  <option value="pending">Pending</option>
                  <option value="notified">Notified</option>
                </select>
              </div>

              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold">Apply Filters</button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests} icon={ShoppingBag} gradient="bg-blue-600" />
          <MetricCard title="Sent" value={stats.notificationsSent} icon={Bell} gradient="bg-green-600" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} gradient="bg-pink-600" />
          <MetricCard title="CTR" value={`${stats.conversionRate}%`} icon={MousePointer2} gradient="bg-purple-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Grouped Bar Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg">
            <h3 className="text-sm font-black text-gray-800 uppercase mb-6">Engagement Activity</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9CA3AF'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9CA3AF'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" />
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-lg">
            <h3 className="text-sm font-black text-gray-800 uppercase mb-6">Top Products</h3>
            <div className="space-y-4">
              {topProducts.map((product, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{product.productTitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{width: `${(product.count / topProducts[0].count) * 100}%`}}></div>
                      </div>
                      <span className="text-xs font-black text-gray-600">{product.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100">
            <h3 className="text-sm font-black uppercase text-gray-800">Recent Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase">Product</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase">Engagement</th>
                  <th className="px-6 py-4 text-right text-xs font-black text-gray-600 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50">
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-gray-900">{sub.email}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-gray-800">{sub.productTitle}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{sub.variantTitle}</p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${sub.notified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${sub.opened ? 'bg-pink-50 text-pink-600' : 'bg-gray-50 text-gray-400'}`}>
                          {sub.opened ? '✓ Opened' : 'Unopened'}
                        </span>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${sub.clicked ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-400'}`}>
                          {sub.clicked ? '✓ Clicked' : 'No Click'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right text-xs font-bold text-gray-500">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}