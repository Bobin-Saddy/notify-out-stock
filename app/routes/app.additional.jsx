import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, ShoppingBag, Settings, CheckCircle2, TrendingUp, Mail, Filter
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  const searchQuery = url.searchParams.get("search") || "";
  const variantSearch = url.searchParams.get("variant") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";

  const dateFilterStart = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const whereClause = {
    shop,
    createdAt: { gte: dateFilterStart },
    ...(searchQuery && { email: { contains: searchQuery, mode: 'insensitive' } }),
    ...(variantSearch && { variantId: { contains: variantSearch, mode: 'insensitive' } }),
  };

  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ where: { shop, createdAt: { gte: dateFilterStart } } }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } })
  ]);

  const stats = {
    total: allRecords.length,
    sent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length,
  };

  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query { productVariant(id: "gid://shopify/ProductVariant/${sub.variantId}") { 
            displayName product { title } 
          } }`);
        const { data } = await response.json();
        return { ...sub, 
          productTitle: data?.productVariant?.product?.title || 'Unknown Product',
          variantTitle: data?.productVariant?.displayName || 'N/A'
        };
      } catch { return { ...sub, productTitle: 'Deleted Product', variantTitle: 'N/A' }; }
    })
  );

  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Sent++;
    if (curr.opened) acc[date].Opened++;
    if (curr.clicked) acc[date].Clicked++;
    return acc;
  }, {}));

  return json({ stats, subscribers: enrichedSubscribers, trendData, filters: { searchQuery, variantSearch, dateFilter } });
}

export default function Dashboard() {
  const { stats, subscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const getPct = (val) => (stats.total > 0 ? Math.round((val / stats.total) * 100) : 0);

  const metricCards = [
    { label: 'Total Requests', val: stats.total, icon: Mail, color: '#4f46e5', bg: 'bg-indigo-50' },
    { label: 'Sent', val: stats.sent, icon: Bell, color: '#10b981', bg: 'bg-emerald-50' },
    { label: 'Opened', val: stats.opened, icon: Eye, color: '#8b5cf6', bg: 'bg-purple-50' },
    { label: 'Clicked', val: stats.clicked, icon: MousePointer2, color: '#f59e0b', bg: 'bg-amber-50' },
    { label: 'Purchased', val: stats.purchased, icon: TrendingUp, color: '#3b82f6', bg: 'bg-blue-50' },
    { label: 'Delivery Rate', val: getPct(stats.sent) + '%', icon: CheckCircle2, color: '#06b6d4', bg: 'bg-cyan-50' },
  ];

  const funnelSteps = [
    { label: 'Request', count: stats.total, pct: 100, color: 'bg-indigo-500' },
    { label: 'Sent', count: stats.sent, pct: getPct(stats.sent), color: 'bg-emerald-500' },
    { label: 'Opened', count: stats.opened, pct: getPct(stats.opened), color: 'bg-purple-500' },
    { label: 'Clicked', count: stats.clicked, pct: getPct(stats.clicked), color: 'bg-amber-500' },
    { label: 'Purchased', count: stats.purchased, pct: getPct(stats.purchased), color: 'bg-blue-500' },
  ];

  return (
    <div className="bg-[#f8fafc] min-h-screen p-6 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex justify-between items-end bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Analytics Overview</h1>
            <p className="text-slate-500 font-medium">Tracking Back-In-Stock performance real-time.</p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm">
                <Filter size={16}/> Filter
             </button>
             <button className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2">
                <Settings size={18}/> Settings
             </button>
          </div>
        </div>

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-6 gap-4">
          {metricCards.map((m, i) => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm group hover:border-indigo-200 transition-all duration-300">
              <div className={`w-12 h-12 mb-4 rounded-2xl flex items-center justify-center ${m.bg}`} style={{color: m.color}}>
                <m.icon size={24} />
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
              <p className="text-2xl font-black text-slate-800 group-hover:scale-105 transition-transform">{m.val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Detailed Performance Trend */}
          <div className="col-span-8 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
               <h3 className="font-bold text-xl text-slate-800">Requests vs Activity Trend</h3>
               <div className="flex gap-4 text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div> Requests</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Sent</span>
               </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={4}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 600}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}}
                  />
                  <Bar name="Requests" dataKey="Requests" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={10} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[6, 6, 0, 0]} barSize={10} />
                  <Bar name="Opened" dataKey="Opened" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={10} />
                  <Bar name="Clicked" dataKey="Clicked" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel Visual */}
          <div className="col-span-4 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="font-bold text-xl text-slate-800 mb-8">Performance Funnel</h3>
            <div className="space-y-7">
              {funnelSteps.map((step) => (
                <div key={step.label} className="relative">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{step.label}</span>
                    <div className="text-right">
                       <span className="text-lg font-black text-slate-800 block leading-none">{step.count}</span>
                       <span className="text-[10px] font-bold text-indigo-500">{step.pct}%</span>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                    <div 
                      className={`h-full ${step.color} rounded-full transition-all duration-1000 ease-out shadow-sm`}
                      style={{ width: `${step.pct}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="font-bold text-xl text-slate-800">Recent Customer Activity</h3>
            <Form onChange={(e) => submit(e.currentTarget)} className="flex gap-3">
               <input name="search" placeholder="Search customer..." className="px-4 py-1.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 ring-indigo-100 shadow-sm"/>
            </Form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  <th className="px-8 py-5">Customer</th>
                  <th className="px-8 py-5">Product Interest</th>
                  <th className="px-8 py-5 text-center">Engagement</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5">Joined On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {subscribers.map((sub) => (
                  <tr key={sub.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                       <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{sub.email}</span>
                          <span className="text-[10px] text-slate-400 font-medium tracking-tight">Direct Channel</span>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                       <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{sub.productTitle}</span>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex justify-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${sub.notified ? 'bg-emerald-400' : 'bg-slate-200'}`} title="Notified"></div>
                          <div className={`w-2 h-2 rounded-full ${sub.opened ? 'bg-purple-400' : 'bg-slate-200'}`} title="Opened"></div>
                          <div className={`w-2 h-2 rounded-full ${sub.clicked ? 'bg-amber-400' : 'bg-slate-200'}`} title="Clicked"></div>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${sub.notified ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {sub.notified ? 'Dispatched' : 'Queued'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-400 font-medium">
                      {new Date(sub.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
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