import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, Info, CheckCircle2
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

  // Dynamic filter for DB queries
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

  // 1. Database Aggregations (Using your exact Schema fields)
  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    conversions,
    allRecords
  ] = await Promise.all([
    prisma.backInStock.count({ where: whereClause }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true } }),
    prisma.backInStock.count({ where: { ...whereClause, opened: true } }),
    prisma.backInStock.count({ where: { ...whereClause, clicked: true } }),
    prisma.backInStock.count({ where: { ...whereClause, purchased: true } }),
    prisma.backInStock.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, notified: true, opened: true, clicked: true }
    })
  ]);

  // 2. Performance Calculations
  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
  const conversionRate = emailsClicked > 0 ? Math.round((conversions / emailsClicked) * 100) : 0;

  // 3. Subscriber Detail List
  const recentSubscribers = await prisma.backInStock.findMany({
    where: whereClause,
    take: 15,
    orderBy: { createdAt: 'desc' },
  });

  // Fetch product titles from Shopify GraphQL
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
          productTitle: variant?.product?.title || 'Unknown Product',
          variantTitle: variant?.title || ''
        };
      } catch (e) {
        return { ...sub, productTitle: 'Not Found', variantTitle: '' };
      }
    })
  );

  // 4. Trend Data for Chart
  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Sent: 0, Clicks: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Sent += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
  });

  const firstRecord = await prisma.backInStock.findFirst({
    where: { shop },
    orderBy: { createdAt: 'asc' },
  });

  return json({
    stats: {
      totalRequests, notificationsSent, deliveryRate,
      emailsOpened, openRate, emailsClicked, clickRate,
      conversions, conversionRate
    },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).slice(-30),
    trackingSince: firstRecord ? new Date(firstRecord.createdAt).toDateString() : 'Initial Startup',
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, trackingSince, filters } = useLoaderData();
  const submit = useSubmit();

  // Reusable Component for KPI Cards
  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
      <div className={`${bg} p-4 rounded-2xl`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F8FA] p-6 md:p-10 text-slate-900 font-sans">
      {/* External CSS for clean rendering */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-gray-900">Performance</h1>
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle2 size={16} className="text-green-500" />
              <p className="text-gray-500 font-medium">Live monitoring active since <span className="text-gray-900 font-bold">{trackingSince}</span></p>
            </div>
          </div>
          <button className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-black transition-all">
            <Settings size={18} /> Configuration
          </button>
        </div>

        {/* Filter Controls */}
        <form onChange={(e) => submit(e.currentTarget)} className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              name="search"
              defaultValue={filters.search}
              placeholder="Search customers or variant IDs..."
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
            />
          </div>
          <select 
            name="dateRange"
            defaultValue={filters.dateRange}
            className="bg-white border border-gray-200 px-6 py-4 rounded-2xl font-bold text-sm shadow-sm outline-none"
          >
            <option value="7">Past 7 Days</option>
            <option value="30">Past 30 Days</option>
            <option value="90">Past 90 Days</option>
            <option value="all">All Time</option>
          </select>
        </form>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatBox title="Alert Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-600" bg="bg-blue-50" />
          <StatBox title="Emails Sent" value={stats.notificationsSent} icon={Bell} color="text-green-600" bg="bg-green-50" />
          <StatBox title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="text-pink-600" bg="bg-pink-50" />
          <StatBox title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="text-orange-600" bg="bg-orange-50" />
          <StatBox title="Conversions" value={stats.conversions} icon={ShoppingBag} color="text-emerald-600" bg="bg-emerald-50" />
          <StatBox title="Sales Growth" value={`${stats.conversionRate}%`} icon={Truck} color="text-purple-600" bg="bg-purple-50" />
        </div>

        {/* Main Analytics Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Chart Card */}
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-10">Engagement Trends</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: '#94A3B8'}} />
                  <Tooltip 
                    cursor={{fill: '#F8FAFC'}} 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} 
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px'}} />
                  <Bar name="Requests" dataKey="Requests" fill="#3B82F6" radius={[5, 5, 0, 0]} barSize={12} />
                  <Bar name="Sent" dataKey="Sent" fill="#10B981" radius={[5, 5, 0, 0]} barSize={12} />
                  <Bar name="Clicks" dataKey="Clicks" fill="#F59E0B" radius={[5, 5, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel Card */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-10">Conversion Funnel</h3>
            <div className="space-y-8">
              {[
                { label: 'Alerted', val: stats.notificationsSent, color: 'bg-green-500' },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500' },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-orange-500' },
                { label: 'Purchased', val: stats.conversions, color: 'bg-emerald-500' }
              ].map((item, idx) => (
                <div key={item.label} className="relative">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{item.label}</span>
                    <span className="text-sm font-black text-gray-900">{item.val}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-50 rounded-full border border-gray-100 overflow-hidden">
                    <div 
                      className={`${item.color} h-full rounded-full transition-all duration-1000`} 
                      style={{ width: `${stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-black italic">Recent Activity</h3>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase">Real-Time Data</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                  <th className="px-8 py-5">Customer Email</th>
                  <th className="px-8 py-5">Product Target</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50/20 transition-all">
                    <td className="px-8 py-6 font-bold text-blue-600 underline cursor-pointer">{sub.email}</td>
                    <td className="px-8 py-6">
                      <div className="text-gray-900 font-bold">{sub.productTitle}</div>
                      <div className="text-[11px] text-gray-400 font-medium">{sub.variantTitle}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-center gap-1.5">
                        <StatusDot active={sub.notified} label="Sent" />
                        <StatusDot active={sub.opened} label="Read" />
                        <StatusDot active={sub.clicked} label="Click" />
                        <StatusDot active={sub.purchased} label="Sold" />
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right text-gray-400 font-bold font-mono">
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

// Minimalist status helper
function StatusDot({ active, label }) {
  return (
    <div className={`flex flex-col items-center gap-1 group relative`}>
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'bg-gray-200'}`} />
      <span className={`text-[8px] font-black uppercase tracking-tighter ${active ? 'text-blue-600' : 'text-gray-300'}`}>
        {label}
      </span>
    </div>
  );
}