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

  const dateFilterStart = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const whereClause = {
    shop,
    createdAt: { gte: dateFilterStart },
    ...(searchQuery && { email: { contains: searchQuery, mode: 'insensitive' } }),
    ...(variantSearch && { variantId: { contains: variantSearch, mode: 'insensitive' } }),
  };

  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ 
        where: { shop, createdAt: { gte: dateFilterStart } },
        orderBy: { createdAt: 'asc' }
    }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } })
  ]);

  const stats = {
    totalRequests: allRecords.length,
    notificationsSent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.clicked).length * 0.15, // Placeholder logic for conversion
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
      } catch { return { ...sub, productTitle: 'Product Not Found', variantTitle: 'N/A' }; }
    })
  );

  // Dynamic Trend Data for 4 Bars
  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Request: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Request++;
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

  const metrics = [
    { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.notificationsSent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: stats.totalRequests ? Math.round((stats.notificationsSent / stats.totalRequests) * 100) + '%' : '0%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Open Rate', val: stats.notificationsSent ? Math.round((stats.opened / stats.notificationsSent) * 100) + '%' : '0%', icon: Eye, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Click Rate', val: stats.notificationsSent ? Math.round((stats.clicked / stats.notificationsSent) * 100) + '%' : '0%', icon: MousePointer2, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Conversion Rate', val: '34%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  // Funnel Data Calculation
  const funnelItems = [
    { label: 'Request', val: stats.totalRequests },
    { label: 'Sent', val: stats.notificationsSent },
    { label: 'Opened', val: stats.opened },
    { label: 'Clicked', val: stats.clicked },
    { label: 'Purchased', val: Math.round(stats.purchased) }
  ];

  return (
    <div className="bg-[#f9fafb] min-h-screen p-6 md:p-10 font-sans text-[#1a1c21]">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-[#000] text-white px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity">
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Filter Bar */}
        <Form onChange={(e) => submit(e.currentTarget)} className="flex flex-wrap gap-3">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none w-44 shadow-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
             <input name="search" placeholder="Product Search" defaultValue={filters.searchQuery} className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none shadow-sm" />
          </div>
          <input name="variant" placeholder="Variant Search" defaultValue={filters.variantSearch} className="bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none w-56 shadow-sm" />
          <select className="bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none w-44 shadow-sm appearance-none">
            <option>All Channels</option>
          </select>
        </Form>

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-[24px] border border-gray-100 flex items-center gap-5 shadow-sm hover:shadow-md transition-shadow">
              <div className={`p-4 rounded-2xl ${m.bg} ${m.color}`}><m.icon size={22} /></div>
              <div>
                <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{m.label}</p>
                <p className="text-3xl font-bold">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 4-Bar Trend Chart */}
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold mb-8">Requests and Notifications Trend</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                  <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{paddingTop: '30px'}} />
                  <Bar name="Requests" dataKey="Request" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opened" dataKey="Opened" fill="#fb7185" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicked" dataKey="Clicked" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dynamic Funnel Chart */}
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold mb-8">Notification Performance Funnel</h3>
            <div className="space-y-6 mt-4">
              {funnelItems.map((item, idx) => {
                const percentage = stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0;
                return (
                  <div key={item.label} className="relative">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-500">{item.label}</span>
                      <span className="text-xs font-bold text-gray-400">50%</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-[#3b82f6] transition-all duration-1000 rounded-full" 
                                style={{ width: `${percentage}%` }}
                            ></div>
                        </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-center pt-6 gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-xs font-bold text-gray-600">Funnel</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Performing Placeholder */}
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Top Performing Products</h3>
          <div className="border-2 border-dashed border-gray-100 rounded-[24px] py-16 text-center">
            <p className="text-sm font-bold text-gray-800">No data found</p>
            <p className="text-xs text-gray-500 mt-1">Data will appear here once customers request a back-in-stock notification.</p>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-50">
            <h3 className="text-lg font-bold">Recent Subscribers</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-widest bg-gray-50/50">
                  <th className="px-8 py-5 font-bold">Customer Email</th>
                  <th className="px-8 py-5 font-bold">Product</th>
                  <th className="px-8 py-5 font-bold">Variant</th>
                  <th className="px-8 py-5 font-bold text-center">Engagement</th>
                  <th className="px-8 py-5 font-bold text-center">Status</th>
                  <th className="px-8 py-5 font-bold text-right">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {subscribers.map((sub) => (
                  <tr key={String(sub.id)} className="text-sm hover:bg-gray-50/50 transition-colors group">
                    <td className="px-8 py-5 font-semibold text-blue-600 truncate max-w-[200px]">{sub.email}</td>
                    <td className="px-8 py-5 font-bold text-gray-800">{sub.productTitle}</td>
                    <td className="px-8 py-5 text-gray-400 font-medium">{sub.variantTitle === 'N/A' ? '-' : sub.variantTitle}</td>
                    <td className="px-8 py-5">
                       <div className="flex items-center justify-center gap-4">
                          <span title="Opened" className={`w-2 h-2 rounded-full ${sub.opened ? 'bg-pink-500 shadow-lg shadow-pink-200' : 'bg-gray-200'}`}></span>
                          <span title="Clicked" className={`w-2 h-2 rounded-full ${sub.clicked ? 'bg-purple-500 shadow-lg shadow-purple-200' : 'bg-gray-200'}`}></span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="bg-[#ebfff5] text-[#10b981] px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-tight border border-[#d1fadf]">
                        In progress
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
    </div>
  );
}