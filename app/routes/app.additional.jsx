import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar 
} from 'recharts';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop; // Scopes all data to this specific store

  // 1. Fetch KPI Stats
  const [totalRequests, notificationsSent] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } })
  ]);

  // 2. Fetch Recent Subscribers
  const recentSubscribers = await prisma.backInStock.findMany({
    where: { shop },
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  // 3. Trend Data Logic
  const historyRaw = await prisma.backInStock.findMany({
    where: { shop },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, notified: true }
  });

  const dateMap = {};
  historyRaw.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) dateMap[date] = { name: date, requests: 0, sent: 0 };
    dateMap[date].requests += 1;
    if (item.notified) dateMap[date].sent += 1;
  });

  return json({
    shop,
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0,
    },
    recentSubscribers,
    trendData: Object.values(dateMap),
    // Data for Doughnut and Revenue charts
    channelData: [{ name: 'Email', value: totalRequests }],
    revenueData: [{ name: 'Email', value: 0 }]
  });
}

export default function FullDashboard() {
  const { stats, recentSubscribers, trendData, channelData, revenueData, shop } = useLoaderData();

  const COLORS = ['#0080ff', '#8e44ad', '#2ecc71', '#f1c40f'];

  return (
    <div className="min-h-screen p-8 bg-[#f4f6f8] font-sans text-[#202223]">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor Back In Stock notification performance for {shop}.</p>
          </div>
          <button className="px-4 py-1 text-sm font-medium bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50">Settings</button>
        </div>

        {/* Info Banner */}
        <div className="flex items-center p-3 mb-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <span className="flex items-center justify-center w-5 h-5 mr-3 text-xs text-white bg-blue-500 rounded-full italic font-serif">i</span>
          <p className="text-[13px] text-gray-600">Tracking started on 15 Jan 2026. Activity before this date is not included. Metrics refresh hourly. Last updated 15 Jan 2026, 8:00 AM.</p>
        </div>

        {/* Top Filters */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <select className="p-2 text-sm bg-white border border-gray-300 rounded"><option>Last 7 days</option></select>
          <input className="p-2 text-sm bg-white border border-gray-300 rounded" placeholder="Product Search" />
          <input className="p-2 text-sm bg-gray-100 border border-gray-300 rounded" placeholder="Variant Search" disabled />
          <select className="p-2 text-sm bg-white border border-gray-300 rounded"><option>All channels</option></select>
        </div>

        {/* KPI Grid (Top 3 & Bottom 3) */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Total Requests', val: stats.totalRequests },
            { label: 'Notifications Sent', val: stats.notificationsSent },
            { label: 'Delivery Rate', val: `${stats.deliveryRate}%` }
          ].map((kpi) => (
            <div key={kpi.label} className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{kpi.label}</p>
              <p className="mt-1 text-2xl font-bold">{kpi.val}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {['Open Rate', 'Click Rate', 'Conversion Rate'].map((label) => (
            <div key={label} className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{label}</p>
              <p className="mt-1 text-2xl font-bold">0%</p>
            </div>
          ))}
        </div>

        {/* Trend & Funnel Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h3 className="mb-8 text-sm font-bold text-gray-700 uppercase italic">Requests and Notifications Trend</h3>
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/><XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false}/><YAxis fontSize={10} axisLine={false} tickLine={false}/><Tooltip /><Line type="monotone" dataKey="requests" stroke="#3498db" strokeWidth={2} dot={{r:3}}/><Line type="monotone" dataKey="sent" stroke="#9b59b6" strokeWidth={2} dot={{r:3}}/></LineChart></ResponsiveContainer></div>
          </div>

          <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h3 className="mb-6 text-sm font-bold text-gray-700 uppercase italic">Notification Performance Funnel</h3>
            <div className="space-y-4 pt-2">
              {['Requested', 'Sent', 'Opened', 'Clicked', 'Purchased'].map((item, idx) => (
                <div key={item}>
                  <div className="flex justify-between mb-1 text-[11px] font-medium"><span>{item}</span><span>{idx === 0 ? stats.totalRequests : 0}</span></div>
                  <div className="w-full h-[10px] bg-gray-100 rounded-full overflow-hidden">
                    <div className="bg-[#47c1f0] h-full" style={{ width: idx === 0 && stats.totalRequests > 0 ? '100%' : '1%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performing Products */}
        <div className="mb-8 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 text-sm font-bold border-b border-gray-100 italic uppercase">Top Performing Products</div>
          <table className="w-full text-xs text-left">
            <thead className="text-gray-400 bg-gray-50 border-b border-gray-100">
              <tr><th className="p-3 font-medium">Product</th><th className="p-3 font-medium">Requests</th><th className="p-3 font-medium">Sent</th><th className="p-3 font-medium">Open Rate</th><th className="p-3 font-medium text-right">Revenue</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="hover:bg-gray-50">
                <td className="p-3 flex items-center"><div className="w-8 h-8 bg-gray-100 mr-3 rounded border"></div>The Collection Snowboard: Liquid</td>
                <td className="p-3 font-bold">{stats.totalRequests}</td><td className="p-3">0</td><td className="p-3">0%</td><td className="p-3 text-right font-bold">$0.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Recent Subscribers */}
        <div className="mb-8 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 text-sm font-bold border-b border-gray-100 italic uppercase">Recent Subscribers</div>
          <table className="w-full text-[11px] text-left">
            <thead className="text-gray-400 bg-gray-50">
              <tr><th className="p-3">Customer Email</th><th className="p-3">Product</th><th className="p-3">Status</th><th className="p-3 text-right">Created On</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentSubscribers.map(sub => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="p-3 text-blue-500 font-medium">{sub.email}</td>
                  <td className="p-3 text-gray-500">Snowboard: Liquid</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{sub.notified ? 'Sent' : 'Pending'}</span></td>
                  <td className="p-3 text-right text-gray-400">{new Date(sub.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Analytics Row */}
        <div className="grid grid-cols-2 gap-6 pb-12">
          <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h3 className="mb-6 text-sm font-bold text-gray-700 uppercase italic">Channel Split Analytics</h3>
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={channelData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{channelData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          </div>
          <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h3 className="mb-6 text-sm font-bold text-gray-700 uppercase italic">Revenue by Channel</h3>
            <div className="h-56 flex items-end justify-start space-x-2 border-l border-b border-blue-200 p-4">
              <div className="w-1 bg-blue-400 h-1 relative"><span className="absolute -top-6 left-0 text-[10px]">0</span><span className="absolute -bottom-6 -left-2 text-[10px] text-gray-400">Email</span></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}