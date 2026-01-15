import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell
} from 'recharts';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);

  // Database Queries
  const totalRequests = await prisma.backInStock.count();
  const notificationsSent = await prisma.backInStock.count({ where: { notified: true } });
  
  const recentSubscribers = await prisma.backInStock.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  // Trend Data Logic
  const historyRaw = await prisma.backInStock.findMany({
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
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0,
    },
    recentSubscribers,
    trendData: Object.values(dateMap).length > 0 ? Object.values(dateMap) : [{name: 'Jan 15', requests: 0, sent: 0}]
  });
}

export default function BackInStockDashboard() {
  const { stats, recentSubscribers, trendData } = useLoaderData();

  return (
    <div style={{ backgroundColor: '#f6f6f7', minHeight: '100vh', padding: '40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      
      {/* Tailwind CDN Link for Backup */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-gray-500 text-sm">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-white border border-gray-300 px-4 py-1 rounded shadow-sm text-sm font-medium">Settings</button>
        </div>

        {/* Banner */}
        <div className="bg-white border border-gray-200 p-4 rounded-lg mb-8 flex items-center shadow-sm text-sm">
          <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center mr-3 text-xs">i</span>
          <span className="text-gray-600">Tracking started on 15 Jan 2026. Activity before this date is not included. Metrics refresh hourly.</span>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Total Requests</p>
            <p className="text-3xl font-bold mt-1">{stats.totalRequests}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Notifications Sent</p>
            <p className="text-3xl font-bold mt-1">{stats.notificationsSent}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Delivery Rate</p>
            <p className="text-3xl font-bold mt-1">{stats.deliveryRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Open Rate</p>
            <p className="text-3xl font-bold mt-1">0%</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Click Rate</p>
            <p className="text-3xl font-bold mt-1">0%</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Conversion Rate</p>
            <p className="text-3xl font-bold mt-1">0%</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-bold text-sm mb-6 text-gray-800 uppercase italic">Requests and Notifications Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="#0080ff" strokeWidth={2} dot={{fill: '#0080ff', r: 4}} />
                  <Line type="monotone" dataKey="sent" stroke="#8e44ad" strokeWidth={2} dot={{fill: '#8e44ad', r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-bold text-sm mb-6 text-gray-800 uppercase italic">Notification Performance Funnel</h3>
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between text-xs mb-2 text-gray-500 font-bold uppercase italic"><span>Requested</span><span>{stats.totalRequests}</span></div>
                <div className="w-full bg-gray-100 h-6 rounded-sm"><div className="bg-blue-400 h-full rounded-sm" style={{width: '100%'}}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2 text-gray-500 font-bold uppercase italic"><span>Sent</span><span>{stats.notificationsSent}</span></div>
                <div className="w-full bg-gray-100 h-6 rounded-sm"><div className="bg-blue-300 h-full rounded-sm" style={{width: stats.totalRequests > 0 ? `${(stats.notificationsSent/stats.totalRequests)*100}%` : '0%'}}></div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800 uppercase italic">Recent Subscribers</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 font-semibold uppercase italic text-xs">Customer Email</th>
                  <th className="px-6 py-3 font-semibold uppercase italic text-xs">Status</th>
                  <th className="px-6 py-3 font-semibold uppercase italic text-xs text-right">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-blue-600 font-medium">{sub.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">
                      {new Date(sub.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
                {recentSubscribers.length === 0 && (
                  <tr><td colSpan="3" className="px-6 py-10 text-center text-gray-400 italic">No subscribers found yet. Data will appear once users sign up.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}