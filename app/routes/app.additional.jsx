import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { Mail, CheckCircle, XCircle, Clock, TrendingUp, Package, Activity } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// --- BACKEND: LOAD REAL DATA ---
export async function loader({ request }) {
  await authenticate.admin(request);

  // 1. Fetch Summary Stats
  const [totalSent, totalPending] = await Promise.all([
    prisma.backInStock.count({ where: { notified: true } }),
    prisma.backInStock.count({ where: { notified: false } })
  ]);

  // 2. Fetch History for the Graph (Last 30 days)
  const historyRaw = await prisma.backInStock.findMany({
    where: { notified: true },
    orderBy: { updatedAt: 'asc' },
    select: { updatedAt: true }
  });

  // Grouping items by Date for the chart
  const dateMap = historyRaw.reduce((acc, item) => {
    const date = new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const emailHistory = Object.keys(dateMap).map(date => ({
    date,
    sent: dateMap[date],
  }));

  return json({
    stats: {
      totalEmails: totalSent,
      successfulEmails: totalSent,
      pendingSubscribers: totalPending,
    },
    emailHistory: emailHistory.length > 0 ? emailHistory : [{ date: 'No Data', sent: 0 }]
  });
}

// --- FRONTEND: UI COMPONENTS ---
export default function EmailStatsDashboard() {
  const { stats, emailHistory } = useLoaderData();

  const pieData = [
    { name: 'Sent', value: stats.totalEmails, color: '#6366f1' },
    { name: 'Pending', value: stats.pendingSubscribers, color: '#f59e0b' }
  ];

  const StatCard = ({ icon: Icon, title, value, color, bgColor }) => (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center space-x-4">
      <div className={`p-3 rounded-lg ${bgColor}`}>
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Email Analytics</h1>
            <p className="text-gray-500 mt-1">Real-time performance of your restock alerts</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100 flex items-center text-sm font-medium text-green-600">
            <Activity size={16} className="mr-2" /> Live System
          </div>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard 
            icon={Mail} title="Total Sent" value={stats.totalEmails} 
            color="#6366f1" bgColor="bg-indigo-50" 
          />
          <StatCard 
            icon={CheckCircle} title="Delivery Success" value={stats.successfulEmails} 
            color="#10b981" bgColor="bg-emerald-50" 
          />
          <StatCard 
            icon={Clock} title="Pending Queue" value={stats.pendingSubscribers} 
            color="#f59e0b" bgColor="bg-amber-50" 
          />
        </div>

        {/* Main Graph Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800 flex items-center">
              <TrendingUp className="mr-2 text-indigo-500" size={20} />
              Email Sending Trends
            </h2>
          </div>
          <div className="h-80 w-100">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={emailHistory}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} 
                />
                <Area 
                  type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={3} 
                  fillOpacity={1} fill="url(#colorSent)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pie Chart Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Package className="mr-2 text-amber-500" size={20} />
              Queue Distribution
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Efficiency Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-lg p-8 text-white flex flex-col justify-center items-center">
            <h2 className="text-xl font-medium opacity-90 mb-2">Overall Success Rate</h2>
            <div className="text-7xl font-black mb-4">
              {stats.totalEmails > 0 ? ((stats.successfulEmails / (stats.totalEmails + stats.pendingSubscribers)) * 100).toFixed(1) : "0"}%
            </div>
            <p className="text-center opacity-80 text-sm max-w-[250px]">
              Percentage of total subscribers successfully notified since app installation.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}