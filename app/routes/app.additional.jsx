import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router"; // Fixed import
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  LayoutList, Bell, Truck, Eye, MousePointer2, ShoppingBag, Search, Settings, Info
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

  // 1. Fetching REAL metrics from your DB
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
      take: 10,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // 2. REAL Rate Calculations (No more simulation)
  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
  
  // Note: Conversion tracking disabled for now due to Protected Data restrictions
  const conversionRate = 0; 
  const conversions = 0;

  // 3. Shopify Product Fetching
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
        const variant = data.data?.productVariant;
        return {
          ...sub,
          productTitle: variant?.product?.title || 'Product Not Found',
          variantTitle: variant?.title || ''
        };
      } catch (error) {
        return { ...sub, productTitle: 'Fetch Error', variantTitle: '' };
      }
    })
  );

  // 4. Trend Map
  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Notifications: 0, Opens: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
    if (item.opened) dateMap[date].Opens += 1;
  });

  const firstRecord = await prisma.backInStock.findFirst({ where: { shop }, orderBy: { createdAt: 'asc' } });
  const trackingSince = firstRecord ? new Date(firstRecord.createdAt).toLocaleDateString() : 'Today';

  return json({
    shop,
    stats: {
      totalRequests, notificationsSent, deliveryRate,
      emailsOpened, openRate,
      emailsClicked, clickRate,
      conversions, conversionRate
    },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).slice(-30),
    trackingSince,
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, shop, trackingSince, filters } = useLoaderData();
  const submit = useSubmit();

  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
      <div className={`${bg} p-4 rounded-2xl`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFBFC] p-4 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">Restock Insights</h1>
            <p className="text-gray-500 font-medium">Real-time performance for <span className="text-blue-600">{shop}</span></p>
          </div>
          <div className="flex gap-3">
             <div className="bg-green-50 text-green-600 px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> Tracking Active
             </div>
          </div>
        </div>

        {/* Search & Filter */}
        <form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            <input 
              name="search"
              defaultValue={filters.search}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-100 rounded-2xl outline-none shadow-sm" 
              placeholder="Search email..." 
            />
          </div>
          <select 
            name="dateRange"
            defaultValue={filters.dateRange}
            className="bg-white border border-gray-100 px-4 py-3.5 rounded-2xl font-bold text-sm text-gray-600 shadow-sm"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </form>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatBox title="Alert Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-500" bg="bg-blue-50" />
          <StatBox title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="text-green-500" bg="bg-green-50" />
          <StatBox title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="text-indigo-500" bg="bg-indigo-50" />
          <StatBox title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="text-pink-500" bg="bg-pink-50" />
          <StatBox title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="text-orange-500" bg="bg-orange-50" />
          <StatBox title="Conversion Rate" value={`${stats.conversionRate}%`} icon={ShoppingBag} color="text-emerald-500" bg="bg-emerald-50" />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-10">
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Performance Trends</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                  <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                  <Legend />
                  <Bar name="Requests" dataKey="Requests" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  <Bar name="Sent" dataKey="Notifications" fill="#10B981" radius={[6, 6, 0, 0]} />
                  <Bar name="Opens" dataKey="Opens" fill="#EC4899" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Conversion Funnel</h3>
            <div className="space-y-6">
              {[
                { name: 'Requested', val: stats.totalRequests, color: 'bg-blue-500', max: stats.totalRequests },
                { name: 'Sent', val: stats.notificationsSent, color: 'bg-green-500', max: stats.totalRequests },
                { name: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500', max: stats.totalRequests },
                { name: 'Clicked', val: stats.emailsClicked, color: 'bg-orange-500', max: stats.totalRequests }
              ].map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-black uppercase text-gray-400">
                    <span>{item.name}</span>
                    <span className="text-gray-900 font-bold">{item.val}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-50 rounded-full border border-gray-100 overflow-hidden">
                    <div 
                      className={`${item.color} h-full transition-all duration-1000`} 
                      style={{ width: `${item.max > 0 ? (item.val/item.max)*100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Engagement Table */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#FAFBFC] text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <tr>
                <th className="px-8 py-5">Subscriber</th>
                <th className="px-8 py-5">Product</th>
                <th className="px-8 py-5 text-center">Tracking Status</th>
                <th className="px-8 py-5 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-blue-50/20 transition-all">
                  <td className="px-8 py-6 font-bold text-blue-600">{sub.email}</td>
                  <td className="px-8 py-6 text-gray-500 font-medium">{sub.productTitle}</td>
                  <td className="px-8 py-6">
                    <div className="flex justify-center gap-2">
                      <StatusDot active={sub.notified} color="bg-green-500" label="S" />
                      <StatusDot active={sub.opened} color="bg-pink-500" label="O" />
                      <StatusDot active={sub.clicked} color="bg-orange-500" label="C" />
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right text-gray-400 font-bold">
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
    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${active ? `${color} text-white` : 'bg-gray-100 text-gray-300'}`}>
      {label}
    </div>
  );
}