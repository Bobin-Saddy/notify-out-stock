import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- BACKEND: LOAD DATA FILTERED BY SHOP ---
export async function loader({ request }) {
  // session provides the unique shop domain (e.g., store-name.myshopify.com)
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch Summary Stats - Scoped to this shop only
  const [totalRequests, notificationsSent] = await Promise.all([
    prisma.backInStock.count({ 
        where: { shop: shop } 
    }),
    prisma.backInStock.count({ 
        where: { shop: shop, notified: true } 
    })
  ]);

  // 2. Recent Subscribers - Scoped to this shop only
  const recentSubscribers = await prisma.backInStock.findMany({
    where: { shop: shop },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  // 3. Trend Data Logic - Scoped to this shop only
  const historyRaw = await prisma.backInStock.findMany({
    where: { shop: shop },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, notified: true }
  });

  // Group data points by date
  const dateMap = {};
  historyRaw.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) dateMap[date] = { name: date, requests: 0, sent: 0 };
    dateMap[date].requests += 1;
    if (item.notified) dateMap[date].sent += 1;
  });

  return json({
    shop, // Passing shop name to the UI for reference
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0,
    },
    recentSubscribers,
    trendData: Object.values(dateMap).length > 0 ? Object.values(dateMap) : [{name: 'No Data', requests: 0, sent: 0}]
  });
}

// --- FRONTEND: RENDER DASHBOARD ---
export default function BackInStockDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();

  return (
    <div style={{ backgroundColor: '#f6f6f7', minHeight: '100vh', padding: '40px', fontFamily: 'sans-serif' }}>
      
      {/* Tailwind CDN for reliable styling */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-gray-500 text-sm">Viewing analytics for: <strong>{shop}</strong></p>
          </div>
          <button className="bg-white border border-gray-300 px-4 py-1 rounded shadow-sm text-sm font-medium">Settings</button>
        </div>

        {/* KPI Grid (Filtered) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Total Requests</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{stats.totalRequests}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Notifications Sent</p>
            <p className="text-3xl font-bold mt-1 text-purple-600">{stats.notificationsSent}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase italic">Delivery Rate</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{stats.deliveryRate}%</p>
          </div>
        </div>

        {/* Graphs (Filtered) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-bold text-sm mb-6 text-gray-800 uppercase italic">Requests Trend ({shop})</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="#0080ff" strokeWidth={2} dot={{r: 4}} />
                  <Line type="monotone" dataKey="sent" stroke="#8e44ad" strokeWidth={2} dot={{r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-bold text-sm mb-6 text-gray-800 uppercase italic">Performance Funnel</h3>
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex justify-between text-xs mb-2 text-gray-500 font-bold uppercase italic"><span>Requested</span><span>{stats.totalRequests}</span></div>
                <div className="w-full bg-gray-100 h-6 rounded-sm"><div className="bg-blue-400 h-full rounded-sm" style={{width: '100%'}}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2 text-gray-500 font-bold uppercase italic"><span>Sent</span><span>{stats.notificationsSent}</span></div>
                <div className="w-full bg-gray-100 h-6 rounded-sm"><div className="bg-purple-400 h-full rounded-sm" style={{width: stats.totalRequests > 0 ? `${(stats.notificationsSent/stats.totalRequests)*100}%` : '0%'}}></div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Table (Filtered) */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 text-gray-800 font-bold text-sm uppercase italic">
            Recent Activity for {shop}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-gray-500 border-b border-gray-100">
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
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {sub.notified ? 'Notified' : 'Waiting'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {recentSubscribers.length === 0 && (
                  <tr><td colSpan="3" className="px-6 py-10 text-center text-gray-400 italic">No subscribers found for this store yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}