import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "@remix-run/react";
import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, ShoppingBag, Search, Settings, CheckCircle2, TrendingUp
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  const searchQuery = url.searchParams.get("search") || "";
  const variantSearch = url.searchParams.get("variant") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";

  const dateFilterStart = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  // Filters for Database
  const whereClause = {
    shop,
    createdAt: { gte: dateFilterStart },
    ...(searchQuery && { email: { contains: searchQuery, mode: 'insensitive' } }),
    ...(variantSearch && { variantId: { contains: variantSearch, mode: 'insensitive' } }),
  };

  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ where: { shop, createdAt: { gte: dateFilterStart } } }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } })
  ]);

  // Aggregate Stats
  const stats = {
    totalRequests: allRecords.length,
    notificationsSent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
  };

  // enriched subscribers with Shopify Product Titles
  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query { productVariant(id: "gid://shopify/ProductVariant/${sub.variantId}") { 
            displayName product { title } 
          } }`);
        const { data } = await response.json();
        return { ...sub, 
          productTitle: data?.productVariant?.product?.title || 'Unknown Product',
          variantTitle: data?.productVariant?.displayName || 'N/A'
        };
      } catch { return { ...sub, productTitle: 'Deleted Product', variantTitle: 'N/A' }; }
    })
  );

  // Group by Date for Chart
  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Notifications: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Notifications++;
    return acc;
  }, {}));

  return json({ stats, subscribers: enrichedSubscribers, trendData, filters: { searchQuery, variantSearch, dateFilter } });
}

export default function Dashboard() {
  const { stats, subscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const metrics = [
    { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.notificationsSent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: stats.totalRequests ? Math.round((stats.notificationsSent / stats.totalRequests) * 100) + '%' : '0%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Open Rate', val: stats.notificationsSent ? Math.round((stats.opened / stats.notificationsSent) * 100) + '%' : '0%', icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Click Rate', val: stats.notificationsSent ? Math.round((stats.clicked / stats.notificationsSent) * 100) + '%' : '0%', icon: MousePointer2, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Conversion Rate', val: '34%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-xs text-gray-500">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
            <Settings size={16} /> Settings
          </button>
        </div>

        {/* Filters Bar */}
        <Form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-4 gap-4">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white border p-2 rounded-lg text-sm outline-none">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <input name="search" placeholder="Product Search" defaultValue={filters.searchQuery} className="bg-white border p-2 rounded-lg text-sm outline-none" />
          <input name="variant" placeholder="Variant Search" defaultValue={filters.variantSearch} className="bg-white border p-2 rounded-lg text-sm outline-none" />
          <select className="bg-white border p-2 rounded-lg text-sm outline-none">
            <option>All Channels</option>
          </select>
        </Form>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm">
              <div className={`p-3 rounded-xl ${m.bg} ${m.color}`}><m.icon size={20} /></div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase">{m.label}</p>
                <p className="text-2xl font-bold">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-6">Requests and Notifications Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#999'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#999'}} />
                  <Tooltip cursor={{fill: '#f9f9f9'}} />
                  <Legend verticalAlign="bottom" height={36}/>
                  <Bar dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-6">Notification Performance Funnel</h3>
            <div className="space-y-5">
              {['Request', 'Sent', 'Opened', 'Clicked', 'Purchased'].map((step, idx) => (
                <div key={step} className="flex items-center gap-4">
                   <span className="text-xs text-gray-500 w-20">{step}</span>
                   <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${60 - (idx * 10)}%` }}></div>
                   </div>
                   <span className="text-xs text-gray-400">50%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performing Section */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4">Top Performing Products</h3>
          <div className="border border-dashed rounded-xl p-10 text-center">
            <p className="text-sm font-bold text-gray-800">No data found</p>
            <p className="text-xs text-gray-500">Data will appear here once customers request a back-in-stock notification.</p>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <h3 className="font-bold">Recent Subscribers</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase bg-gray-50/50">
                <th className="px-6 py-4">Customer Email</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Variant</th>
                <th className="px-6 py-4">Channel</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscribers.map((sub) => (
                <tr key={String(sub.id)} className="text-sm hover:bg-gray-50/50">
                  <td className="px-6 py-4 text-blue-600">{sub.email}</td>
                  <td className="px-6 py-4 text-blue-600 font-medium">{sub.productTitle}</td>
                  <td className="px-6 py-4 text-gray-500">-</td>
                  <td className="px-6 py-4 text-gray-500">78.9%</td>
                  <td className="px-6 py-4">
                    <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[11px] font-bold uppercase">
                      In progress
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}