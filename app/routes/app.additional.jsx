import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, TrendingUp, Search, Filter, Download, ShoppingBag
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

  const whereClause = {
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

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers,
    allVariantRecords
  ] = await Promise.all([
    prisma.backInStock.count({ where: whereClause }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true } }),
    prisma.backInStock.count({ where: { ...whereClause, opened: true } }),
    prisma.backInStock.count({ where: { ...whereClause, clicked: true } }),
    prisma.backInStock.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ 
      where: whereClause, 
      take: 20, 
      orderBy: { createdAt: 'desc' } 
    }),
    prisma.backInStock.findMany({
      where: whereClause,
      select: { variantId: true }
    })
  ]);

  const variantCounts = {};
  allVariantRecords.forEach(record => {
    const variantId = record.variantId;
    variantCounts[variantId] = (variantCounts[variantId] || 0) + 1;
  });

  const topVariantIds = Object.entries(variantCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topProducts = [];
  for (const [variantId, count] of topVariantIds) {
    try {
      const response = await admin.graphql(`
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
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
    } catch (e) {
      topProducts.push({ variantId, productTitle: 'Unknown Product', variantTitle: 'Unknown Variant', count });
    }
  }

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
      } catch (e) {
        return { ...sub, productTitle: 'Unknown Product', variantTitle: 'Unknown Variant', sku: 'N/A' };
      }
    })
  );

  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Notifications: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
  });

  const conversionRate = notificationsSent > 0 ? ((emailsClicked / notificationsSent) * 100).toFixed(1) : 0;
  const openRate = notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(1) : 0;

  return json({
    stats: { totalRequests, notificationsSent, emailsOpened, emailsClicked, conversionRate, openRate },
    recentSubscribers: enrichedSubscribers,
    trendData: Object.values(dateMap),
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
          <div className={`p-3 rounded-xl ${gradient} bg-opacity-10 text-white`}>
            <Icon size={24} />
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6 md:p-10 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header (Original Structure) */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Back In Stock Analytics</h1>
            <p className="text-sm text-gray-500">Monitor your product restock notifications</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all">
              <Filter size={16} /> Filters
            </button>
            <button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all">
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        {/* Filters (Original Structure) */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" name="search" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Email or variant ID..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl" />
                </div>
              </div>
              <select name="dateRange" defaultValue={filters.dateRange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl">
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>
              <button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md">Apply</button>
            </form>
          </div>
        )}

        {/* Metric Cards (Original Structure) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests.toLocaleString()} icon={ShoppingBag} gradient="bg-gradient-to-br from-blue-500 to-blue-600" trend="+12%" />
          <MetricCard title="Sent" value={stats.notificationsSent.toLocaleString()} icon={Bell} gradient="bg-gradient-to-br from-green-500 to-green-600" trend="+8%" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} gradient="bg-gradient-to-br from-pink-500 to-pink-600" />
          <MetricCard title="CTR" value={`${stats.conversionRate}%`} icon={MousePointer2} gradient="bg-gradient-to-br from-purple-500 to-purple-600" />
        </div>

        {/* CHARTS SECTION (Updated to Bar Charts) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Trend Bar Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg border border-gray-50">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-6">Requests and Notifications Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontSize: '12px', fontWeight: 'bold'}} />
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar name="Notifications" dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel (Updated as per Image) */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-50">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-8">Notification Performance Funnel</h3>
            <div className="space-y-6">
              {[
                { label: 'Requests', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-blue-500' },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-blue-500' },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-blue-500' }
              ].map((item, idx) => {
                const percentage = stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="text-gray-400">{percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-1000`} style={{ width: `${Math.max(percentage, 2)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Products (Original Structure) */}
        <div className="bg-white p-8 rounded-2xl shadow-lg">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-6">Top Requested Products</h3>
          <div className="space-y-4">
            {topProducts.map((product, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">#{idx+1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{product.productTitle}</p>
                  <p className="text-xs text-gray-500 truncate">{product.variantTitle}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">{product.count}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Requests</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Subscribers Table (Original Structure) */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          <div className="px-8 py-6 border-b border-gray-100">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Recent Requests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-8 py-4">Customer</th>
                  <th className="px-8 py-4">Product Details</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-8 py-5 text-sm font-bold text-gray-900">{sub.email}</td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-900">{sub.productTitle}</p>
                      <p className="text-xs text-gray-500">{sub.variantTitle}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right text-sm font-bold text-gray-500">{new Date(sub.createdAt).toLocaleDateString()}</td>
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