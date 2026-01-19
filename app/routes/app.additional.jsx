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

  // 1. Fetching ALL real interaction data
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

  // 2. Calculations
  const deliveryRate = totalRequests > 0 ? Math.round((notificationsSent / totalRequests) * 100) : 0;
  const openRate = notificationsSent > 0 ? Math.round((emailsOpened / notificationsSent) * 100) : 0;
  const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
  const conversionRate = totalRequests > 0 ? Math.round((emailsClicked / totalRequests) * 100) : 0;

  // 3. Product Details Fetch
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
          variantTitle: data.data?.productVariant?.title || '-'
        };
      } catch (e) { return { ...sub, productTitle: 'Error', variantTitle: '-' }; }
    })
  );

  // 4. Trend Data with Opens and Clicks added
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
      totalRequests, notificationsSent, deliveryRate, 
      emailsOpened, openRate, 
      emailsClicked, clickRate, 
      conversionRate 
    },
    recentSubscribers: subscribersWithProducts,
    trendData: Object.values(dateMap),
    filters: { search: searchQuery, dateRange: dateFilter }
  });
}

export default function BackInStockDashboard() {
  const { stats, recentSubscribers, trendData, filters } = useLoaderData();
  const submit = useSubmit();

  const MetricCard = ({ title, value, icon: Icon, color, iconColor }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
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
        <div className="flex justify-between items-start">
          <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
          <button className="bg-black text-white px-6 py-2 rounded-full text-sm font-semibold">Settings</button>
        </div>

        <form onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select name="dateRange" defaultValue={filters.dateRange} className="bg-white border p-2.5 rounded-lg text-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All Time</option>
          </select>
          <input name="search" defaultValue={filters.search} placeholder="Product Search" className="md:col-span-2 border p-2.5 rounded-lg text-sm" />
          <select className="bg-white border p-2.5 rounded-lg text-sm"><option>All Channels</option></select>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard title="Total Requests" value={stats.totalRequests} icon={FileText} color="bg-blue-100" iconColor="text-blue-600" />
          <MetricCard title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="bg-green-100" iconColor="text-green-600" />
          <MetricCard title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="bg-cyan-100" iconColor="text-cyan-600" />
          <MetricCard title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="bg-emerald-100" iconColor="text-emerald-600" />
          <MetricCard title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="bg-purple-100" iconColor="text-purple-600" />
          <MetricCard title="Conversion Rate" value={`${stats.conversionRate}%`} icon={TrendingUp} color="bg-indigo-100" iconColor="text-indigo-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-md font-bold mb-6">Interaction Trends</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <Tooltip />
                  <Legend iconType="circle" />
                  <Bar dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar dataKey="Opens" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar dataKey="Clicks" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-md font-bold mb-6">Performance Funnel</h3>
            <div className="space-y-5">
              {[
                { label: 'Sent', val: stats.notificationsSent, total: stats.totalRequests, color: 'bg-blue-500' },
                { label: 'Opened', val: stats.emailsOpened, total: stats.totalRequests, color: 'bg-green-500' },
                { label: 'Clicked', val: stats.emailsClicked, total: stats.totalRequests, color: 'bg-purple-500' }
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-1">
                    <span>{item.label} ({item.val})</span>
                    <span>{item.total > 0 ? Math.round((item.val/item.total)*100) : 0}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`${item.color} h-full transition-all`} style={{ width: `${item.total > 0 ? (item.val/item.total)*100 : 0}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 font-bold uppercase text-gray-400 border-b">
              <tr>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Interactions</th>
                <th className="px-6 py-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentSubscribers.map((sub) => (
                <tr key={sub.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-5 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {sub.notified ? 'Sent' : 'Waiting'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-2">
                      <div className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ${sub.opened ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>O</div>
                      <div className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ${sub.clicked ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-400'}`}>C</div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right text-gray-400">{new Date(sub.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}