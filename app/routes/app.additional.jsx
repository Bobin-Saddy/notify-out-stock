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

  // 1. Fetch KPI Stats (Dynamic from Database)
  const [totalRequests, notificationsSent, recentSubscribersRaw] = await Promise.all([
    prisma.backInStock.count({ where: { shop } }),
    prisma.backInStock.count({ where: { shop, notified: true } }),
    prisma.backInStock.findMany({
      where: { shop },
      take: 8,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // 2. Fetch Dynamic Product Titles from Shopify API
  // Hum database se productIds nikal kar Shopify se unke real titles mangwayenge
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

  // 3. Trend Data Logic (Dynamic)
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
      productTitle: productMap[sub.productId]?.title || "Unknown Product",
      productImage: productMap[sub.productId]?.featuredImage?.url || ""
    })),
    trendData: Object.values(dateMap)
  });
}

export default function PremiumDashboard() {
  const { stats, recentSubscribers, trendData, shop } = useLoaderData();

  const COLORS = ['#3B82F6', '#10B981', '#6366F1', '#EC4899', '#F59E0B', '#14B8A6'];

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-12 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Glassmorphism Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Restockly <span className="text-blue-600">Pro</span></h1>
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Live Insights for {shop}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-all">
              <Settings size={20} className="text-slate-600" />
            </button>
            <button className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold shadow-xl hover:shadow-blue-200/50 transition-all flex items-center gap-2">
              Generate Report <ArrowUpRight size={18} />
            </button>
          </div>
        </div>

        {/* Dynamic KPI Section - Attractive Glass Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Requests', val: stats.totalRequests, icon: LayoutList, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Sent', val: stats.notificationsSent, icon: Bell, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Delivery', val: `${stats.deliveryRate}%`, icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Open', val: '0%', icon: Eye, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Clicks', val: '0%', icon: MousePointer2, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Sales', val: '0%', icon: ShoppingBag, color: 'text-teal-600', bg: 'bg-teal-50' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-5 rounded-[2rem] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all">
               <div className={`${item.bg} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
                 <item.icon size={20} className={item.color} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
               <p className="text-2xl font-black mt-1">{item.val}</p>
            </div>
          ))}
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Chart - Dynamic Bar Analytics */}
          <div className="lg:col-span-8 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-black">Performance Analytics</h3>
              <select className="text-xs font-bold border-none bg-slate-50 p-2 rounded-lg outline-none cursor-pointer"><option>Last 30 Days</option></select>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 700, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 700, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="Requests" fill="#3B82F6" radius={[10, 10, 10, 10]} barSize={12}>
                    {trendData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Bar>
                  <Bar dataKey="Notifications" fill="#E2E8F0" radius={[10, 10, 10, 10]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel Section - Real-time Progress */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <h3 className="text-xl font-black mb-6">Live Funnel</h3>
            <div className="space-y-6">
              {[
                { label: 'Captured', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Notified', val: stats.notificationsSent, color: 'bg-emerald-500' },
                { label: 'Converted', val: 0, color: 'bg-slate-200' }
              ].map((f, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold uppercase text-slate-400">
                    <span>{f.label}</span>
                    <span className="text-slate-900 font-black">{f.val}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                    <div className={`${f.color} h-full transition-all duration-1000`} style={{ width: f.val > 0 ? '85%' : '8%' }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Conversion Goal</p>
              <p className="text-lg font-black text-slate-700">Not Calculated Yet</p>
            </div>
          </div>
        </div>

        {/* Dynamic Subscribers Table - With Product Images */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">Recent Activity Log</h3>
            <div className="flex gap-2">
              <div className="bg-blue-50 text-blue-600 p-2 rounded-xl"><Search size={16}/></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-10 py-5">Product Details</th>
                  <th className="px-10 py-5">Subscriber</th>
                  <th className="px-10 py-5 text-center">Channel</th>
                  <th className="px-10 py-5 text-center">Status</th>
                  <th className="px-10 py-5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
                          {sub.productImage ? <img src={sub.productImage} alt="Product" className="object-cover w-full h-full" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">N/A</div>}
                        </div>
                        <p className="font-bold text-slate-800 line-clamp-1">{sub.productTitle}</p>
                      </div>
                    </td>
                    <td className="px-10 py-6 font-semibold text-blue-600">{sub.email}</td>
                    <td className="px-10 py-6 text-center text-slate-400 font-black">Email</td>
                    <td className="px-10 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${sub.notified ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-600'}`}>
                        {sub.notified ? 'Delivered' : 'Queueing'}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right text-slate-400 font-bold italic">
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