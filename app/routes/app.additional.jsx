import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "react-router";
import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import { 
  FileText, Bell, Truck, Eye, MousePointer2, TrendingUp, Search, Settings, Package, Mail, Calendar, Filter, Download, ChevronDown, ExternalLink, ShoppingBag
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
    ...(statusFilter === "notified" && { notified: true }),
    ...(statusFilter === "pending" && { notified: false }),
    ...(statusFilter === "opened" && { opened: true }),
    ...(statusFilter === "clicked" && { clicked: true })
  };

  const [
    totalRequests, 
    notificationsSent,
    emailsOpened,
    emailsClicked,
    allRecords,
    recentSubscribers,
    allVariantRecords
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
      take: 20, 
      orderBy: { createdAt: 'desc' } 
    }),
    prisma.backInStock.findMany({
      where: whereClause,
      select: { variantId: true }
    })
  ]);

  // Process top variants manually
  const variantCounts = {};
  allVariantRecords.forEach(record => {
    const variantId = record.variantId;
    if (!variantCounts[variantId]) {
      variantCounts[variantId] = 0;
    }
    variantCounts[variantId] += 1;
  });

  const topVariantIds = Object.entries(variantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Fetch product details from Shopify for top variants
  const topProducts = [];
  for (const [variantId, count] of topVariantIds) {
    try {
      const response = await admin.graphql(`
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
            displayName
            product {
              title
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/ProductVariant/${variantId}` }
      });
      
      const data = await response.json();
      const variant = data?.data?.productVariant;
      
      topProducts.push({
        variantId,
        productTitle: variant?.product?.title || 'Unknown Product',
        variantTitle: variant?.displayName || variant?.title || 'Default Variant',
        count
      });
    } catch (error) {
      topProducts.push({
        variantId,
        productTitle: 'Unknown Product',
        variantTitle: 'Unknown Variant',
        count
      });
    }
  }

  // Fetch product details for recent subscribers
  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      try {
        const response = await admin.graphql(`
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              id
              title
              displayName
              sku
              product {
                title
              }
            }
          }
        `, {
          variables: { id: `gid://shopify/ProductVariant/${sub.variantId}` }
        });
        
        const data = await response.json();
        const variant = data?.data?.productVariant;
        
        return {
          ...sub,
          productTitle: variant?.product?.title || 'Unknown Product',
          variantTitle: variant?.displayName || variant?.title || 'Default Variant',
          sku: variant?.sku || 'N/A'
        };
      } catch (error) {
        return {
          ...sub,
          productTitle: 'Unknown Product',
          variantTitle: 'Unknown Variant',
          sku: 'N/A'
        };
      }
    })
  );

  // Trend Data
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

  const conversionRate = notificationsSent > 0 ? ((emailsClicked / notificationsSent) * 100).toFixed(1) : 0;
  const openRate = notificationsSent > 0 ? ((emailsOpened / notificationsSent) * 100).toFixed(1) : 0;

  return json({
    stats: { 
      totalRequests, 
      notificationsSent, 
      emailsOpened, 
      emailsClicked,
      conversionRate,
      openRate
    },
    recentSubscribers: enrichedSubscribers,
    trendData: Object.values(dateMap),
    topProducts,
    filters: { search: searchQuery, dateRange: dateFilter, status: statusFilter }
  });
}

export default function Dashboard() {
  const { stats, recentSubscribers, trendData, topProducts, filters } = useLoaderData();
  const submit = useSubmit();
  const [searchValue, setSearchValue] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    submit(formData, { method: "get" });
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, gradient, trend }) => (
    <div className="relative bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div className={`absolute inset-0 ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${gradient} bg-opacity-10`}>
            <Icon size={24} className="text-white" style={{filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.5))'}} />
          </div>
          {trend && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
              <TrendingUp size={12} className="text-green-600" />
              <span className="text-xs font-bold text-green-600">{trend}</span>
            </div>
          )}
        </div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</p>
        <p className="text-3xl font-black text-gray-900 mb-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 font-medium">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-6 md:p-10">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Back In Stock Analytics</h1>
            <p className="text-sm text-gray-500">Monitor your product restock notifications</p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <Filter size={16} />
              Filters
            </button>
            <button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Search</label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    name="search"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Email or variant ID..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Date Range</label>
                <select 
                  name="dateRange" 
                  defaultValue={filters.dateRange}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="1">Last 24 Hours</option>
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Status</label>
                <select 
                  name="status" 
                  defaultValue={filters.status}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Requests</option>
                  <option value="pending">Pending</option>
                  <option value="notified">Notified</option>
                  <option value="opened">Opened</option>
                  <option value="clicked">Clicked</option>
                </select>
              </div>

              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all">
                  Apply Filters
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard 
            title="Total Requests" 
            value={stats.totalRequests.toLocaleString()} 
            subtitle="All time requests"
            icon={ShoppingBag} 
            gradient="bg-gradient-to-br from-blue-500 to-blue-600"
            trend="+12%"
          />
          <MetricCard 
            title="Notifications Sent" 
            value={stats.notificationsSent.toLocaleString()} 
            subtitle={stats.totalRequests > 0 ? `${((stats.notificationsSent/stats.totalRequests)*100).toFixed(0)}% of requests` : '0% of requests'}
            icon={Bell} 
            gradient="bg-gradient-to-br from-green-500 to-green-600"
            trend="+8%"
          />
          <MetricCard 
            title="Email Open Rate" 
            value={`${stats.openRate}%`} 
            subtitle={`${stats.emailsOpened} opened`}
            icon={Eye} 
            gradient="bg-gradient-to-br from-pink-500 to-pink-600"
          />
          <MetricCard 
            title="Click Through Rate" 
            value={`${stats.conversionRate}%`} 
            subtitle={`${stats.emailsClicked} clicks`}
            icon={MousePointer2} 
            gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Activity Trends</h3>
              <div className="flex gap-2">
                <button className="px-3 py-1 text-xs font-bold bg-blue-50 text-blue-600 rounded-lg">Daily</button>
                <button className="px-3 py-1 text-xs font-bold text-gray-400 rounded-lg hover:bg-gray-50">Weekly</button>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9CA3AF'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#9CA3AF'}} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{fontSize: '12px', fontWeight: 'bold'}} />
                  <Line name="Requests" type="monotone" dataKey="Requests" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} />
                  <Line name="Opens" type="monotone" dataKey="Opens" stroke="#ec4899" strokeWidth={3} dot={{r: 4}} />
                  <Line name="Clicks" type="monotone" dataKey="Clicks" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white p-8 rounded-2xl shadow-lg">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-6">Top Requested Products</h3>
            <div className="space-y-4">
              {topProducts.length > 0 ? topProducts.map((product, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-black text-sm">#{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{product.productTitle}</p>
                    <p className="text-xs text-gray-500 truncate">{product.variantTitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                          style={{width: `${(product.count / topProducts[0].count) * 100}%`}}
                        ></div>
                      </div>
                      <span className="text-xs font-black text-gray-600">{product.count}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-center text-gray-400 text-sm py-8">No data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Subscribers Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Recent Requests</h3>
              <p className="text-xs text-gray-500 mt-1">Latest back-in-stock notifications</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 text-xs font-bold bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                View All
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-black text-gray-600 uppercase tracking-wider">Product Details</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-black text-gray-600 uppercase tracking-wider">Engagement</th>
                  <th className="px-6 py-4 text-right text-xs font-black text-gray-600 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSubscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-blue-50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-black text-sm">
                          {sub.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{sub.email}</p>
                          <p className="text-xs text-gray-500">ID: {sub.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="max-w-xs">
                        <p className="text-sm font-bold text-gray-900 truncate">{sub.productTitle}</p>
                        <p className="text-xs text-gray-500 truncate">{sub.variantTitle}</p>
                        <p className="text-xs text-blue-600 font-medium mt-1">SKU: {sub.sku}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase ${
                        sub.notified 
                          ? 'bg-green-50 text-green-700 border border-green-200' 
                          : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${sub.notified ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        {sub.notified ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                          sub.opened 
                            ? 'bg-pink-50 text-pink-600 border border-pink-200' 
                            : 'bg-gray-50 text-gray-400'
                        }`}>
                          {sub.opened ? '✓ Opened' : '○ Unopened'}
                        </span>
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                          sub.clicked 
                            ? 'bg-purple-50 text-purple-600 border border-purple-200' 
                            : 'bg-gray-50 text-gray-400'
                        }`}>
                          {sub.clicked ? '✓ Clicked' : '○ No Click'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <p className="text-sm font-bold text-gray-900">{new Date(sub.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-500">{new Date(sub.createdAt).toLocaleTimeString()}</p>
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