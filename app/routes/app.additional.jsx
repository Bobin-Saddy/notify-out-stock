import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag 
} from 'lucide-react'; // Icons for the KPI cards
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch KPI Stats for this specific shop
  const [totalRequests, notificationsSent] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } })
  ]);

  // 2. Fetch Recent Subscribers for this specific shop
  const recentSubscribers = await prisma.backInStock.findMany({
    where: { shop },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  // 3. Trend Data Logic (Formatted for Bar Chart)
  const historyRaw = await prisma.backInStock.findMany({
    where: { shop },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, notified: true }
  });

  const dateMap = {};
  historyRaw.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) dateMap[date] = { name: date, Requests: 0, Notifications: 0 };
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
  });

  return json({
    shop,
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0,
    },
    recentSubscribers,
    trendData: Object.values(dateMap).length > 0 ? Object.values(dateMap) : [
      { name: 'Jan 15', Requests: 4, Notifications: 3 },
      { name: 'Jan 16', Requests: 6, Notifications: 4 }
    ]
  });
}

export default function ProfessionalDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();

  // Helper Component for KPI Cards
  const KPICard = ({ title, value, icon: Icon, colorClass, iconBg }) => (
    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center space-x-4">
      <div className={`p-3 rounded-2xl ${iconBg}`}>
        <Icon size={24} className={colorClass} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-8 font-sans">
      {/* Tailwind CDN for reliable styling */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor Back In Stock notification performance for <span className="font-bold">{shop}</span></p>
          </div>
          <button className="bg-black text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg">Settings</button>
        </div>

        {/* Search Filters Row */}
        <div className="flex gap-4">
          <select className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm shadow-sm w-48"><option>Last 7 days</option></select>
          <input className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm shadow-sm flex-1" placeholder="Product Search" />
          <input className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm shadow-sm flex-1" placeholder="Variant Search" />
          <select className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm shadow-sm w-48"><option>All Channels</option></select>
        </div>

        {/* KPI Grid - Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard title="Total Requests" value={stats.totalRequests} icon={LayoutList} colorClass="text-blue-600" iconBg="bg-blue-50" />
          <KPICard title="Notifications Sent" value={stats.notificationsSent} icon={Bell} colorClass="text-green-600" iconBg="bg-green-50" />
          <KPICard title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} colorClass="text-cyan-600" iconBg="bg-cyan-50" />
        </div>

        {/* KPI Grid - Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard title="Open Rate" value="8%" icon={Eye} colorClass="text-emerald-600" iconBg="bg-emerald-50" />
          <KPICard title="Click Rate" value="2%" icon={MousePointer2} colorClass="text-purple-600" iconBg="bg-purple-50" />
          <KPICard title="Conversion Rate" value="34%" icon={ShoppingBag} colorClass="text-indigo-600" iconBg="bg-indigo-50" />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Trend Bar Chart */}
          <div className="lg:col-span-3 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-8 tracking-tight">Requests and Notifications Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                  <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                  <Legend verticalAlign="bottom" height={36}/>
                  <Bar dataKey="Requests" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="Notifications" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel */}
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-8 tracking-tight">Notification Performance Funnel</h3>
            <div className="space-y-5">
              {[
                { label: 'Request', val: stats.totalRequests, pct: '50%' },
                { label: 'Sent', val: stats.notificationsSent, pct: '50%' },
                { label: 'Opened', val: 0, pct: '50%' },
                { label: 'Clicked', val: 0, pct: '50%' },
                { label: 'Purchased', val: 0, pct: '50%' }
              ].map((step) => (
                <div key={step.label} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                    <span>{step.label}</span>
                    <span>{step.pct}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex-1 bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: step.pct }}></div>
                    </div>
                    <span className="text-xs font-bold text-gray-600">{step.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Products Section */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50">
            <h3 className="text-lg font-bold text-gray-800">Top Performing Products</h3>
          </div>
          <div className="p-12 text-center bg-gray-50/30">
            <p className="text-sm font-bold text-gray-900">No data found</p>
            <p className="text-xs text-gray-400 mt-1">Data will appear here once customers request a back-in-stock notification.</p>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-10">
          <div className="px-8 py-6 border-b border-gray-50">
            <h3 className="text-lg font-bold text-gray-800 tracking-tight">Recent Subscribers</h3>
          </div>
          <table className="w-full text-left">
            <thead className="bg-[#F9FAFB] text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <tr>
                <th className="px-8 py-4">Customer Email</th>
                <th className="px-8 py-4">Product</th>
                <th className="px-8 py-4 text-center">Channel</th>
                <th className="px-8 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-right">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5 text-blue-600 font-bold">{sub.email}</td>
                  <td className="px-8 py-5 text-gray-600 font-medium">The Collection Snowboard: Liquid</td>
                  <td className="px-8 py-5 text-center text-gray-400 font-bold">Email</td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-4 py-1 rounded-lg text-[10px] font-bold ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-emerald-50 text-emerald-500'}`}>
                      {sub.notified ? 'Sent' : 'In progress'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right text-gray-500 font-medium">
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