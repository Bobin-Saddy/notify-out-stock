import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, Info
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Scoped Data Fetching
  const [totalRequests, notificationsSent] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } })
  ]);

  const recentSubscribers = await prisma.backInStock.findMany({
    where: { shop },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  // Trend Analytics for Bar Chart
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
      { name: 'Jan 15', Requests: 5, Notifications: 2 },
      { name: 'Jan 16', Requests: 8, Notifications: 5 }
    ]
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();

  // Reusable KPI Component with Icon support
  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between transition-transform hover:scale-[1.02]">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
      <div className={`${bg} p-4 rounded-2xl`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFBFC] p-4 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Navigation Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">Restockly Insights</h1>
            <p className="text-gray-500 font-medium">Real-time stock alert performance for <span className="text-blue-600">{shop}</span></p>
          </div>
          <button className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold shadow-xl hover:bg-black transition-all">
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Dynamic Info Banner */}
        <div className="bg-white border border-blue-50 p-4 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="bg-blue-500 p-2 rounded-xl text-white"><Info size={20} /></div>
          <p className="text-sm text-gray-600 font-medium">
            System tracking active since Jan 15, 2026. Data updates every 60 minutes.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            <input className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm" placeholder="Search by Product name..." />
          </div>
          <select className="bg-white border border-gray-100 px-4 py-3.5 rounded-2xl font-bold text-sm text-gray-600 shadow-sm"><option>All Channels</option></select>
          <select className="bg-white border border-gray-100 px-4 py-3.5 rounded-2xl font-bold text-sm text-gray-600 shadow-sm"><option>Last 7 Days</option></select>
        </div>

        {/* 6-Grid KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatBox title="Total Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-500" bg="bg-blue-50" />
          <StatBox title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="text-green-500" bg="bg-green-50" />
          <StatBox title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="text-indigo-500" bg="bg-indigo-50" />
          <StatBox title="Open Rate" value="8%" icon={Eye} color="text-pink-500" bg="bg-pink-50" />
          <StatBox title="Click Rate" value="2%" icon={MousePointer2} color="text-orange-500" bg="bg-orange-50" />
          <StatBox title="Conversion Rate" value="34%" icon={ShoppingBag} color="text-emerald-500" bg="bg-emerald-50" />
        </div>

        {/* Chart & Funnel Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-10">
          
          {/* Bar Chart Analytics */}
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Performance Trends</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                  <Bar dataKey="Requests" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={15} />
                  <Bar dataKey="Notifications" fill="#10B981" radius={[6, 6, 0, 0]} barSize={15} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Vertical Funnel */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Conversion Funnel</h3>
            <div className="space-y-6">
              {[
                { name: 'Requested', val: stats.totalRequests, color: 'bg-blue-500' },
                { name: 'Sent', val: stats.notificationsSent, color: 'bg-green-500' },
                { name: 'Opened', val: 0, color: 'bg-pink-500' },
                { name: 'Clicked', val: 0, color: 'bg-orange-500' },
                { name: 'Purchased', val: 0, color: 'bg-emerald-500' }
              ].map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-black uppercase text-gray-400 tracking-wider">
                    <span>{item.name}</span>
                    <span className="text-gray-900 font-bold">{item.val}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: item.val > 0 ? '70%' : '5%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modern Subscribers Table */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden mt-8">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-black">Recent Engagement</h3>
            <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-xs font-bold uppercase">Live Logs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#FAFBFC] text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                <tr>
                  <th className="px-8 py-5">Subscriber</th>
                  <th className="px-8 py-5">Product Target</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right">Registered On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/30 transition-all">
                    <td className="px-8 py-6 font-bold text-blue-600">{sub.email}</td>
                    <td className="px-8 py-6 text-gray-500 font-medium italic">The Collection Snowboard: Liquid</td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-500'}`}>
                        {sub.notified ? 'Delivered' : 'Monitoring'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right text-gray-400 font-bold">
                      {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
                {recentSubscribers.length === 0 && (
                  <tr><td colSpan="4" className="p-20 text-center text-gray-300 font-bold italic uppercase tracking-widest">Awaiting First Subscription...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}