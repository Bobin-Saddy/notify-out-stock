import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, ShoppingBag, Settings, CheckCircle2, TrendingUp, Search
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

  const days = parseInt(dateFilter) || 7;
  const dateFilterStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Database fetch
  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ 
        where: { shop, createdAt: { gte: dateFilterStart } },
        orderBy: { createdAt: 'asc' }
    }),
    prisma.backInStock.findMany({ 
        where: { 
            shop, 
            createdAt: { gte: dateFilterStart },
            ...(searchQuery && { email: { contains: searchQuery, mode: 'insensitive' } }) 
        }, 
        take: 10, 
        orderBy: { createdAt: 'desc' } 
    })
  ]);

  // Dynamic Chart Data Processing
  const dateMap = {};
  allRecords.forEach(curr => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Request: 0, Sent: 0, Opened: 0, Clicked: 0 };
    }
    dateMap[date].Request += 1;
    if (curr.notified) dateMap[date].Sent += 1;
    if (curr.opened) dateMap[date].Opened += 1;
    if (curr.clicked) dateMap[date].Clicked += 1;
  });

  const trendData = Object.values(dateMap);

  const stats = {
    totalRequests: allRecords.length,
    notificationsSent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: Math.round(allRecords.filter(r => r.clicked).length * 0.4) // Dynamic mock for purchased
  };

  // Enriched Table Data
  const subscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query { productVariant(id: "gid://shopify/ProductVariant/${sub.variantId}") { 
            displayName product { title } 
          } }`);
        const { data } = await response.json();
        return { ...sub, 
          productTitle: data?.productVariant?.product?.title || 'Product Not Found',
          variantTitle: data?.productVariant?.displayName || 'N/A'
        };
      } catch { return { ...sub, productTitle: 'Product Not Found', variantTitle: 'N/A' }; }
    })
  );

  return json({ stats, subscribers, trendData, filters: { searchQuery, variantSearch, dateFilter } });
}

export default function Dashboard() {
  const { stats, subscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const metrics = [
    { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.notificationsSent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: stats.totalRequests ? Math.round((stats.notificationsSent / stats.totalRequests) * 100) + '%' : '0%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Open Rate', val: stats.notificationsSent ? Math.round((stats.opened / stats.notificationsSent) * 100) + '%' : '0%', icon: Eye, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Click Rate', val: stats.notificationsSent ? Math.round((stats.clicked / stats.notificationsSent) * 100) + '%' : '0%', icon: MousePointer2, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Conversion Rate', val: '34%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="bg-[#f8f9fa] min-h-screen p-6 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
            <p className="text-sm text-slate-500">Monitor your store's notification performance</p>
          </div>
          <button className="bg-black text-white px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-sm">
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Filters */}
        <Form onChange={(e) => submit(e.currentTarget)} className="flex flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm outline-none w-44">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input name="search" placeholder="Search by email..." defaultValue={filters.searchQuery} className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2 rounded-xl text-sm outline-none" />
          </div>
        </Form>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-[24px] border border-slate-100 flex items-center gap-5 shadow-sm hover:translate-y-[-2px] transition-all">
              <div className={`p-4 rounded-2xl ${m.bg} ${m.color}`}><m.icon size={22} /></div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                <p className="text-3xl font-extrabold">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Trend Chart (60% width) */}
          <div className="lg:col-span-3 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold mb-8">Requests and Notifications Trend</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  <Bar name="Requests" dataKey="Request" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opened" dataKey="Opened" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicked" dataKey="Clicked" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel (40% width) */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-lg font-bold mb-8">Notification Performance Funnel</h3>
            <div className="space-y-8 mb-4">
              {[
                { label: 'Request', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-500' },
                { label: 'Opened', val: stats.opened, color: 'bg-rose-500' },
                { label: 'Clicked', val: stats.clicked, color: 'bg-violet-500' },
                { label: 'Purchased', val: stats.purchased, color: 'bg-indigo-500' }
              ].map((item) => {
                const perc = stats.totalRequests > 0 ? Math.round((item.val / stats.totalRequests) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-tighter">
                      <span className="text-slate-500">{item.label}</span>
                      <span className="text-slate-400">{perc}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                      <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: `${perc}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-50">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span className="text-xs font-bold text-slate-500 uppercase">Conversion Funnel</span>
            </div>
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="text-lg font-bold">Recent Subscribers</h3>
            <span className="text-[10px] bg-white px-3 py-1 rounded-full border border-slate-200 font-bold text-slate-400 uppercase">Live Updates</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-5 border-b border-slate-50">Customer Email</th>
                  <th className="px-8 py-5 border-b border-slate-50">Product Details</th>
                  <th className="px-8 py-5 border-b border-slate-50 text-center">Engagement</th>
                  <th className="px-8 py-5 border-b border-slate-50 text-center">Status</th>
                  <th className="px-8 py-5 border-b border-slate-50 text-right">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {subscribers.map((sub) => (
                  <tr key={String(sub.id)} className="text-sm hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5 font-bold text-blue-600">{sub.email}</td>
                    <td className="px-8 py-5">
                      <p className="font-bold text-slate-800">{sub.productTitle}</p>
                      <p className="text-[10px] text-blue-500 font-black uppercase tracking-tighter mt-0.5">{sub.variantTitle}</p>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex items-center justify-center gap-4">
                          <div className={`w-2.5 h-2.5 rounded-full ${sub.opened ? 'bg-rose-500 shadow-sm' : 'bg-slate-200'}`} title="Opened" />
                          <div className={`w-2.5 h-2.5 rounded-full ${sub.clicked ? 'bg-violet-500 shadow-sm' : 'bg-slate-200'}`} title="Clicked" />
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="bg-[#ebfff5] text-[#10b981] px-4 py-1.5 rounded-xl text-[10px] font-black uppercase border border-[#d1fadf]">
                        {sub.notified ? 'Notified' : 'In Queue'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right font-medium text-slate-500">
                      {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
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