import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Eye, MousePointer2, Search, CheckCircle2, ArrowUpRight
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  const searchQuery = url.searchParams.get("search") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";

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
    ...(dateFilter !== "all" && { createdAt: { gte: dateFilterStart } })
  };

  // 1. Fetching real metrics from your DB
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
      where: whereClause,
      take: 8,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // 2. Calculations
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;

  // 3. Shopify Product Fetching
  const subscribersWithProducts = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(
          `#graphql
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              title
              product { title }
            }
          }`,
          { variables: { id: `gid://shopify/ProductVariant/${sub.variantId}` } }
        );
        const resJson = await response.json();
        const variant = resJson.data?.productVariant;
        return {
          ...sub,
          productTitle: variant?.product?.title || 'Product Not Found',
          variantTitle: variant?.title || ''
        };
      } catch (e) {
        return { ...sub, productTitle: 'Fetch Error', variantTitle: '' };
      }
    })
  );

  // 4. Trend Map
  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Opens: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
  });

  return json({
    stats: { totalRequests, notificationsSent, emailsOpened, openRate, emailsClicked, clickRate },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).slice(-30),
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const Card = ({ title, value, sub, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm transition-all hover:border-blue-200">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-current`}>
          <Icon size={22} />
        </div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</span>
      </div>
      <div className="space-y-1">
        <h2 className="text-3xl font-black text-gray-900">{value}</h2>
        <p className="text-xs font-medium text-gray-500">{sub}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FBFBFC] p-6 md:p-12 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Analytics</h1>
            <div className="flex items-center gap-2 mt-1 text-green-600">
              <CheckCircle2 size={14} />
              <span className="text-xs font-bold uppercase tracking-tighter">Live Database Sync</span>
            </div>
          </div>
          
          <form onChange={(e) => submit(e.currentTarget)} className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input 
                name="search" 
                defaultValue={filters.search}
                placeholder="Search email..." 
                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <select 
              name="dateRange" 
              defaultValue={filters.dateRange}
              className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 outline-none"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </form>
        </div>

        {/* Real Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card title="Alert Requests" value={stats.totalRequests} sub="Total signups" icon={LayoutList} color="text-blue-600" />
          <Card title="Alerts Sent" value={stats.notificationsSent} sub="Total emails sent" icon={Bell} color="text-purple-600" />
          <Card title="Open Rate" value={`${stats.openRate}%`} sub={`${stats.emailsOpened} emails opened`} icon={Eye} color="text-pink-600" />
          <Card title="Click Rate" value={`${stats.clickRate}%`} sub={`${stats.emailsClicked} unique clicks`} icon={MousePointer2} color="text-orange-600" />
        </div>

        {/* Chart Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 mb-8">Performance Trends</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 600, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 600, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.05)'}} />
                  <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                  <Bar name="Requests" dataKey="Requests" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick List */}
          <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center justify-between">
              Recent Activity <ArrowUpRight size={18} className="text-gray-400" />
            </h3>
            <div className="space-y-6">
              {recentSubscribers.map((sub) => (
                <div key={sub.id} className="flex flex-col gap-1 border-b border-gray-50 pb-4 last:border-0">
                  <span className="text-sm font-bold text-gray-900 truncate">{sub.email}</span>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400 font-medium truncate max-w-[150px]">{sub.productTitle}</span>
                    <div className="flex gap-1">
                       <StatusDot active={sub.notified} color="bg-green-500" />
                       <StatusDot active={sub.opened} color="bg-pink-500" />
                       <StatusDot active={sub.clicked} color="bg-orange-500" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ active, color }) {
  return <div className={`w-1.5 h-1.5 rounded-full ${active ? color : 'bg-gray-100'}`} />;
}