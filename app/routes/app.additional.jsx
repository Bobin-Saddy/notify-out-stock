import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  FileText, Bell, Truck, Eye, MousePointer2, TrendingUp, Search, Settings
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

  // Dynamic Query Filter
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

  // 1. Fetch REAL metrics from DB
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

  // 2. Dynamic Rate Calculations
  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
  
  // Dynamic Conversion (Clicks to Opens ratio)
  const conversionRate = emailsClicked > 0 ? Math.round((emailsClicked / totalRequests) * 100) : 0;

  // 3. Dynamic Product Details for Table
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
          variantTitle: variant?.title || '-'
        };
      } catch (error) {
        return { ...sub, productTitle: 'Fetch Error', variantTitle: '-' };
      }
    })
  );

  // 4. Dynamic Trend Data for Graph
  const dateMap = {};
  allRecords.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { name: date, Requests: 0, Notifications: 0 };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
  });

  return json({
    shop,
    stats: { totalRequests, notificationsSent, deliveryRate, openRate, clickRate, conversionRate },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap).sort((a, b) => new Date(a.name) - new Date(b.name)),
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function BackInStockDashboard() {
  const { stats, recentSubscribers, trendData, filters, shop } = useLoaderData();
  const submit = useSubmit();

  const MetricCard = ({ title, value, icon: Icon, color, iconColor }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
        <Icon size={24} className={iconColor} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-0.5">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-6 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Real-time performance for <span className="font-bold text-blue-600">{shop}</span></p>
          </div>
          <button className="bg-black text-white px-6 py-2 rounded-full text-sm font-semibold shadow-sm flex items-center gap-2">
            <Settings size={16} /> Settings
          </button>
        </div>

        {/* Filters Row - Dynamic Form */}
        <form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select name="dateRange" defaultValue={filters.dateRange} className="bg-white border border-gray-200 p-2.5 rounded-lg text-sm text-gray-600 outline-none">
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All Time</option>
            </select>
            <div className="relative col-span-1 md:col-span-2">
              <input name="search" defaultValue={filters.search} placeholder="Search by email or product..." className="w-full bg-white border border-gray-200 p-2.5 rounded-lg text-sm outline-none" />
            </div>
            <select className="bg-white border border-gray-200 p-2.5 rounded-lg text-sm text-gray-600 outline-none">
              <option>All Channels</option>
            </select>
        </form>

        {/* Dynamic Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests} icon={FileText} color="bg-blue-100" iconColor="text-blue-600" />
          <MetricCard title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="text-green-600" bg="bg-green-100" />
          <MetricCard title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="bg-cyan-100" iconColor="text-cyan-600" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="bg-emerald-100" iconColor="text-emerald-600" />
          <MetricCard title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="bg-purple-100" iconColor="text-purple-600" />
          <MetricCard title="Conversion Rate" value={`${stats.conversionRate}%`} icon={TrendingUp} color="bg-indigo-100" iconColor="text-indigo-600" />
        </div>

        {/* Dynamic Middle Section */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Trend Graph */}
          <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-md font-bold text-gray-800 mb-6">Requests and Notifications Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#999'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#999'}} />
                  <Tooltip cursor={{fill: '#f9f9f9'}} />
                  <Legend iconType="circle" wrapperStyle={{fontSize: '12px', paddingTop: '20px'}} />
                  <Bar dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                  <Bar dataKey="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Funnel - Fully Dynamic */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-md font-bold text-gray-800 mb-6">Performance Funnel</h3>
            <div className="space-y-5">
              {[
                { label: 'Requests', val: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Sent', val: stats.notificationsSent, color: 'bg-green-500' },
                { label: 'Opened', val: stats.emailsOpened || 0, color: 'bg-emerald-500' },
                { label: 'Clicked', val: stats.emailsClicked || 0, color: 'bg-purple-500' }
              ].map((item) => {
                const percentage = stats.totalRequests > 0 ? (item.val / stats.totalRequests) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-1">
                      <span>{item.label}</span>
                      <span>{Math.round(percentage)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`${item.color} h-full transition-all duration-700`} style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dynamic Activity Table */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6">
            <h3 className="text-md font-bold text-gray-800">Recent Activity Log</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-y border-gray-50">
                <th className="px-6 py-4">Customer Email</th>
                <th className="px-6 py-4">Product Details</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-right">Registered On</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {recentSubscribers.length > 0 ? recentSubscribers.map((sub) => (
                <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-5 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-6 py-5">
                    <div className="text-gray-900 font-semibold">{sub.productTitle}</div>
                    <div className="text-gray-400 text-[10px]">{sub.variantTitle}</div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {sub.notified ? 'Delivered' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right text-gray-400 font-medium">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="p-10 text-center text-gray-400">No recent activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}