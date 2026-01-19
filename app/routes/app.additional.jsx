import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, TrendingUp, Search, Filter, Download, ShoppingBag, X
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  // URL Params Fetching
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "all";
  const statusFilter = url.searchParams.get("status") || "all";

  const now = new Date();
  let dateFilterStart = new Date(0); // Default: All time
  if (dateFilter !== "all") {
    dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);
  }

  // Filter Logic for Queries
  const whereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { variantId: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }),
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } }),
  };

  // Status specific where clause
  const statusWhere = { ...whereClause };
  if (statusFilter === "notified") statusWhere.notified = true;
  if (statusFilter === "pending") statusWhere.notified = false;
  if (statusFilter === "opened") statusWhere.opened = true;
  if (statusFilter === "clicked") statusWhere.clicked = true;

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers
  ] = await Promise.all([
    prisma.backInStock.count({ where: whereClause }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true } }),
    prisma.backInStock.count({ where: { ...whereClause, opened: true } }),
    prisma.backInStock.count({ where: { ...whereClause, clicked: true } }),
    prisma.backInStock.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ 
      where: statusWhere, 
      take: 50, 
      orderBy: { createdAt: 'desc' } 
    })
  ]);

  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              displayName
              product { title }
            }
          }
        `, { variables: { id: `gid://shopify/ProductVariant/${sub.variantId}` } });
        const data = await response.json();
        const variant = data?.data?.productVariant;
        return {
          ...sub,
          productTitle: variant?.product?.title || 'Product Not Found',
          variantTitle: variant?.displayName || ''
        };
      } catch (e) {
        return { ...sub, productTitle: 'Unknown Product', variantTitle: '' };
      }
    })
  );

  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Sent: 0, Opens: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Sent += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
  });

  return json({
    stats: { 
      totalRequests, 
      notificationsSent, 
      emailsOpened, 
      emailsClicked,
      openRate: notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(1) : 0,
      ctr: notificationsSent > 0 ? ((emailsClicked / notificationsSent) * 100).toFixed(1) : 0
    },
    recentSubscribers: enrichedSubscribers,
    trendData: Object.values(dateMap).slice(-7),
    filters: { search: searchQuery, dateRange: dateFilter, status: statusFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();
  const [searchValue, setSearchValue] = useState(filters.search);

  // Auto-submit form when selects change
  const handleFilterChange = (e) => {
    submit(e.currentTarget.form, { replace: true });
  };

  const clearFilters = () => {
    setSearchValue("");
    const form = document.getElementById("filter-form");
    form.search.value = "";
    form.dateRange.value = "all";
    form.status.value = "all";
    submit(form);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Analytics Dashboard</h1>
            <p className="text-gray-500 font-medium">Real-time performance of your restock alerts</p>
          </div>
          <button className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-gray-800 transition-all">
            <Download size={18} /> Export CSV
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <form id="filter-form" method="get" className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block ml-1">Search Customer</label>
              <Search className="absolute left-3 top-9 text-gray-400" size={16} />
              <input 
                type="text" 
                name="search"
                placeholder="Email or Variant ID..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onBlur={(e) => submit(e.target.form)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block ml-1">Time Period</label>
              <select name="dateRange" defaultValue={filters.dateRange} onChange={handleFilterChange} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                <option value="all">All Time</option>
                <option value="1">Last 24 Hours</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block ml-1">Engagement Status</label>
              <select name="status" defaultValue={filters.status} onChange={handleFilterChange} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                <option value="all">All Subscribers</option>
                <option value="notified">Successfully Notified</option>
                <option value="pending">Pending/In Queue</option>
                <option value="opened">Opened Email</option>
                <option value="clicked">Clicked Link</option>
              </select>
            </div>

            <button 
              type="button" 
              onClick={clearFilters}
              className="text-sm font-bold text-red-500 hover:bg-red-50 py-2 rounded-xl transition-colors"
            >
              Clear All Filters
            </button>
          </form>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'bg-blue-600' },
            { label: 'Notified', val: stats.notificationsSent, icon: Bell, color: 'bg-green-600' },
            { label: 'Open Rate', val: `${stats.openRate}%`, icon: Eye, color: 'bg-pink-600' },
            { label: 'CTR', val: `${stats.ctr}%`, icon: MousePointer2, color: 'bg-purple-600' },
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className={`p-4 rounded-2xl ${item.color} text-white shadow-lg`}>
                <item.icon size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                <p className="text-2xl font-black text-gray-900">{item.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts & Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Performance Trends</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94A3B8'}} />
                  <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontSize: '10px', fontWeight: 800}} />
                  <Bar name="Requests" dataKey="Requests" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Funnel Conversion</h3>
            <div className="space-y-7">
              {[
                { label: 'Total Requests', val: stats.totalRequests, color: 'bg-blue-600' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-600' },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-pink-600' },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-purple-600' }
              ].map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-gray-900">{item.val}</span>
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color}`} style={{ width: `${stats.totalRequests > 0 ? (item.val/stats.totalRequests)*100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Updated Activity Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="text-sm font-black text-gray-800 uppercase">Subscriber Activity</h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              Showing {recentSubscribers.length} records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white border-b border-gray-50">
                  <th className="px-8 py-5 text-left">Customer</th>
                  <th className="px-8 py-5 text-left">Product Details</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-center">Engagement</th>
                  <th className="px-8 py-5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentSubscribers.length > 0 ? recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-900">{sub.email}</p>
                      <p className="text-[10px] text-gray-400 font-medium">ID: #{sub.id.slice(-5)}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-800 leading-tight">{sub.productTitle}</p>
                      <p className="text-[10px] text-blue-500 font-black uppercase mt-0.5">{sub.variantTitle}</p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${sub.notified ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                        {sub.notified ? '✓ Sent' : '• Pending'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-2.5 h-2.5 rounded-full ${sub.opened ? 'bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'bg-gray-200'}`} />
                          <span className="text-[8px] font-bold text-gray-400 uppercase">Open</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-2.5 h-2.5 rounded-full ${sub.clicked ? 'bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]' : 'bg-gray-200'}`} />
                          <span className="text-[8px] font-bold text-gray-400 uppercase">Click</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className="text-sm font-bold text-gray-900">{new Date(sub.createdAt).toLocaleDateString()}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{new Date(sub.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-8 py-20 text-center">
                      <p className="text-gray-400 font-bold italic">No records found matching your filters.</p>
                    </td>
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