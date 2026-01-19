import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { 
  FileText, Bell, Eye, MousePointer2, TrendingUp, Search, Filter, Download, ShoppingBag
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
  const dateFilterStart = new Date(now.getTime() - (dateFilter === "all" ? 10000 : parseInt(dateFilter)) * 24 * 60 * 60 * 1000);

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
    } catch (e) { topProducts.push({ variantId, productTitle: 'Unknown', variantTitle: 'Unknown', count }); }
  }

  const enrichedSubscribers = await Promise.all(recentSubscribers.map(async (sub) => {
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
      return { ...sub, productTitle: variant?.product?.title || 'Unknown', variantTitle: variant?.displayName || 'Unknown', sku: variant?.sku || 'N/A' };
    } catch (e) { return { ...sub, productTitle: 'Unknown', variantTitle: 'Unknown', sku: 'N/A' }; }
  }));

  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) dateMap[date] = { name: date, Requests: 0, Notifications: 0 };
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
  });

  return json({
    stats: { 
      totalRequests, 
      notificationsSent, 
      emailsOpened, 
      emailsClicked,
      conversionRate: notificationsSent > 0 ? ((emailsClicked / notificationsSent) * 100).toFixed(1) : 0,
      openRate: notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(1) : 0
    },
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

  const funnelData = [
    { label: 'Requests', value: stats.totalRequests, color: '#3b82f6' },
    { label: 'Sent', value: stats.notificationsSent, color: '#3b82f6' },
    { label: 'Opened', value: stats.emailsOpened, color: '#3b82f6' },
    { label: 'Clicked', value: stats.emailsClicked, color: '#3b82f6' },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    submit(new FormData(e.target), { method: "get" });
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, gradient, trend }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${gradient} text-white`}>
          <Icon size={20} />
        </div>
        {trend && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">{trend}</span>}
      </div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-10 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Analytics Overview</h1>
            <p className="text-sm text-gray-500">Track your store performance</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 shadow-sm"><Filter size={16}/>Filters</button>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700">Export Report</button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input type="text" name="search" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search email..." className="md:col-span-2 px-4 py-2 border rounded-xl" />
              <select name="dateRange" defaultValue={filters.dateRange} className="px-4 py-2 border rounded-xl">
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>
              <button type="submit" className="bg-gray-900 text-white rounded-xl font-bold">Apply</button>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests} icon={ShoppingBag} gradient="bg-blue-500" trend="+12%" />
          <MetricCard title="Sent" value={stats.notificationsSent} icon={Bell} gradient="bg-green-500" trend="+8%" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} gradient="bg-pink-500" />
          <MetricCard title="CTR" value={`${stats.conversionRate}%`} icon={MousePointer2} gradient="bg-purple-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Trend Chart - Matches Reference Style */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Requests and Notifications Trend</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar name="Notifications" dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel - Matches Reference Style */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Notification Performance Funnel</h3>
            <div className="space-y-6 pt-4">
              {funnelData.map((item, idx) => {
                const percentage = stats.totalRequests > 0 ? (item.value / stats.totalRequests) * 100 : 0;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-500">{item.label}</span>
                      <span className="text-sm font-bold text-gray-400">{percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-center pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-xs font-bold text-gray-600">Funnel Performance</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Recent Activity</h3>
            <button className="text-blue-600 text-sm font-bold">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest font-black">
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-sm text-gray-700">{sub.email}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-800">{sub.productTitle}</p>
                      <p className="text-xs text-gray-400">{sub.variantTitle}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{new Date(sub.createdAt).toLocaleDateString()}</td>
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