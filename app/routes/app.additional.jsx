import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, Info, ArrowUpRight
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch KPI Stats (Synchronized with your Webhook data)
  const [totalRequests, notificationsSent, recentSubscribersRaw] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } }),
    prisma.backInStock.findMany({
      where: { shop },
      take: 10,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // 2. Dynamic Product Fetching (Using GraphQL for titles/images)
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
  productsData.data.nodes.forEach(node => {
    if (node) productMap[node.id.split('/').pop()] = node;
  });

  // 3. Trend Logic (Requests vs Notifications)
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
    recentSubscribers: recentSubscribersRaw.map(sub => ({
      ...sub,
      productTitle: productMap[sub.productId]?.title || "Product Loading...",
      productImage: productMap[sub.productId]?.featuredImage?.url || ""
    })),
    trendData: Object.values(dateMap)
  });
}

export default function RestocklyDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();
  const COLORS = ['#3B82F6', '#10B981', '#6366F1', '#EC4899', '#F59E0B'];

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-12 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Dynamic Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 underline decoration-blue-500 decoration-4 underline-offset-8">Restockly <span className="text-blue-600 font-extrabold italic">PRO</span></h1>
            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm mt-4">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Connected to: {shop}
            </div>
          </div>
          <div className="flex gap-3">
             <button className="bg-slate-900 text-white px-8 py-4 rounded-3xl font-black shadow-2xl hover:bg-blue-600 transition-all flex items-center gap-2 transform hover:-translate-y-1">
              Live Monitoring <ArrowUpRight size={20} />
            </button>
          </div>
        </div>

        {/* Dynamic KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Requests', val: stats.totalRequests, icon: LayoutList, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Sent', val: stats.notificationsSent, icon: Bell, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Delivery', val: `${stats.deliveryRate}%`, icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Open', val: '0%', icon: Eye, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Clicks', val: '0%', icon: MousePointer2, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Converted', val: '0', icon: ShoppingBag, color: 'text-teal-600', bg: 'bg-teal-50' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-6 rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/50 hover:scale-105 transition-transform">
               <div className={`${item.bg} w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-inner`}>
                 <item.icon size={22} className={item.color} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
               <p className="text-3xl font-black text-slate-900 tracking-tighter">{item.val}</p>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
            <h3 className="text-2xl font-black mb-10 tracking-tight">Demand vs Supply <span className="text-slate-300 text-sm font-bold ml-2">/ Daily Trend</span></h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 800, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 800, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)'}} />
                  <Bar dataKey="Requests" fill="#3B82F6" radius={[10, 10, 10, 10]} barSize={14}>
                    {trendData.map((entry, index) => <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Bar>
                  <Bar dataKey="Notifications" fill="#E2E8F0" radius={[10, 10, 10, 10]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
            <h3 className="text-2xl font-black mb-8 tracking-tight text-center">Live Funnel</h3>
            <div className="space-y-8 mt-4">
              {[
                { label: 'Requests', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-emerald-500' },
                { label: 'Sales', val: 0, color: 'bg-slate-200' }
              ].map((f, i) => (
                <div key={i} className="text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">{f.label}</p>
                  <p className="text-3xl font-black mb-3">{f.val}</p>
                  <div className="w-full h-5 bg-slate-50 rounded-full border border-slate-100 p-1">
                    <div className={`${f.color} h-full rounded-full shadow-lg`} style={{ width: f.val > 0 ? '90%' : '10%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Activity Table */}
        <div className="bg-white rounded-[4rem] shadow-2xl shadow-slate-200 border border-slate-50 overflow-hidden">
          <div className="p-10 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-900">Live Activity Feed</h3>
            <div className="bg-emerald-50 text-emerald-600 px-6 py-2 rounded-full text-xs font-black uppercase flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Receiving Events
            </div>
          </div>
          <div className="overflow-x-auto px-6 pb-10">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                  <th className="px-8 py-8 text-center">Image</th>
                  <th className="px-8 py-8">Product Information</th>
                  <th className="px-8 py-8">Customer Email</th>
                  <th className="px-8 py-8 text-center">Event Status</th>
                  <th className="px-8 py-8 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm font-bold">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50 transition-all rounded-3xl group">
                    <td className="px-8 py-6">
                      <div className="w-16 h-16 rounded-[1.5rem] bg-slate-100 mx-auto overflow-hidden border-4 border-white shadow-md">
                        {sub.productImage ? <img src={sub.productImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px]">NO IMG</div>}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-slate-900 text-lg tracking-tight mb-1">{sub.productTitle}</p>
                      <p className="text-xs text-slate-400">ID: {sub.productId}</p>
                    </td>
                    <td className="px-8 py-6 text-blue-600 font-black text-base">{sub.email}</td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase shadow-sm ${sub.notified ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-amber-100 text-amber-600'}`}>
                        {sub.notified ? 'Delivered ✓' : 'Monitoring •'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right text-slate-400 font-extrabold italic">
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