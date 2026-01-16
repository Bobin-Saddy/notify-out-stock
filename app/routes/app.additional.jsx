import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, ArrowUpRight,Zap
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [totalRequests, notificationsSent, recentSubscribersRaw] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } }),
    prisma.backInStock.findMany({
      where: { shop },
      take: 8,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  const productIds = [...new Set(recentSubscribersRaw.map(s => `gid://shopify/Product/${s.productId}`))];
  const response = await admin.graphql(
    `#graphql
    query getProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          featuredImage { url }
        }
      }
    }`,
    { variables: { ids: productIds } }
  );
  
  const productsData = await response.json();
  const productMap = {};
  productsData.data?.nodes?.forEach(node => {
    if (node) productMap[node.id.split('/').pop()] = node;
  });

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
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0,
    },
    recentSubscribers: recentSubscribersRaw.map(sub => ({
      ...sub,
      productTitle: productMap[sub.productId]?.title || "Loading Product...",
      productImage: productMap[sub.productId]?.featuredImage?.url || ""
    })),
    trendData: Object.values(dateMap).length > 0 ? Object.values(dateMap) : [{name: 'Start', Requests: 0, Notifications: 0}]
  });
}

export default function PremiumDashboard() {
  const { stats, recentSubscribers, trendData } = useLoaderData();
  const [mounted, setMounted] = useState(false);

  // Animation fix for Recharts SSR
  useEffect(() => { setMounted(true); }, []);

  const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];

  if (!mounted) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-[#F4F7FE] p-4 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Animated Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              Restockly <span className="bg-blue-600 text-white px-3 py-1 rounded-2xl text-sm italic shadow-lg shadow-blue-200">AI</span>
            </h1>
            <p className="text-slate-500 font-bold flex items-center gap-2">
              <Zap size={16} className="text-amber-400 fill-amber-400" /> Real-time automation active
            </p>
          </div>
          <div className="flex gap-4">
            <button className="bg-white border-2 border-slate-100 p-4 rounded-3xl hover:bg-slate-50 transition-all shadow-sm">
              <Settings size={20} className="text-slate-600" />
            </button>
            <button className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2">
              Export Stats <ArrowUpRight size={20} />
            </button>
          </div>
        </div>

        {/* Dynamic KPI Cards with Soft Glass Effect */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-6">
          {[
            { label: 'Total Requests', val: stats.totalRequests, icon: LayoutList, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Mails Sent', val: stats.notificationsSent, icon: Bell, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Delivery %', val: `${stats.deliveryRate}%`, icon: Truck, color: 'text-purple-500', bg: 'bg-purple-50' },
            { label: 'Open Rate', val: '12%', icon: Eye, color: 'text-rose-500', bg: 'bg-rose-50' },
            { label: 'CTR', val: '4%', icon: MousePointer2, color: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'Revenue', val: '$0', icon: ShoppingBag, color: 'text-cyan-500', bg: 'bg-cyan-50' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white/80 backdrop-blur-md p-6 rounded-[2.5rem] border border-white shadow-sm hover:translate-y-[-5px] transition-all duration-300">
               <div className={`${item.bg} w-12 h-12 rounded-2xl flex items-center justify-center mb-4`}>
                 <item.icon size={22} className={item.color} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400">{item.label}</p>
               <p className="text-3xl font-black tracking-tighter">{item.val}</p>
            </div>
          ))}
        </div>

        {/* Dynamic Charts with Pixel-Perfect Height Fix */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Animated Bar Chart */}
          <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-50">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black tracking-tight">Notification Trends</h3>
              <div className="flex gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Requests</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200"></span> Sent</span>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 350, minHeight: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: '#CBD5E1'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: '#CBD5E1'}} />
                  <Tooltip 
                    cursor={{fill: '#F8FAFC', radius: 10}} 
                    contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)'}} 
                  />
                  <Bar dataKey="Requests" animationDuration={1500} fill="#3B82F6" radius={[10, 10, 10, 10]} barSize={16}>
                    {trendData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                  <Bar dataKey="Notifications" animationDuration={2000} fill="#E2E8F0" radius={[10, 10, 10, 10]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Area Chart Funnel */}
          <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-50">
            <h3 className="text-2xl font-black tracking-tight mb-4">Live Volume</h3>
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip content={() => null} />
                  <Area type="monotone" dataKey="Requests" stroke="#3B82F6" strokeWidth={4} fillOpacity={1} fill="url(#colorReq)" animationDuration={2500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 space-y-4">
               <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                 <span className="text-xs font-black text-slate-400 uppercase">Conversion</span>
                 <span className="text-xl font-black text-blue-600 tracking-tighter">{stats.deliveryRate}%</span>
               </div>
               <p className="text-[10px] text-center text-slate-400 font-bold uppercase leading-relaxed">System is matching stock with {stats.totalRequests} pending subscribers.</p>
            </div>
          </div>
        </div>

        {/* Dynamic Activity Table with Product Thumbnails */}
        <div className="bg-white rounded-[4rem] shadow-sm border border-slate-50 overflow-hidden">
          <div className="p-10 flex justify-between items-center border-b border-slate-50">
            <h3 className="text-2xl font-black tracking-tight">Recent Engagement Feed</h3>
            <div className="relative">
              <Search className="absolute left-4 top-3 text-slate-300" size={16} />
              <input className="pl-12 pr-6 py-2.5 bg-slate-50 rounded-2xl text-xs font-bold outline-none w-64 focus:ring-2 focus:ring-blue-100 transition-all" placeholder="Filter by email..." />
            </div>
          </div>
          <div className="overflow-x-auto px-6 pb-10">
            <table className="w-full text-left border-separate border-spacing-y-4">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                  <th className="px-8 py-2">Target Product</th>
                  <th className="px-8 py-2">Subscriber Email</th>
                  <th className="px-8 py-2 text-center">Current Status</th>
                  <th className="px-8 py-2 text-right">Activity Date</th>
                </tr>
              </thead>
              <tbody className="text-sm font-bold">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="group transition-all hover:bg-blue-50/50">
                    <td className="px-8 py-4 bg-white rounded-l-[2rem] border-y border-l border-slate-50">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden border-2 border-white shadow-sm transition-transform group-hover:scale-110">
                          {sub.productImage ? <img src={sub.productImage} className="w-full h-full object-cover" alt="p" /> : <div className="w-full h-full flex items-center justify-center text-[10px]">📦</div>}
                        </div>
                        <p className="text-slate-900 tracking-tighter line-clamp-1 w-48">{sub.productTitle}</p>
                      </div>
                    </td>
                    <td className="px-8 py-4 bg-white border-y border-slate-50 text-blue-600 font-black tracking-tight">{sub.email}</td>
                    <td className="px-8 py-4 bg-white border-y border-slate-50 text-center">
                      <span className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider ${sub.notified ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-blue-50 text-blue-500'}`}>
                        {sub.notified ? 'Delivered ✓' : 'Monitoring •'}
                      </span>
                    </td>
                    <td className="px-8 py-4 bg-white rounded-r-[2rem] border-y border-r border-slate-50 text-right text-slate-400 italic">
                      {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}