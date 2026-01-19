import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
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

  // Build the dynamic where clause based on filters
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

  // 1. Fetch ALL Real Metrics from your DB
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
      select: { createdAt: true, notified: true, opened: true }
    })
  ]);

  // 2. Real Rate Calculations
  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
  const conversionRate = emailsClicked > 0 ? Math.round((conversions / emailsClicked) * 100) : 0;

  // 3. Fetch Recent Subscribers + Shopify Product Data
  const recentSubscribers = await prisma.backInStock.findMany({
    where: whereClause,
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

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
        return { ...sub, productTitle: 'Deleted Product', variantTitle: '' };
      }
    })
  );

  // 4. Dynamic Chart Data (Trends)
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

  const firstRecord = await prisma.backInStock.findFirst({
    where: { shop },
    orderBy: { createdAt: 'asc' },
  });

  return json({
    shop,
    stats: {
      totalRequests, notificationsSent, deliveryRate,
      emailsOpened, openRate, emailsClicked, clickRate,
      conversions, conversionRate
    },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).slice(-30),
    trackingSince: firstRecord ? new Date(firstRecord.createdAt).toDateString() : 'Today',
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, shop, trackingSince, filters } = useLoaderData();
  const submit = useSubmit();

  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:scale-[1.02]">
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
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Analytics Dashboard</h1>
            <p className="text-gray-500 font-medium">Monitoring <span className="text-blue-600 font-bold">{shop}</span></p>
          </div>
          <div className="bg-white border border-blue-100 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
             <span className="text-xs font-bold text-gray-600">Active tracking since {trackingSince}</span>
          </div>
        </div>

        {/* Filters */}
        <form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            <input 
              name="search"
              defaultValue={filters.search}
              autoComplete="off"
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" 
              placeholder="Search by email or variant ID..." 
            />
          </div>
          <select 
            name="dateRange"
            defaultValue={filters.dateRange}
            className="bg-white border border-gray-100 px-4 py-3.5 rounded-2xl font-bold text-sm text-gray-700 shadow-sm"
          >
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
        </form>

        {/* Real KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatBox title="Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-600" bg="bg-blue-50" />
          <StatBox title="Sent" value={stats.notificationsSent} icon={Bell} color="text-green-600" bg="bg-green-50" />
          <StatBox title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="text-pink-600" bg="bg-pink-50" />
          <StatBox title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="text-orange-600" bg="bg-orange-50" />
          <StatBox title="Conversions" value={stats.conversions} icon={ShoppingBag} color="text-emerald-600" bg="bg-emerald-50" />
          <StatBox title="Conv. Rate" value={`${stats.conversionRate}%`} icon={Truck} color="text-indigo-600" bg="bg-indigo-50" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8 italic">Performance Over Time</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94A3B8'}} />
                  <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.05)'}} />
                  <Legend iconType="circle" />
                  <Bar name="New Requests" dataKey="Requests" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar name="Sent" dataKey="Notifications" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar name="Opened" dataKey="Opens" fill="#EC4899" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Marketing Funnel</h3>
            <div className="space-y-6">
              {[
                { label: 'Requested', val: stats.totalRequests, color: 'bg-blue-500', total: stats.totalRequests },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-500', total: stats.totalRequests },
                { label: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500', total: stats.totalRequests },
                { label: 'Clicked', val: stats.emailsClicked, color: 'bg-orange-500', total: stats.totalRequests },
                { label: 'Purchased', val: stats.conversions, color: 'bg-emerald-500', total: stats.totalRequests }
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-gray-400">
                    <span>{item.label}</span>
                    <span className="text-gray-900">{item.val}</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <div 
                      className={`${item.color} h-full transition-all duration-1000 ease-out`} 
                      style={{ width: `${item.total > 0 ? (item.val / item.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Table */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <tr>
                <th className="px-8 py-5">Customer</th>
                <th className="px-8 py-5">Product Info</th>
                <th className="px-8 py-5 text-center">Status Tracking</th>
                <th className="px-8 py-5 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-8 py-5 font-bold text-gray-800">{sub.email}</td>
                  <td className="px-8 py-5">
                    <p className="text-sm text-gray-600 font-medium">{sub.productTitle}</p>
                    <p className="text-[10px] text-gray-400">{sub.variantTitle || 'Default Variant'}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-1.5">
                      <StatusBadge active={sub.notified} label="Sent" color="bg-green-500" />
                      <StatusBadge active={sub.opened} label="Open" color="bg-pink-500" />
                      <StatusBadge active={sub.clicked} label="Click" color="bg-orange-500" />
                      <StatusBadge active={sub.purchased} label="$$" color="bg-emerald-500" />
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right text-xs text-gray-400 font-bold">
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

function StatusBadge({ active, label, color }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${active ? `${color} text-white border-transparent` : 'bg-transparent text-gray-300 border-gray-100'}`}>
      {label}
    </span>
  );
}