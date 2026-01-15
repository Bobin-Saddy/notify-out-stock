import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { Mail, Users, MousePointerClick, ShoppingCart, Percent } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- BACKEND: LOAD REAL DATA ---
export async function loader({ request }) {
  await authenticate.admin(request);

  // 1. Fetch Summary Stats
  const totalRequests = await prisma.backInStock.count();
  const notificationsSent = await prisma.backInStock.count({ where: { notified: true } });
  const recentSubscribers = await prisma.backInStock.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  // 2. Trend Data (Last 7 Days)
  const historyRaw = await prisma.backInStock.findMany({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, notified: true }
  });

  const dateMap = {};
  historyRaw.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) dateMap[date] = { date, requests: 0, sent: 0 };
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
    trendData: Object.values(dateMap)
  });
}

// --- FRONTEND: UI COMPONENTS ---
export default function DynamicDashboard() {
  const { stats, recentSubscribers, trendData } = useLoaderData();

  const StatCard = ({ title, value, subtext }) => (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold mt-2 text-gray-900">{value}</p>
      {subtext && <p className="text-sm text-gray-400 mt-1">{subtext}</p>}
    </div>
  );

  return (
    <div className="bg-gray-50 min-h-screen p-8 font-sans text-gray-800">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-gray-100 px-4 py-2 rounded-md border text-sm font-medium">Settings</button>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-8 flex items-center text-blue-800 text-sm">
          <span className="mr-3">ℹ️</span>
          Tracking started on 15 Jan 2026. Metrics refresh hourly.
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Total Requests" value={stats.totalRequests} />
          <StatCard title="Notifications Sent" value={stats.notificationsSent} />
          <StatCard title="Delivery Rate" value={`${stats.deliveryRate}%`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Open Rate" value="0%" />
          <StatCard title="Click Rate" value="0%" />
          <StatCard title="Conversion Rate" value="0%" />
        </div>

        {/* Graphs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Trend Line Chart */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="font-bold mb-6">Requests and Notifications Trend</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={{r:4}} />
                  <Line type="monotone" dataKey="sent" stroke="#8b5cf6" strokeWidth={2} dot={{r:4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel/Performance Bar Chart */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="font-bold mb-6">Notification Performance Funnel</h2>
            <div className="space-y-4">
               <div>
                  <div className="flex justify-between text-xs mb-1"><span>Requested</span><span>{stats.totalRequests}</span></div>
                  <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{width: '100%'}}></div>
                  </div>
               </div>
               <div>
                  <div className="flex justify-between text-xs mb-1"><span>Sent</span><span>{stats.notificationsSent}</span></div>
                  <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden">
                    <div className="bg-blue-300 h-full" style={{width: stats.totalRequests > 0 ? `${(stats.notificationsSent/stats.totalRequests)*100}%` : '0%'}}></div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="p-4 border-b font-bold">Recent Subscribers</div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-semibold">Customer Email</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Created On</th>
              </tr>
            </thead>
            <tbody>
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-medium text-blue-600">{sub.email}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {sub.notified ? 'Notified' : 'Pending'}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">
                    {new Date(sub.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
              {recentSubscribers.length === 0 && (
                <tr><td colSpan="3" className="p-8 text-center text-gray-400">No subscribers found yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}