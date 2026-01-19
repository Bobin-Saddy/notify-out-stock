import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
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
    if (!variantCounts[variantId]) variantCounts[variantId] = 0;
    variantCounts[variantId] += 1;
  });

  const topVariantIds = Object.entries(variantCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topProducts = [];
  for (const [variantId, count] of topVariantIds) {
    try {
      const response = await admin.graphql(`
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
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
        variantTitle: variant?.displayName || variant?.title || 'Default Variant',
        count
      });
    } catch (error) {
      topProducts.push({ variantId, productTitle: 'Unknown Product', variantTitle: 'Unknown Variant', count });
    }
  }

  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              id
              title
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
          variantTitle: variant?.displayName || variant?.title || 'Default Variant',
          sku: variant?.sku || 'N/A'
        };
      } catch (error) {
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

  // Funnel Data Calculation
  const funnelData = [
    { label: 'Request', value: stats.totalRequests },
    { label: 'Sent', value: stats.notificationsSent },
    { label: 'Opened', value: stats.emailsOpened },
    { label: 'Clicked', value: stats.emailsClicked },
    { label: 'Purchased', value: Math.round(stats.emailsClicked * 0.5) }, // Placeholder logic for purchased
  ];

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6 md:p-10">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
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

        {/* Filters */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <input type="text" name="search" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Email or variant ID..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500" />
              </div>
              <select name="dateRange" defaultValue={filters.dateRange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl">
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>
              <button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold">Apply</button>
            </form>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests.toLocaleString()} subtitle="All time requests" icon={ShoppingBag} gradient="bg-gradient-to-br from-blue-500 to-blue-600" trend="+12%" />
          <MetricCard title="Notifications Sent" value={stats.notificationsSent.toLocaleString()} subtitle={`${stats.totalRequests > 0 ? ((stats.notificationsSent/stats.totalRequests)*100).toFixed(0) : 0}% of requests`} icon={Bell} gradient="bg-gradient-to-br from-green-500 to-green-600" trend="+8%" />
          <MetricCard title="Email Open Rate" value={`${stats.openRate}%`} subtitle={`${stats.emailsOpened} opened`} icon={Eye} gradient="bg-gradient-to-br from-pink-500 to-pink-600" />
          <MetricCard title="Click Through Rate" value={`${stats.conversionRate}%`} subtitle={`${stats.emailsClicked} clicks`} icon={MousePointer2} gradient="bg-gradient-to-br from-purple-500 to-purple-600" />
        </div>

        {/* UPDATED GRAPHS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Trend Graph */}
          <div className="bg-white p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Requests and Notifications Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 20, right: 30, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" />
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar name="Notifications" dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel Chart */}
          <div className="bg-white p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Notification Performance Funnel</h3>
            <div className="space-y-6 pt-2">
              {funnelData.map((item, idx) => {
                const maxVal = funnelData[0].value || 1;
                const percentage = (item.value / maxVal) * 100;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-gray-600">{item.label}</span>
                      <span className="font-bold text-gray-400">50%</span> 
                    </div>
                    <div className="relative h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-center items-center gap-2 pt-4">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-xs font-bold text-gray-600">Funnel</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Products (Keeping your original structure) */}
        <div className="bg-white p-8 rounded-2xl shadow-lg">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-6">Top Requested Products</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topProducts.map((product, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-50">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-sm">#{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{product.productTitle}</p>
                  <p className="text-xs text-gray-500 truncate">{product.variantTitle}</p>
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

        {/* Recent Subscribers Table (Keeping your original structure) */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
            <div><h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Recent Requests</h3></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase">Product Details</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-black text-gray-600 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">{sub.email.charAt(0).toUpperCase()}</div>
                        <p className="text-sm font-bold text-gray-900">{sub.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-gray-900">{sub.productTitle}</p>
                      <p className="text-xs text-gray-500">{sub.variantTitle}</p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase ${sub.notified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right text-sm text-gray-900 font-bold">{new Date(sub.createdAt).toLocaleDateString()}</td>
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