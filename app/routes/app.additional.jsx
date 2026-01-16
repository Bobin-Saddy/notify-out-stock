import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
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

  // Calculate date range for filtering
  const now = new Date();
  let dateFilterStart;
  if (dateFilter !== "all") {
    dateFilterStart = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);
  }

  // Build dynamic where clause
  const whereClause = {
    shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { variantId: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }),
    ...(dateFilterStart && { createdAt: { gte: dateFilterStart } })
  };

  // Fetch all metrics dynamically with REAL tracking data
  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    conversions,
    allSubscribers
  ] = await Promise.all([
    prisma.backInStock.count({ where: whereClause }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true } }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true, opened: true } }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true, clicked: true } }),
    prisma.backInStock.count({ where: { ...whereClause, notified: true, purchased: true } }),
    prisma.backInStock.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { 
        createdAt: true, 
        notified: true,
        opened: true,
        clicked: true,
        purchased: true
      }
    })
  ]);

  // Calculate REAL dynamic rates from actual data
  const deliveryRate = totalRequests > 0 ? ((notificationsSent / totalRequests) * 100).toFixed(0) : 0;
  const openRate = notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(0) : 0;
  const clickRate = emailsOpened > 0 ? ((emailsClicked / emailsOpened) * 100).toFixed(0) : 0;
  const conversionRate = emailsClicked > 0 ? ((conversions / emailsClicked) * 100).toFixed(0) : 0;

  // Recent subscribers with full tracking data
  const recentSubscribers = await prisma.backInStock.findMany({
    where: whereClause,
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      variantId: true,
      inventoryItemId: true,
      notified: true,
      opened: true,
      clicked: true,
      purchased: true,
      createdAt: true,
      updatedAt: true
    }
  });

  // Batch fetch product details using GraphQL
  const variantIds = [...new Set(recentSubscribers.map(s => s.variantId))];
  const productMap = {};

  if (variantIds.length > 0) {
    try {
      const variantQueries = variantIds.map((id, index) => 
        `variant${index}: productVariant(id: "gid://shopify/ProductVariant/${id}") {
          id
          product {
            title
          }
          title
          displayName
        }`
      ).join('\n');

      const response = await admin.graphql(
        `#graphql
        query getMultipleVariants {
          ${variantQueries}
        }`
      );

      const data = await response.json();
      
      variantIds.forEach((id, index) => {
        const variant = data.data?.[`variant${index}`];
        if (variant) {
          productMap[id] = {
            productTitle: variant.product?.title || 'Product Not Found',
            variantTitle: variant.title !== 'Default Title' ? variant.title : null,
            displayName: variant.displayName
          };
        } else {
          productMap[id] = {
            productTitle: 'Product Not Available',
            variantTitle: null,
            displayName: `Variant ${id}`
          };
        }
      });
    } catch (error) {
      console.error('Error fetching product details:', error);
      variantIds.forEach(id => {
        productMap[id] = {
          productTitle: 'Product Details Unavailable',
          variantTitle: null,
          displayName: `Variant ${id}`
        };
      });
    }
  }

  // Merge product details with subscribers
  const subscribersWithProducts = recentSubscribers.map(sub => ({
    ...sub,
    ...productMap[sub.variantId]
  }));

  // Dynamic trend data generation with ALL metrics
  const dateMap = {};
  allSubscribers.forEach(item => {
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dateMap[date]) {
      dateMap[date] = { 
        name: date, 
        Requests: 0, 
        Notifications: 0,
        Opens: 0,
        Clicks: 0,
        Purchases: 0
      };
    }
    dateMap[date].Requests += 1;
    if (item.notified) dateMap[date].Notifications += 1;
    if (item.opened) dateMap[date].Opens += 1;
    if (item.clicked) dateMap[date].Clicks += 1;
    if (item.purchased) dateMap[date].Purchases += 1;
  });

  const trendData = Object.values(dateMap).slice(-30);

  // Get first record date for banner
  const firstRecord = await prisma.backInStock.findFirst({
    where: { shop },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  });

  const trackingSince = firstRecord 
    ? new Date(firstRecord.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return json({
    shop,
    stats: {
      totalRequests,
      notificationsSent,
      deliveryRate: parseInt(deliveryRate),
      emailsOpened,
      openRate: parseInt(openRate),
      emailsClicked,
      clickRate: parseInt(clickRate),
      conversions,
      conversionRate: parseInt(conversionRate)
    },
    recentSubscribers: subscribersWithProducts,
    trendData,
    trackingSince,
    filters: {
      search: searchQuery,
      dateRange: dateFilter
    }
  });
}

export default function EnhancedDashboard() {
  const { stats, recentSubscribers, trendData, shop, trackingSince, filters } = useLoaderData();

  const StatBox = ({ title, value, icon: Icon, color, bg }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between transition-transform hover:scale-[1.02]">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
      <div className={`${bg} p-4 rounded-2xl`}>
        <Icon size={24} className={color} />
      </div>
    </div>
  );

  const getStatusInfo = (subscriber) => {
    if (subscriber.purchased) return { text: 'Purchased ✓', color: 'bg-emerald-100 text-emerald-700' };
    if (subscriber.clicked) return { text: 'Clicked', color: 'bg-orange-100 text-orange-700' };
    if (subscriber.opened) return { text: 'Opened', color: 'bg-pink-100 text-pink-700' };
    if (subscriber.notified) {
      const hoursSinceNotification = (new Date() - new Date(subscriber.updatedAt)) / (1000 * 60 * 60);
      if (hoursSinceNotification < 1) return { text: 'Just Sent', color: 'bg-green-100 text-green-700' };
      if (hoursSinceNotification < 24) return { text: 'Sent Today', color: 'bg-green-100 text-green-700' };
      return { text: 'Delivered', color: 'bg-green-50 text-green-600' };
    }
    return { text: 'Monitoring', color: 'bg-blue-50 text-blue-500' };
  };

  return (
    <div className="min-h-screen bg-[#FAFBFC] p-4 md:p-10 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Navigation Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">Restockly Insights</h1>
            <p className="text-gray-500 font-medium">Real-time stock alert performance for <span className="text-blue-600">{shop}</span></p>
          </div>
          <button className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold shadow-xl hover:bg-black transition-all">
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Dynamic Info Banner */}
        <div className="bg-white border border-blue-50 p-4 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="bg-blue-500 p-2 rounded-xl text-white"><Info size={20} /></div>
          <p className="text-sm text-gray-600 font-medium">
            System tracking active since {trackingSince}. Showing {filters.dateRange === "all" ? "all-time" : `last ${filters.dateRange} days`} data with real-time tracking.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            <input 
              name="search"
              defaultValue={filters.search}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm" 
              placeholder="Search by email or variant ID..." 
            />
          </div>
          <select 
            name="dateRange"
            defaultValue={filters.dateRange}
            onChange={(e) => e.target.form.submit()}
            className="bg-white border border-gray-100 px-4 py-3.5 rounded-2xl font-bold text-sm text-gray-600 shadow-sm"
          >
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
        </form>

        {/* 6-Grid KPI Section - REAL DATA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatBox title="Total Requests" value={stats.totalRequests} icon={LayoutList} color="text-blue-500" bg="bg-blue-50" />
          <StatBox title="Notifications Sent" value={stats.notificationsSent} icon={Bell} color="text-green-500" bg="bg-green-50" />
          <StatBox title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={Truck} color="text-indigo-500" bg="bg-indigo-50" />
          <StatBox title="Open Rate" value={`${stats.openRate}%`} icon={Eye} color="text-pink-500" bg="bg-pink-50" />
          <StatBox title="Click Rate" value={`${stats.clickRate}%`} icon={MousePointer2} color="text-orange-500" bg="bg-orange-50" />
          <StatBox title="Conversion Rate" value={`${stats.conversionRate}%`} icon={ShoppingBag} color="text-emerald-500" bg="bg-emerald-50" />
        </div>

        {/* Chart & Funnel Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-10">
          
          {/* Bar Chart Analytics - Dynamic Data */}
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Performance Trends</h3>
            {trendData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94A3B8'}} />
                    <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                    <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                    <Bar dataKey="Requests" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={15} />
                    <Bar dataKey="Notifications" fill="#10B981" radius={[6, 6, 0, 0]} barSize={15} />
                    <Bar dataKey="Opens" fill="#EC4899" radius={[6, 6, 0, 0]} barSize={15} />
                    <Bar dataKey="Clicks" fill="#F97316" radius={[6, 6, 0, 0]} barSize={15} />
                    <Bar dataKey="Purchases" fill="#059669" radius={[6, 6, 0, 0]} barSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-gray-300 font-bold">
                No data available for selected period
              </div>
            )}
          </div>

          {/* Vertical Funnel - REAL DATA */}
          <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <h3 className="text-xl font-black mb-8">Conversion Funnel</h3>
            <div className="space-y-6">
              {[
                { name: 'Requested', val: stats.totalRequests, color: 'bg-blue-500', max: stats.totalRequests },
                { name: 'Sent', val: stats.notificationsSent, color: 'bg-green-500', max: stats.totalRequests },
                { name: 'Opened', val: stats.emailsOpened, color: 'bg-pink-500', max: stats.totalRequests },
                { name: 'Clicked', val: stats.emailsClicked, color: 'bg-orange-500', max: stats.totalRequests },
                { name: 'Purchased', val: stats.conversions, color: 'bg-emerald-500', max: stats.totalRequests }
              ].map((item) => {
                const percentage = item.max > 0 ? (item.val / item.max) * 100 : 0;
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-black uppercase text-gray-400 tracking-wider">
                      <span>{item.name}</span>
                      <span className="text-gray-900 font-bold">{item.val}</span>
                    </div>
                    <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                      <div 
                        className={`${item.color} h-full rounded-full transition-all duration-1000`} 
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modern Subscribers Table - REAL TRACKING DATA */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden mt-8">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-black">Recent Engagement</h3>
            <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-xs font-bold uppercase">
              {recentSubscribers.length} {recentSubscribers.length === 1 ? 'Record' : 'Records'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#FAFBFC] text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                <tr>
                  <th className="px-8 py-5">Subscriber</th>
                  <th className="px-8 py-5">Product Target</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right">Registered On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {recentSubscribers.length > 0 ? (
                  recentSubscribers.map((sub) => {
                    const statusInfo = getStatusInfo(sub);
                    const productDisplay = sub.variantTitle 
                      ? `${sub.productTitle} - ${sub.variantTitle}`
                      : sub.productTitle || sub.displayName;
                    
                    return (
                      <tr key={sub.id} className="hover:bg-blue-50/30 transition-all">
                        <td className="px-8 py-6 font-bold text-blue-600">{sub.email}</td>
                        <td className="px-8 py-6 text-gray-500 font-medium">{productDisplay}</td>
                        <td className="px-8 py-6 text-center">
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${statusInfo.color}`}>
                            {statusInfo.text}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right text-gray-400 font-bold">
                          {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" className="p-20 text-center text-gray-300 font-bold italic uppercase tracking-widest">
                      {filters.search ? 'No matching records found' : 'No subscriptions yet'}
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