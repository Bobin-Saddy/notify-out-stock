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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6 md:p-10">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section (Same as your code) */}
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

        {/* Filter Bar (Same as your code) */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-6">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Search</label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" name="search" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Email or variant ID..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500" />
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
              <div className="flex items-end">
                <button type="submit" className="w-full bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold">Apply</button>
              </div>
            </form>
          </div>
        )}

        {/* Metric Cards (Same as your code) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests.toLocaleString()} icon={ShoppingBag} gradient="bg-gradient-to-br from-blue-500 to-blue-600" trend="+12%" />
          <MetricCard title="Sent" value={stats.notificationsSent.toLocaleString()} icon={Bell} gradient="bg-gradient-to-br from-green-500 to-green-600" trend="+8%" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} gradient="bg-gradient-to-br from-pink-500 to-pink-600" />
          <MetricCard title="CTR" value={`${stats.conversionRate}%`} icon={MousePointer2} gradient="bg-gradient-to-br from-purple-500 to-purple-600" />
        </div>

        {/* UPDATED CHART SECTION (Graphs implementation) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Requests and Notifications Trend (4 Bar Chart) */}
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
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Notification Performance Funnel */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-50">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-8">Notification Performance Funnel</h3>
            <div className="space-y-7">
              {[
                { label: 'Requests', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-500' },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500' },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-purple-500' }
              ].map((item, idx) => {
                const percentage = stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="text-gray-900">{item.val.toLocaleString()} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-1000`} style={{ width: `${Math.max(percentage, 2)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Subscribers Table (Same structure as your code) */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Recent Requests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase tracking-wider">Engagement</th>
                  <th className="px-6 py-4 text-right text-xs font-black text-gray-600 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50 transition-colors group">
                    <td className="px-6 py-5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                        {sub.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-gray-900">{sub.email}</span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{sub.productTitle}</p>
                      <p className="text-xs text-gray-500">{sub.variantTitle}</p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${sub.opened ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-400'}`}>Opened</span>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${sub.clicked ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>Clicked</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right font-bold text-sm text-gray-900">
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