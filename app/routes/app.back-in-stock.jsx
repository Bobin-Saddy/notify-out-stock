import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, Settings, CheckCircle2, TrendingUp, Mail, Package, Search
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  const searchQuery = url.searchParams.get("search") || "";
  const variantSearch = url.searchParams.get("variant") || "";
  const dateFilter = url.searchParams.get("dateRange") || "7";

  const dateFilterStart = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  // Build where clause for filtered records
  const whereClause = {
    shop,
    createdAt: { gte: dateFilterStart },
    ...(searchQuery && { 
      OR: [
        { email: { contains: searchQuery } },
        { productTitle: { contains: searchQuery } }
      ]
    }),
    ...(variantSearch && { variantId: { contains: variantSearch } }),
  };

  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ where: whereClause }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } })
  ]);

  // Real Counts (not percentages)
  const stats = {
    total: allRecords.length,
    sent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length,
  };

  // Calculate delivery, open, click rates as percentages
  const deliveryRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;
  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const clickRate = stats.opened > 0 ? Math.round((stats.clicked / stats.opened) * 100) : 0;
  const conversionRate = stats.clicked > 0 ? Math.round((stats.purchased / stats.clicked) * 100) : 0;

  // Enriched Table Data
  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      // If productTitle already exists in DB, use it
      if (sub.productTitle && sub.productTitle !== 'Unknown Product') {
        return sub;
      }

      // Otherwise, fetch from Shopify
      try {
        const response = await admin.graphql(`
          query { 
            productVariant(id: "gid://shopify/ProductVariant/${sub.variantId}") { 
              displayName 
              product { title } 
            } 
          }`);
        const { data } = await response.json();
        return { 
          ...sub, 
          productTitle: data?.productVariant?.product?.title || sub.productTitle || 'Unknown Product',
          variantTitle: data?.productVariant?.displayName || sub.variantTitle || 'N/A'
        };
      } catch { 
        return { 
          ...sub, 
          productTitle: sub.productTitle || 'Deleted Product', 
          variantTitle: sub.variantTitle || 'N/A' 
        }; 
      }
    })
  );

  // Trend Data with Clicked added
  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Sent++;
    if (curr.opened) acc[date].Opened++;
    if (curr.clicked) acc[date].Clicked++;
    return acc;
  }, {}));

  // Top Performing Products with images
  const productPerformance = allRecords.reduce((acc, curr) => {
    if (!curr.productTitle || curr.productTitle === 'Unknown Product') return acc;
    
    const key = `${curr.productTitle}_${curr.productId}`;
    
    if (!acc[key]) {
      acc[key] = {
        productTitle: curr.productTitle,
        productId: curr.productId,
        variantId: curr.variantId,
        requests: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        purchased: 0,
      };
    }
    
    acc[key].requests++;
    if (curr.notified) acc[key].sent++;
    if (curr.opened) acc[key].opened++;
    if (curr.clicked) acc[key].clicked++;
    if (curr.purchased) acc[key].purchased++;
    
    return acc;
  }, {});

  const topProductsRaw = Object.values(productPerformance)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 5);

  // Fetch product images for top products
  const topProducts = await Promise.all(
    topProductsRaw.map(async (product) => {
      try {
        const response = await admin.graphql(`
          query {
            productVariant(id: "gid://shopify/ProductVariant/${product.variantId}") {
              product {
                featuredImage {
                  url
                }
              }
            }
          }
        `);
        const { data } = await response.json();
        return {
          ...product,
          image: data?.productVariant?.product?.featuredImage?.url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png'
        };
      } catch {
        return {
          ...product,
          image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png'
        };
      }
    })
  );

  return json({ 
    stats, 
    deliveryRate,
    openRate,
    clickRate,
    conversionRate,
    subscribers: enrichedSubscribers, 
    trendData, 
    topProducts,
    filters: { searchQuery, variantSearch, dateFilter } 
  });
}

export default function Dashboard() {
  const { stats, deliveryRate, openRate, clickRate, conversionRate, subscribers, trendData, topProducts, filters } = useLoaderData();
  const submit = useSubmit();

  const metrics = [
    { label: 'Total Requests', val: stats.total, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Notifications Sent', val: stats.sent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Delivery Rate', val: deliveryRate + '%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Emails Opened', val: stats.opened, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Links Clicked', val: stats.clicked, icon: MousePointer2, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Conversion Rate', val: conversionRate + '%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const funnelSteps = [
    { label: 'Request', val: stats.total, pct: stats.total > 0 ? 100 : 0 },
    { label: 'Sent', val: stats.sent, pct: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0 },
    { label: 'Opened', val: stats.opened, pct: stats.total > 0 ? Math.round((stats.opened / stats.total) * 100) : 0 },
    { label: 'Clicked', val: stats.clicked, pct: stats.total > 0 ? Math.round((stats.clicked / stats.total) * 100) : 0 },
    { label: 'Purchased', val: stats.purchased, pct: stats.total > 0 ? Math.round((stats.purchased / stats.total) * 100) : 0 },
  ];

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans text-gray-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Back In Stock Dashboard</h1>
            <p className="text-sm text-gray-500">Monitor Back In Stock notification performance.</p>
          </div>
          <button className="bg-black text-white px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium">
            <Settings size={16} /> Settings
          </button>
        </div>

        {/* Filters */}
        <Form method="get" onChange={(e) => submit(e.currentTarget)} className="grid grid-cols-4 gap-4">
          <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <div className="relative col-span-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
            <input name="search" placeholder="Search Email/Product" defaultValue={filters.searchQuery} className="w-full bg-white border border-gray-200 p-2.5 pl-10 rounded-xl text-sm outline-none shadow-sm" />
          </div>
          <input name="variant" placeholder="Variant ID Search" defaultValue={filters.variantSearch} className="bg-white border border-gray-200 p-2.5 rounded-xl text-sm outline-none shadow-sm" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            Apply Filters
          </button>
        </Form>

        {/* 6 Grid Metrics */}
        <div className="grid grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-xl ${m.bg} ${m.color}`}><m.icon size={22} /></div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{m.label}</p>
                <p className="text-2xl font-black">{m.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts & Funnel */}
        <div className="grid grid-cols-12 gap-6">
          {/* Trend Chart */}
          <div className="col-span-8 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-8 text-gray-800">Requests and Notifications Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{paddingTop: '20px'}}/>
                  <Bar name="Requests" dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Sent" dataKey="Sent" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Opened" dataKey="Opened" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={10} />
                  <Bar name="Clicked" dataKey="Clicked" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel */}
          <div className="col-span-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold mb-8 text-gray-800">Notification Performance Funnel</h3>
            <div className="space-y-6">
              {funnelSteps.map((step) => (
                <div key={step.label} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wide">
                    <span>{step.label}</span>
                    <span className="text-gray-900">{step.val}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${step.pct}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 w-8">{step.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performing Products Section */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 text-gray-800">Top Performing Products</h3>
          {topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-widest">
                  <tr>
                    <th className="px-6 py-3 text-left">Product</th>
                    <th className="px-6 py-3 text-center">Requests</th>
                    <th className="px-6 py-3 text-center">Sent</th>
                    <th className="px-6 py-3 text-center">Opened</th>
                    <th className="px-6 py-3 text-center">Clicked</th>
                    <th className="px-6 py-3 text-center">Purchased</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topProducts.map((product, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={product.image} 
                            alt={product.productTitle}
                            className="w-12 h-12 rounded-lg object-cover border border-gray-100"
                            onError={(e) => {
                              e.target.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png';
                            }}
                          />
                          <span className="font-medium text-gray-700">{product.productTitle}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
                          {product.requests}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1.5 bg-green-50 text-green-600 rounded-full text-xs font-bold">
                          {product.sent}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1.5 bg-purple-50 text-purple-600 rounded-full text-xs font-bold">
                          {product.opened}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">
                          {product.clicked}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold">
                          {product.purchased}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-gray-200 rounded-2xl py-12 flex flex-col items-center justify-center text-center">
              <div className="bg-gray-50 p-4 rounded-full mb-3 text-gray-300">
                <Package size={32} />
              </div>
              <p className="text-sm font-bold text-gray-800">No data found</p>
              <p className="text-xs text-gray-500">Data will appear here once customers request a back-in-stock notification.</p>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold">Recent Subscribers</h3>
            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-tighter">Live Updates</span>
          </div>
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] uppercase text-gray-400 font-bold tracking-widest">
              <tr>
                <th className="px-8 py-4">Customer Email</th>
                <th className="px-8 py-4">Product</th>
                <th className="px-8 py-4">Variant</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Created On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscribers.length > 0 ? subscribers.map((sub) => (
                <tr key={sub.id} className="text-sm hover:bg-gray-50/50 transition-colors">
                  <td className="px-8 py-5 text-blue-600 font-medium">{sub.email}</td>
                  <td className="px-8 py-5 font-medium text-gray-700">{sub.productTitle}</td>
                  <td className="px-8 py-5 text-gray-500 text-xs">{sub.variantTitle || '-'}</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sub.notified ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                      {sub.notified ? 'Notified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-gray-400 text-xs font-medium">
                    {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-8 py-10 text-center text-gray-400 italic text-sm">No recent activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}