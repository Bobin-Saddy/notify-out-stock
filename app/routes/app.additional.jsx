import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, TrendingUp, Search, Filter, Download, ShoppingBag
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";
  const statusFilter = url.searchParams.get("status") || "all";

  const now = new Date();
  const dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

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

  // Status Filter Logic
  if (statusFilter === "notified") whereClause.notified = true;
  if (statusFilter === "pending") whereClause.notified = false;
  if (statusFilter === "opened") whereClause.opened = true;
  if (statusFilter === "clicked") whereClause.clicked = true;

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers
  ] = await Promise.all([
    prisma.backInStock.count({ where: { shop, createdAt: { gte: dateFilter !== "all" ? dateFilterStart : new Date(0) } } }),
    prisma.backInStock.count({ where: { shop, notified: true, createdAt: { gte: dateFilter !== "all" ? dateFilterStart : new Date(0) } } }),
    prisma.backInStock.count({ where: { shop, opened: true, createdAt: { gte: dateFilter !== "all" ? dateFilterStart : new Date(0) } } }),
    prisma.backInStock.count({ where: { shop, clicked: true, createdAt: { gte: dateFilter !== "all" ? dateFilterStart : new Date(0) } } }),
    prisma.backInStock.findMany({
      where: { shop, createdAt: { gte: dateFilter !== "all" ? dateFilterStart : new Date(0) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ 
      where: whereClause, 
      take: 20, 
      orderBy: { createdAt: 'desc' } 
    })
  ]);

  // Shopify details fetch for table
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

  // Graph Data Processing
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
    trendData: Object.values(dateMap).reverse().slice(0, 7),
    filters: { search: searchQuery, dateRange: dateFilter, status: statusFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();
  const [searchValue, setSearchValue] = useState(filters.search);

  const MetricCard = ({ title, value, icon: Icon, gradient }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
      <div className={`absolute right-0 top-0 w-24 h-24 ${gradient} opacity-5 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-110`}></div>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${gradient} text-white shadow-lg`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</p>
          <p className="text-2xl font-black text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black text-gray-900">Analytics Overview</h1>
          <div className="flex gap-2">
             <form onChange={(e) => submit(e.currentTarget)} className="flex gap-2">
                <select name="dateRange" defaultValue={filters.dateRange} className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm">
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
             </form>
          </div>
        </div>

        {/* 4 Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard title="Requests" value={stats.totalRequests} icon={ShoppingBag} gradient="bg-blue-600" />
          <MetricCard title="Sent" value={stats.notificationsSent} icon={Bell} gradient="bg-green-600" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} gradient="bg-pink-600" />
          <MetricCard title="CTR" value={`${stats.ctr}%`} icon={MousePointer2} gradient="bg-purple-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Trend Chart with 4 Bars */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8">Requests and Notifications Trend</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94A3B8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '30px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase'}} />
                  <Bar name="Requests" dataKey="Requests" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar name="Sent" dataKey="Sent" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8">Notification Performance Funnel</h3>
            <div className="space-y-8">
              {[
                { label: 'Total Requests', val: stats.totalRequests, color: 'bg-blue-600' },
                { label: 'Successfully Sent', val: stats.notificationsSent, color: 'bg-green-600' },
                { label: 'Total Opens', val: stats.emailsOpened, color: 'bg-pink-600' },
                { label: 'Total Clicks', val: stats.emailsClicked, color: 'bg-purple-600' }
              ].map((item, idx) => {
                const perc = stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0;
                return (
                  <div key={idx} className="relative">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">{item.label}</span>
                      <span className="text-xs font-bold text-gray-900">{item.val}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${perc}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-black text-gray-800 uppercase">Recent Requests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white">
                  <th className="px-8 py-4 text-left">Customer</th>
                  <th className="px-8 py-4 text-left">Product</th>
                  <th className="px-8 py-4 text-center">Status</th>
                  <th className="px-8 py-4 text-center">Engagement</th>
                  <th className="px-8 py-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-8 py-5 text-sm font-bold text-gray-900">{sub.email}</td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-800">{sub.productTitle}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{sub.variantTitle}</p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${sub.notified ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {sub.notified ? 'Sent' : 'In Queue'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${sub.opened ? 'bg-pink-500' : 'bg-gray-200'}`} title="Opened"></div>
                        <div className={`w-2 h-2 rounded-full ${sub.clicked ? 'bg-purple-500' : 'bg-gray-200'}`} title="Clicked"></div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                          {sub.opened ? 'Opened' : ''} {sub.clicked ? '& Clicked' : ''}
                          {!sub.opened && !sub.clicked ? 'No Activity' : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right text-xs font-bold text-gray-500">
                      {new Date(sub.createdAt).toLocaleDateString()}
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