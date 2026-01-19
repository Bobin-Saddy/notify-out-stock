import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router"; // Updated import for Remix
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, ShoppingBag, Settings, CheckCircle2, TrendingUp
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

  // Dynamic Stats Calculation
  const stats = {
    totalRequests: allRecords.length,
    notificationsSent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length, // Added purchased logic
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
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Notifications: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Notifications++;
    return acc;
  }, {}));

  return json({ stats, subscribers: enrichedSubscribers, trendData, filters: { searchQuery, variantSearch, dateFilter } });
}

export default function Dashboard() {
  const { stats, subscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  // Helper for funnel percentage
  const getRate = (dividend, divisor) => {
    if (!divisor || divisor === 0) return 0;
    return Math.round((dividend / divisor) * 100);
  };

  const metrics = [
    { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.notificationsSent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: getRate(stats.notificationsSent, stats.totalRequests) + '%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Open Rate', val: getRate(stats.opened, stats.notificationsSent) + '%', icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Click Rate', val: getRate(stats.clicked, stats.opened) + '%', icon: MousePointer2, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Conversion Rate', val: getRate(stats.purchased, stats.clicked) + '%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  // Funnel Data Generation
  const funnelSteps = [
    { label: 'Request', value: stats.totalRequests, pct: 100 },
    { label: 'Sent', value: stats.notificationsSent, pct: getRate(stats.notificationsSent, stats.totalRequests) },
    { label: 'Opened', value: stats.opened, pct: getRate(stats.opened, stats.totalRequests) },
    { label: 'Clicked', value: stats.clicked, pct: getRate(stats.clicked, stats.totalRequests) },
    { label: 'Purchased', value: stats.purchased, pct: getRate(stats.purchased, stats.totalRequests) },
  ];

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor your notification performance and customer interest.</p>
          </div>
          <button className="bg-black text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-gray-800 transition-all">
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Filters */}
        <Form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-4 gap-4">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <input name="search" placeholder="Search by email..." defaultValue={filters.searchQuery} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm" />
          <input name="variant" placeholder="Search by variant ID..." defaultValue={filters.variantSearch} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm" />
          <div className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm text-gray-400 flex items-center shadow-sm">
             All Channels
          </div>
        </Form>

        {/* Metric Cards */}
        <div className="grid grid-cols-6 gap-4">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <div className={`w-10 h-10 mb-3 rounded-lg flex items-center justify-center ${m.bg} ${m.color}`}><m.icon size={20} /></div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
              <p className="text-xl font-bold text-gray-900">{m.val}</p>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-12 gap-6">
          {/* Bar Chart */}
          <div className="col-span-7 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-6">Requests vs Notifications Trend</h3>
            <div className="h-72">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}}/>
                    <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={15} />
                    <Bar name="Notifications" dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">No trend data available for this period.</div>
              )}
            </div>
          </div>

          {/* Funnel Chart */}
          <div className="col-span-5 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-6">Performance Funnel</h3>
            <div className="space-y-6">
              {funnelSteps.map((step) => (
                <div key={step.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-600">{step.label}</span>
                    <span className="text-gray-900 font-bold">{step.value}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                        style={{ width: `${step.pct}%` }}
                      ></div>
                    </div>
                    <span className="text-[11px] font-bold text-blue-600 w-8">{step.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Recent Subscribers</h3>
            <span className="text-xs text-blue-600 font-medium bg-blue-50 px-3 py-1 rounded-full">
              {stats.totalRequests} Total Records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-widest bg-gray-50/50">
                  <th className="px-6 py-4 font-semibold">Customer Email</th>
                  <th className="px-6 py-4 font-semibold">Product Title</th>
                  <th className="px-6 py-4 font-semibold">Variant</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {subscribers.length > 0 ? subscribers.map((sub) => (
                  <tr key={sub.id} className="text-sm hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-gray-700 font-medium">{sub.email}</td>
                    <td className="px-6 py-4 text-blue-600">{sub.productTitle}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{sub.variantTitle}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-gray-400 italic">No recent subscribers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}