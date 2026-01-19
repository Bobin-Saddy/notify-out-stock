import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, Info, TrendingUp
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

  const [totalRequests, notificationsSent, emailsOpened, emailsClicked, allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.count({ where: whereClause }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true } }),
    prisma.backInStock.count({ where: { ...whereClause, opened: true } }),
    prisma.backInStock.count({ where: { ...whereClause, clicked: true } }),
    prisma.backInStock.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } })
  ]);

  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;

  const subscribersWithProducts = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(
          `#graphql
          query getProductVariant($id: ID!) {
            productVariant(id: $id) {
              product { title }
              title
            }
          }`,
          { variables: { id: `gid://shopify/ProductVariant/${sub.variantId}` } }
        );
        const data = await response.json();
        return {
          ...sub,
          productTitle: data.data?.productVariant?.product?.title || 'Product Not Found',
          variantTitle: data.data?.productVariant?.title || ''
        };
      } catch (error) {
        return { ...sub, productTitle: 'Fetch Error' };
      }
    })
  );

  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Notifications: 0, Opens: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1; // Explicitly added for Graph
  });

  const firstRecord = await prisma.backInStock.findFirst({ where: { shop }, orderBy: { createdAt: 'asc' } });

  return json({
    shop,
    stats: { totalRequests, notificationsSent, deliveryRate, emailsOpened, openRate, emailsClicked, clickRate },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).slice(-30),
    trackingSince: firstRecord ? new Date(firstRecord.createdAt).toLocaleDateString() : 'Today',
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, shop, filters } = useLoaderData();
  const submit = useSubmit();

  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:shadow-xl hover:-translate-y-1">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
      <div className={`${bg} p-4 rounded-2xl shadow-inner`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-gray-900 flex items-center gap-3">
              Restock Insights <TrendingUp className="text-blue-500" />
            </h1>
            <p className="text-gray-500 font-medium mt-1">Real-time performance for <span className="text-blue-600 font-bold">{shop}</span></p>
          </div>
          <form onChange={(e) => submit(e.currentTarget)} className="flex flex-wrap gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
              <input 
                name="search"
                defaultValue={filters.search}
                className="pl-12 pr-6 py-3.5 bg-white border-0 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 w-64 md:w-80 outline-none" 
                placeholder="Search subscriber..." 
              />
            </div>
            <select 
              name="dateRange"
              defaultValue={filters.dateRange}
              className="bg-white border-0 px-6 py-3.5 rounded-2xl font-bold text-sm text-gray-700 shadow-sm outline-none cursor-pointer"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </form>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatBox title="Alert Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-500" bg="bg-blue-50" />
          <StatBox title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="text-purple-500" bg="bg-purple-50" />
          <StatBox title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="text-indigo-500" bg="bg-indigo-50" />
          <StatBox title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="text-pink-500" bg="bg-pink-50" />
          <StatBox title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="text-orange-500" bg="bg-orange-50" />
          <StatBox title="Recovered Value" value="Coming Soon" icon={ShoppingBag} color="text-emerald-500" bg="bg-emerald-50" />
        </div>

        {/* Dynamic Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-md">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black">Performance Trends</h3>
              <div className="flex gap-4 text-[10px] font-bold uppercase">
                <span className="flex items-center gap-1 text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Requests</span>
                <span className="flex items-center gap-1 text-pink-500"><div className="w-2 h-2 rounded-full bg-pink-500"></div> Opens</span>
                <span className="flex items-center gap-1 text-orange-500"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Clicks</span>
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOpen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EC4899" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClick" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} />
                  <Area type="monotone" dataKey="Requests" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorReq)" />
                  <Area type="monotone" dataKey="Opens" stroke="#EC4899" strokeWidth={3} fillOpacity={1} fill="url(#colorOpen)" />
                  <Area type="monotone" dataKey="Clicks" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#colorClick)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Engagement Funnel */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-md flex flex-col justify-between">
            <h3 className="text-xl font-black mb-8">Engagement Funnel</h3>
            <div className="space-y-8">
              {[
                { name: 'Total Requests', val: stats.totalRequests, color: 'bg-blue-500', max: stats.totalRequests },
                { name: 'Emails Sent', val: stats.notificationsSent, color: 'bg-purple-500', max: stats.totalRequests },
                { name: 'Emails Opened', val: stats.emailsOpened, color: 'bg-pink-500', max: stats.totalRequests },
                { name: 'Link Clicks', val: stats.emailsClicked, color: 'bg-orange-500', max: stats.totalRequests }
              ].map((item) => (
                <div key={item.name} className="relative">
                  <div className="flex justify-between text-[11px] font-black uppercase text-gray-400 mb-2">
                    <span>{item.name}</span>
                    <span className="text-gray-900">{item.val}</span>
                  </div>
                  <div className="w-full h-4 bg-gray-50 rounded-full border border-gray-100 overflow-hidden">
                    <div 
                      className={`${item.color} h-full transition-all duration-1000 ease-out`} 
                      style={{ width: `${item.max > 0 ? (item.val/item.max)*100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-gray-50 text-center">
               <p className="text-xs text-gray-400 font-bold">CONVERSION RATE</p>
               <p className="text-4xl font-black text-blue-600">{stats.clickRate}%</p>
            </div>
          </div>
        </div>

        {/* Activity Table */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-md overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-[#FAFBFC]">
            <h3 className="text-lg font-black">Recent Activity Log</h3>
            <div className="flex gap-2">
               <span className="px-3 py-1 bg-white shadow-sm border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500">S = SENT</span>
               <span className="px-3 py-1 bg-white shadow-sm border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500">O = OPENED</span>
               <span className="px-3 py-1 bg-white shadow-sm border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500">C = CLICKED</span>
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="bg-[#FAFBFC] text-[10px] font-black uppercase text-gray-400">
              <tr>
                <th className="px-8 py-4">Subscriber Email</th>
                <th className="px-8 py-4">Product Details</th>
                <th className="px-8 py-4 text-center">Interactions</th>
                <th className="px-8 py-4 text-right">Date Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-blue-50/30 transition-all cursor-default">
                  <td className="px-8 py-5 font-bold text-gray-800">{sub.email}</td>
                  <td className="px-8 py-5 text-gray-500 text-sm">{sub.productTitle}</td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-3">
                      <StatusDot active={sub.notified} color="bg-purple-500" label="S" />
                      <StatusDot active={sub.opened} color="bg-pink-500" label="O" />
                      <StatusDot active={sub.clicked} color="bg-orange-500" label="C" />
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right text-gray-400 font-bold text-xs">
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

function StatusDot({ active, color, label }) {
  return (
    <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${active ? `${color} text-white shadow-lg` : 'bg-gray-100 text-gray-300'}`}>
      {label}
    </div>
  );
}