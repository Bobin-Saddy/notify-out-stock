import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, ShoppingBag, Settings, CheckCircle2, TrendingUp, Mail
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

  // Aggregate Stats (Real Counts)
  const stats = {
    total: allRecords.length,
    sent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased || false).length,
  };

  // Enriched subscribers data
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

  // Expanded Trend Data with Delivery, Open, and Click rates
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

  // Calculation for percentages (only for funnel bars, not for main text display)
  const getPct = (val) => (stats.total > 0 ? Math.round((val / stats.total) * 100) : 0);

  const metricCards = [
    { label: 'Total Requests', val: stats.total, icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Notifications Sent', val: stats.sent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivered', val: stats.sent, icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Opened', val: stats.opened, icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Clicked', val: stats.clicked, icon: MousePointer2, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Purchased', val: stats.purchased, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  const funnelSteps = [
    { label: 'Request', val: stats.total, pct: 100 },
    { label: 'Sent', val: stats.sent, pct: getPct(stats.sent) },
    { label: 'Opened', val: stats.opened, pct: getPct(stats.opened) },
    { label: 'Clicked', val: stats.clicked, pct: getPct(stats.clicked) },
    { label: 'Purchased', val: stats.purchased, pct: getPct(stats.purchased) },
  ];

  return (
    <div className="bg-[#fcfcfd] min-h-screen p-8 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
          <button className="bg-black text-white px-6 py-2 rounded-full text-sm">Settings</button>
        </div>

        {/* Filters */}
        <Form onChange={(e) => submit(e.currentTarget)} className="flex gap-4">
          <select name="dateRange" defaultValue={filters.dateFilter} className="border p-2 rounded-xl text-sm bg-white shadow-sm outline-none">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <input name="search" placeholder="Product Search" className="flex-1 border p-2 rounded-xl text-sm outline-none shadow-sm" />
          <input name="variant" placeholder="Variant Search" className="flex-1 border p-2 rounded-xl text-sm outline-none shadow-sm" />
        </Form>

        {/* Metric Cards - Dynamic Counts */}
        <div className="grid grid-cols-3 gap-6">
          {metricCards.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${m.bg} ${m.color}`}><m.icon size={24} /></div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
                <p className="text-2xl font-black">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-12 gap-6">
          {/* Trend Chart with 4-5 Dynamic Bars */}
          <div className="col-span-8 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-6">Performance Trend</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                  <Tooltip cursor={{fill: '#f9f9f9'}} />
                  <Legend verticalAlign="bottom" height={36}/>
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Opened" dataKey="Opened" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Clicked" dataKey="Clicked" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel - Real Counts & Progress */}
          <div className="col-span-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-6">Notification Performance Funnel</h3>
            <div className="space-y-6">
              {funnelSteps.map((step) => (
                <div key={step.label} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-400 uppercase">
                    <span>{step.label}</span>
                    <span className="text-gray-900 font-black">{step.val}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                      style={{ width: `${step.pct}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Subscribers */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
           <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-widest">
              <tr>
                <th className="px-8 py-4">Customer Email</th>
                <th className="px-8 py-4">Product</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscribers.map((sub) => (
                <tr key={sub.id} className="text-sm">
                  <td className="px-8 py-5 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-8 py-5 font-medium">{sub.productTitle}</td>
                  <td className="px-8 py-5">
                    <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[10px] font-bold">
                      {sub.notified ? 'NOTIFIED' : 'PENDING'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-gray-400">
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