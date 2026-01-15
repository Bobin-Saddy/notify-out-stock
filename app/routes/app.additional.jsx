import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- 1. BACKEND: LOADER (Sirf current store ka data load karega) ---
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop; // Current shop domain (e.g., myshop.myshopify.com)

  // Database se sirf is shop ka data count aur fetch karna
  const [totalRequests, notificationsSent] = await Promise.all([
    prisma.backInStock.count({ where: { shop: shop } }),
    prisma.backInStock.count({ where: { shop: shop, notified: true } })
  ]);

  const recentSubscribers = await prisma.backInStock.findMany({
    where: { shop: shop },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  const historyRaw = await prisma.backInStock.findMany({
    where: { shop: shop },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, notified: true }
  });

  // Trend Data logic
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
    trendData: Object.values(dateMap)
  });
}

// --- 2. BACKEND: ACTION (Webhook logic jo unique shop handle karega) ---
export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  if (available > 0) {
    // Sirf wahi subscribers uthao jo is specific shop ke hain
    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId, 
        shop: shop, 
        notified: false 
      },
    });

    for (const sub of subscribers) {
      // Email sending logic (Resend/SendGrid) yahan aayegi
      
      // Update entry for this specific shop
      await prisma.backInStock.update({ 
        where: { id: sub.id }, 
        data: { notified: true, updatedAt: new Date() } 
      });
    }
  }
  return new Response("OK", { status: 200 });
}

// --- 3. FRONTEND: UI DESIGN (Image ke according dynamic layout) ---
export default function BackInStockDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();

  return (
    <div className="min-h-screen p-10" style={{ backgroundColor: '#f6f6f7', fontFamily: 'sans-serif' }}>
      {/* Tailwind CDN for styling consistency */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500 italic uppercase">Current Store: {shop}</p>
          </div>
          <button className="bg-white border border-gray-300 px-4 py-2 rounded text-sm font-medium shadow-sm">Settings</button>
        </div>

        {/* Dynamic KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest italic">Total Requests</p>
            <p className="text-4xl font-extrabold mt-2 text-gray-900">{stats.totalRequests}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest italic">Notifications Sent</p>
            <p className="text-4xl font-extrabold mt-2 text-gray-900">{stats.notificationsSent}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest italic">Delivery Rate</p>
            <p className="text-4xl font-extrabold mt-2 text-gray-900">{stats.deliveryRate}%</p>
          </div>
        </div>

        {/* Requests Trend Graph */}
        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm mb-8">
          <h3 className="text-sm font-bold text-gray-800 uppercase italic mb-8">Requests and Notifications Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#999'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#999'}} />
                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                <Line type="monotone" dataKey="requests" name="Requests" stroke="#0080ff" strokeWidth={3} dot={{r: 4, fill: '#0080ff'}} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke="#8e44ad" strokeWidth={3} dot={{r: 4, fill: '#8e44ad'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-800 uppercase italic">Recent Subscribers</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase italic border-b border-gray-100">
                <th className="px-6 py-4">Customer Email</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {sub.notified ? 'Notified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400">
                    {new Date(sub.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
              {recentSubscribers.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-6 py-12 text-center text-gray-400 italic">No subscribers found for {shop} yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}