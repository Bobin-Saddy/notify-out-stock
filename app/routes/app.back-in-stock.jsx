import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, Settings, CheckCircle2, TrendingUp, Mail, Package, Search
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

  // Real Counts
  const stats = {
    total: allRecords.length,
    sent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length,
  };

  // Enriched Table Data
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

  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Sent++;
    if (curr.opened) acc[date].Opened++;
    if (curr.clicked) acc[date].Clicked++;
    return acc;
  }, {}));

  return json({ stats, subscribers: enrichedSubscribers, trendData, filters: { searchQuery, variantSearch, dateFilter } });
}

export default function Dashboard() {
  const { stats, subscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  // Funnel logic: Always compare to total requests
  const getPct = (val) => (stats.total > 0 ? Math.round((val / stats.total) * 100) : 0);

  const metrics = [
    { label: 'Total Requests', val: stats.total, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.sent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: getPct(stats.sent) + '%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Open Rate', val: getPct(stats.opened) + '%', icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Click Rate', val: getPct(stats.clicked) + '%', icon: MousePointer2, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Conversion Rate', val: getPct(stats.purchased) + '%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const funnelSteps = [
    { label: 'Request', val: stats.total, pct: 100 },
    { label: 'Sent', val: stats.sent, pct: getPct(stats.sent) },
    { label: 'Opened', val: stats.opened, pct: getPct(stats.opened) },
    { label: 'Clicked', val: stats.clicked, pct: getPct(stats.clicked) },
    { label: 'Purchased', val: stats.purchased, pct: getPct(stats.purchased) },
  ];

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans text-gray-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-black text-white px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium">
            <Settings size={16} /> Settings
          </button>
        </div>

        {/* Filters */}
        <Form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-4 gap-4">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <div className="relative col-span-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
            <input name="search" placeholder="Product Search" defaultValue={filters.searchQuery} className="w-full bg-white border border-gray-200 p-2.5 pl-10 rounded-xl text-sm outline-none shadow-sm" />
          </div>
          <input name="variant" placeholder="Variant Search" defaultValue={filters.variantSearch} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm" />
          <select className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm">
            <option>All Channels</option>
          </select>
        </Form>

        {/* 6 Grid Metrics */}
        <div className="grid grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-xl ${m.bg} ${m.color}`}><m.icon size={22} /></div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{m.label}</p>
                <p className="text-2xl font-black">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts & Funnel */}
        <div className="grid grid-cols-12 gap-6">
          {/* Trend Chart */}
          <div className="col-span-8 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-8 text-gray-800">Requests and Notifications Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{paddingTop: '20px'}}/>
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar name="Opened" dataKey="Opened" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel */}
          <div className="col-span-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-8 text-gray-800">Notification Performance Funnel</h3>
            <div className="space-y-6">
              {funnelSteps.map((step) => (
                <div key={step.label} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wide">
                    <span>{step.label}</span>
                    <span className="text-gray-900">{step.val}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${step.pct}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 w-8">{step.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performing Products Section */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 text-gray-800">Top Performing Products</h3>
          <div className="border border-dashed border-gray-200 rounded-2xl py-12 flex flex-col items-center justify-center text-center">
            <div className="bg-gray-50 p-4 rounded-full mb-3 text-gray-300">
               <Package size={32} />
            </div>
            <p className="text-sm font-bold text-gray-800">No data found</p>
            <p className="text-xs text-gray-500">Data will appear here once customers request a back-in-stock notification.</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold">Recent Subscribers</h3>
            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-tighter">Live Updates</span>
          </div>
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-widest">
              <tr>
                <th className="px-8 py-4">Customer Email</th>
                <th className="px-8 py-4">Product</th>
                <th className="px-8 py-4">Variant</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscribers.length > 0 ? subscribers.map((sub) => (
                <tr key={sub.id} className="text-sm hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-8 py-5 font-medium text-gray-700">{sub.productTitle}</td>
                  <td className="px-8 py-5 text-gray-500 text-xs">{sub.variantTitle || '-'}</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                      {sub.notified ? 'Notified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-gray-400 text-xs font-medium">
                    {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan="5" className="px-8 py-10 text-center text-gray-400 italic text-sm">No recent activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}