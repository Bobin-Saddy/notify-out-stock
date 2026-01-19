import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  FileText, Bell, Truck, Eye, MousePointer2, TrendingUp, Search, Settings
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";

  const now = new Date();
  const dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const whereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { variantId: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }),
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } })
  };

  // 1. Fetching ACTUAL COUNTS from DB
  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers
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
      take: 10, 
      orderBy: { createdAt: 'desc' } 
    })
  ]);

  // 2. Trend Data with Actual Daily Counts
  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Sent: 0, Opens: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Sent += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
  });

  return json({
    stats: { 
      totalRequests, 
      notificationsSent, 
      emailsOpened, 
      emailsClicked 
    },
    recentSubscribers,
    trendData: Object.values(dateMap),
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const MetricCard = ({ title, value, icon: Icon, color, iconColor }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
        <Icon size={24} className={iconColor} />
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 md:p-10 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Back In Stock Dashboard</h1>
          <button className="bg-black text-white px-6 py-2 rounded-full text-xs font-bold uppercase shadow-sm">Settings</button>
        </div>

        {/* Stats Grid - Now Showing Actual Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests} icon={FileText} color="bg-blue-100" iconColor="text-blue-600" />
          <MetricCard title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="bg-green-100" iconColor="text-green-600" />
          <MetricCard title="Emails Opened" value={stats.emailsOpened} icon={Eye} color="bg-pink-100" iconColor="text-pink-600" />
          <MetricCard title="Link Clicks" value={stats.emailsClicked} icon={MousePointer2} color="bg-purple-100" iconColor="text-purple-600" />
        </div>

        {/* Middle Section */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Chart with Real Numbers */}
          <div className="lg:col-span-3 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-6 uppercase tracking-wider">Requests vs Interactions</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <Tooltip cursor={{fill: '#f9f9f9'}} />
                  <Legend iconType="circle" />
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Opens" dataKey="Opens" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel - Counts & Percentage */}
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-6 uppercase tracking-wider">Performance Funnel</h3>
            <div className="space-y-6">
              {[
                { label: 'Total Requests', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-500' },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500' },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-purple-500' }
              ].map((item) => {
                const percent = stats.totalRequests > 0 ? Math.round((item.val / stats.totalRequests) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] font-black uppercase text-gray-400 mb-1.5">
                      <span>{item.label} <span className="text-gray-900 ml-1">({item.val})</span></span>
                      <span>{percent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-50 rounded-full border border-gray-100 overflow-hidden">
                      <div className={`${item.color} h-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Subscribers List */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50">
            <h3 className="text-sm font-bold uppercase tracking-wider">Recent Subscribers</h3>
          </div>
          <table className="w-full text-left">
            <thead className="bg-[#FAFAFA] text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Customer Email</th>
                <th className="px-8 py-4 text-center">Open Status</th>
                <th className="px-8 py-4 text-center">Click Status</th>
                <th className="px-8 py-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="text-xs text-gray-600">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-5 font-bold text-blue-600">{sub.email}</td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${sub.opened ? 'bg-pink-50 text-pink-500 border border-pink-100' : 'bg-gray-50 text-gray-300'}`}>
                      {sub.opened ? 'Opened' : 'Unopened'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${sub.clicked ? 'bg-purple-50 text-purple-500 border border-purple-100' : 'bg-gray-50 text-gray-300'}`}>
                      {sub.clicked ? 'Clicked' : 'No Click'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right text-gray-400 font-medium">
                    {new Date(sub.createdAt).toLocaleDateString()}
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