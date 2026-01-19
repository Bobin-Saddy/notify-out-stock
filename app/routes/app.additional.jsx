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
  
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "all";
  const statusFilter = url.searchParams.get("status") || "all";

  const now = new Date();
  let dateFilterStart = new Date(0);
  if (dateFilter !== "all") {
    dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);
  }

  // Base stats hamesha date range follow karenge
  const baseWhere = {
    shop,
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } }),
  };

  // Table where clause (Search + Status)
  const tableWhere = { 
    ...baseWhere,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { variantId: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }),
  };

  if (statusFilter === "notified") tableWhere.notified = true;
  if (statusFilter === "pending") tableWhere.notified = false;
  if (statusFilter === "opened") tableWhere.opened = true;
  if (statusFilter === "clicked") tableWhere.clicked = true;

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers
  ] = await Promise.all([
    prisma.backInStock.count({ where: baseWhere }),
    prisma.backInStock.count({ where: { ...baseWhere, notified: true } }),
    prisma.backInStock.count({ where: { ...baseWhere, opened: true } }),
    prisma.backInStock.count({ where: { ...baseWhere, clicked: true } }),
    prisma.backInStock.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ 
      where: tableWhere, 
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

  const handleFilterChange = (e) => {
    submit(e.currentTarget.form, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans text-gray-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-3xl font-black tracking-tight">Analytics Dashboard</h1>
          <button className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-gray-800 transition-all">
            <Download size={18} /> Export
          </button>
        </div>

        {/* Filters Section */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <form method="get" className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Search Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  name="search"
                  placeholder="Email or Variant..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onBlur={(e) => submit(e.target.form)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Time Period</label>
              <select name="dateRange" defaultValue={filters.dateRange} onChange={handleFilterChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                <option value="all">All Time</option>
                <option value="1">Last 24 Hours</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Status</label>
              <select name="status" defaultValue={filters.status} onChange={handleFilterChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                <option value="all">All Status</option>
                <option value="notified">Notified</option>
                <option value="pending">Pending</option>
                <option value="opened">Opened</option>
                <option value="clicked">Clicked</option>
              </select>
            </div>

            <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
              Apply Filters
            </button>
          </form>
        </div>

        {/* 4 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Requests', val: stats.totalRequests, icon: ShoppingBag, color: 'bg-blue-600' },
            { label: 'Sent', val: stats.notificationsSent, icon: Bell, color: 'bg-green-600' },
            { label: 'Open Rate', val: `${stats.openRate}%`, icon: Eye, color: 'bg-pink-600' },
            { label: 'CTR', val: `${stats.ctr}%`, icon: MousePointer2, color: 'bg-purple-600' },
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm">
              <div className={`p-3 rounded-xl ${item.color} text-white shadow-md`}><item.icon size={20} /></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                <p className="text-2xl font-black">{item.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts and Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Requests & Notifications</h3>
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
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Funnel Progress</h3>
            <div className="space-y-7">
              {[
                { label: 'Requests', val: stats.totalRequests, color: 'bg-blue-600' },
                { label: 'Notifications Sent', val: stats.notificationsSent, color: 'bg-green-600' },
                { label: 'Email Opens', val: stats.emailsOpened, color: 'bg-pink-600' },
                { label: 'Link Clicks', val: stats.emailsClicked, color: 'bg-purple-600' }
              ].map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] font-black uppercase mb-2">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-gray-900">{item.val}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color}`} style={{ width: `${stats.totalRequests > 0 ? (item.val/stats.totalRequests)*100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-black text-gray-800 uppercase">Subscriber Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white border-b border-gray-50">
                  <th className="px-8 py-5">Customer</th>
                  <th className="px-8 py-5">Product</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-center">Engagement</th>
                  <th className="px-8 py-5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-900">{sub.email}</p>
                      <p className="text-[10px] text-gray-400 font-medium uppercase">ID: {String(sub.id).slice(-6)}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-800 leading-tight">{sub.productTitle}</p>
                      <p className="text-[10px] text-blue-500 font-black uppercase">{sub.variantTitle}</p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${sub.notified ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        {sub.notified ? '✓ Sent' : '• Queue'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${sub.opened ? 'bg-pink-500' : 'bg-gray-200'}`} />
                          <span className="text-[8px] font-black text-gray-400 uppercase">Open</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${sub.clicked ? 'bg-purple-500' : 'bg-gray-200'}`} />
                          <span className="text-[8px] font-black text-gray-400 uppercase">Click</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className="text-sm font-bold text-gray-900">{new Date(sub.createdAt).toLocaleDateString()}</p>
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