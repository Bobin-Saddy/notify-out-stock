import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Mail, CheckCircle, XCircle, Clock, TrendingUp, Package, Users } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- BACKEND: LOAD DATA FOR DASHBOARD ---
export async function loader({ request }) {
  await authenticate.admin(request);

  const totalEmailsSent = await prisma.backInStock.count({ where: { notified: true } });
  const pendingSubscribers = await prisma.backInStock.count({ where: { notified: false } });
  
  const historyRaw = await prisma.backInStock.findMany({
    where: { notified: true },
    orderBy: { createdAt: 'asc' }, // Changed from updatedAt
    select: { createdAt: true }    // Changed from updatedAt
  });

  const dailyGroups = historyRaw.reduce((acc, item) => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const emailHistory = Object.keys(dailyGroups).map(date => ({
    date,
    sent: dailyGroups[date],
    failed: 0, // In the future, add a 'status' field to Prisma to track this
    pending: pendingSubscribers / 7 // Estimating distribution for visual
  }));

  return json({
    stats: {
      totalEmails: totalEmailsSent,
      successfulEmails: totalEmailsSent,
      failedEmails: 0, 
      pendingSubscribers: pendingSubscribers,
      outOfStockAlerts: 0, // This would require a separate log table
      backInStockAlerts: totalEmailsSent
    },
    emailHistory
  });
}

// --- BACKEND: WEBHOOK ACTION (Your existing logic) ---
export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  try {
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            price
            product { title, featuredImage { url } }
          }
        }
        shop { currencyCode }
      }
    `);

    const jsonRes = await response.json();
    const variant = jsonRes.data?.inventoryItem?.variant;
    if (!variant) return new Response("Variant not found", { status: 200 });

    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId, notified: false },
    });

    if (available > 0 && subscribers.length > 0) {
      for (const sub of subscribers) {
        // ... (Your sendEmail logic here) ...
        await prisma.backInStock.update({ 
          where: { id: sub.id }, 
          data: { notified: true, updatedAt: new Date() } 
        });
      }
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}

// --- FRONTEND: DASHBOARD COMPONENT ---
export default function EmailStatsDashboard() {
  const { stats, emailHistory } = useLoaderData();

  const pieData = [
    { name: 'Successful', value: stats.successfulEmails, color: '#10b981' },
    { name: 'Failed', value: stats.failedEmails, color: '#ef4444' },
    { name: 'Pending', value: stats.pendingSubscribers, color: '#f59e0b' }
  ];

  const StatCard = ({ icon: Icon, title, value, color, bgColor }) => (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2" style={{ color }}>{value.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-full" style={{ backgroundColor: bgColor }}>
          <Icon size={32} style={{ color }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800">📊 Real-Time Stats</h1>
          <p className="text-gray-600">Dynamic data from Prisma Database</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={Mail} title="Sent" value={stats.totalEmails} color="#667eea" bgColor="#eef2ff" />
          <StatCard icon={CheckCircle} title="Success" value={stats.successfulEmails} color="#10b981" bgColor="#d1fae5" />
          <StatCard icon={Clock} title="Waiting" value={stats.pendingSubscribers} color="#f59e0b" bgColor="#fef3c7" />
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Notification Trends</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={emailHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="#10b981" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Simplified Pie Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
           <h2 className="text-xl font-bold mb-4">Distribution</h2>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                   {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                 </Pie>
                 <Tooltip />
               </PieChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
}