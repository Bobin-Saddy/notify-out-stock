import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Bell, Eye, MousePointer2, Settings, CheckCircle2, TrendingUp, Mail, Package, Search,
  ChevronDown, ArrowUpRight, Zap, Filter, RefreshCw
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

  const stats = {
    total: allRecords.length,
    sent: allRecords.filter(r => r.notified).length,
    opened: allRecords.filter(r => r.opened).length,
    clicked: allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length,
  };

  const deliveryRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;
  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const clickRate = stats.opened > 0 ? Math.round((stats.clicked / stats.opened) * 100) : 0;
  const conversionRate = stats.clicked > 0 ? Math.round((stats.purchased / stats.clicked) * 100) : 0;

  const enrichedSubscribers = await Promise.all(
    recentSubscribers.map(async (sub) => {
      if (sub.productTitle && sub.productTitle !== 'Unknown Product') return sub;
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
        return { ...sub, productTitle: sub.productTitle || 'Deleted Product', variantTitle: sub.variantTitle || 'N/A' };
      }
    })
  );

  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Sent++;
    if (curr.opened) acc[date].Opened++;
    if (curr.clicked) acc[date].Clicked++;
    return acc;
  }, {}));

  const productPerformance = allRecords.reduce((acc, curr) => {
    if (!curr.productTitle || curr.productTitle === 'Unknown Product') return acc;
    const key = `${curr.productTitle}_${curr.productId}`;
    if (!acc[key]) {
      acc[key] = { productTitle: curr.productTitle, productId: curr.productId, variantId: curr.variantId, requests: 0, sent: 0, opened: 0, clicked: 0, purchased: 0 };
    }
    acc[key].requests++;
    if (curr.notified) acc[key].sent++;
    if (curr.opened) acc[key].opened++;
    if (curr.clicked) acc[key].clicked++;
    if (curr.purchased) acc[key].purchased++;
    return acc;
  }, {});

  const topProductsRaw = Object.values(productPerformance).sort((a, b) => b.requests - a.requests).slice(0, 5);

  const topProducts = await Promise.all(
    topProductsRaw.map(async (product) => {
      try {
        const response = await admin.graphql(`
          query {
            productVariant(id: "gid://shopify/ProductVariant/${product.variantId}") {
              product { featuredImage { url } }
            }
          }`);
        const { data } = await response.json();
        return { ...product, image: data?.productVariant?.product?.featuredImage?.url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png' };
      } catch {
        return { ...product, image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png' };
      }
    })
  );

  return json({ stats, deliveryRate, openRate, clickRate, conversionRate, subscribers: enrichedSubscribers, trendData, topProducts, filters: { searchQuery, variantSearch, dateFilter } });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, accent, sub }) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}
      className="relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-100 shadow-sm group hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent.bg}`}>
          <Icon size={18} className={accent.text} />
        </div>
        <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-full ${accent.pill}`}>
          <ArrowUpRight size={10} className="inline mr-0.5" />live
        </span>
      </div>
      <p className="text-3xl font-black text-gray-900 mb-0.5">{value}</p>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-gray-300 mt-1">{sub}</p>}
      <div className={`absolute bottom-0 left-0 h-0.5 w-full ${accent.bar}`} />
    </div>
  );
}

// ─── Funnel Step ─────────────────────────────────────────────────────────────
function FunnelStep({ label, val, pct, color }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-8 text-right">{val}</span>
      <span className="text-[10px] text-gray-400 w-7 text-right">{pct}%</span>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-4 py-3 text-xs">
      <p className="font-bold text-gray-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { stats, deliveryRate, openRate, clickRate, conversionRate, subscribers, trendData, topProducts, filters } = useLoaderData();
  const submit = useSubmit();

  const metrics = [
    { label: 'Total Requests', value: stats.total, icon: Mail, accent: { bg: 'bg-blue-50', text: 'text-blue-500', pill: 'bg-blue-50 text-blue-400', bar: 'bg-blue-400' } },
    { label: 'Notifications Sent', value: stats.sent, icon: Bell, accent: { bg: 'bg-emerald-50', text: 'text-emerald-500', pill: 'bg-emerald-50 text-emerald-400', bar: 'bg-emerald-400' } },
    { label: 'Delivery Rate', value: `${deliveryRate}%`, icon: CheckCircle2, accent: { bg: 'bg-cyan-50', text: 'text-cyan-500', pill: 'bg-cyan-50 text-cyan-400', bar: 'bg-cyan-400' } },
    { label: 'Emails Opened', value: stats.opened, icon: Eye, accent: { bg: 'bg-violet-50', text: 'text-violet-500', pill: 'bg-violet-50 text-violet-400', bar: 'bg-violet-400' } },
    { label: 'Links Clicked', value: stats.clicked, icon: MousePointer2, accent: { bg: 'bg-amber-50', text: 'text-amber-500', pill: 'bg-amber-50 text-amber-400', bar: 'bg-amber-400' } },
    { label: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendingUp, accent: { bg: 'bg-rose-50', text: 'text-rose-500', pill: 'bg-rose-50 text-rose-400', bar: 'bg-rose-400' } },
  ];

  const funnelSteps = [
    { label: 'Requests', val: stats.total, pct: 100, color: 'bg-blue-400' },
    { label: 'Sent', val: stats.sent, pct: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0, color: 'bg-emerald-400' },
    { label: 'Opened', val: stats.opened, pct: stats.total > 0 ? Math.round((stats.opened / stats.total) * 100) : 0, color: 'bg-violet-400' },
    { label: 'Clicked', val: stats.clicked, pct: stats.total > 0 ? Math.round((stats.clicked / stats.total) * 100) : 0, color: 'bg-amber-400' },
    { label: 'Purchased', val: stats.purchased, pct: stats.total > 0 ? Math.round((stats.purchased / stats.total) * 100) : 0, color: 'bg-rose-400' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: #f5f5f7; }
        .dash-root { font-family: 'DM Sans', sans-serif; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .table-row:hover { background: #fafafa; }
        .card-hover { transition: box-shadow .2s, transform .2s; }
        .card-hover:hover { box-shadow: 0 8px 30px rgba(0,0,0,.06); transform: translateY(-1px); }
      `}</style>

      <div className="dash-root bg-[#f5f5f7] min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

        {/* Top Nav Bar */}
        <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-20" style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.95)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Zap size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-none">Back In Stock</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">Notification Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:border-gray-300 hover:bg-gray-50 transition-all">
              <RefreshCw size={12} /> Refresh
            </button>
            <button className="text-xs bg-gray-900 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-gray-700 transition-all font-medium">
              <Settings size={12} /> Settings
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

          {/* Filters */}
          <Form method="get" onChange={(e) => submit(e.currentTarget)}
            className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <Filter size={14} className="text-gray-400 shrink-0" />
            <select name="dateRange" defaultValue={filters.dateFilter}
              className="text-xs font-medium border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 outline-none cursor-pointer text-gray-600">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 text-gray-300" size={13} />
              <input name="search" placeholder="Search email or product…" defaultValue={filters.searchQuery}
                className="w-full text-xs border border-gray-200 bg-gray-50 rounded-lg pl-8 pr-3 py-2 outline-none text-gray-600 placeholder-gray-300" />
            </div>
            <input name="variant" placeholder="Variant ID…" defaultValue={filters.variantSearch}
              className="text-xs border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 outline-none text-gray-600 placeholder-gray-300 w-36" />
            <button type="submit" className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors ml-auto">
              Apply
            </button>
          </Form>

          {/* Metric Cards */}
          <div className="grid grid-cols-6 gap-4">
            {metrics.map((m, i) => <StatCard key={i} {...m} />)}
          </div>

          {/* Chart + Funnel */}
          <div className="grid grid-cols-12 gap-5">

            {/* Area Chart */}
            <div className="col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 card-hover">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Notification Trend</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Requests, sends, opens & clicks over time</p>
                </div>
                <div className="flex gap-3 text-[10px] font-semibold text-gray-400">
                  {[['Requests','bg-blue-400'],['Sent','bg-emerald-400'],['Opened','bg-violet-400'],['Clicked','bg-amber-400']].map(([label, cls]) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${cls}`} />{label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      {[['req','#3b82f6'],['sent','#10b981'],['open','#8b5cf6'],['click','#f59e0b']].map(([id, color]) => (
                        <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.12} />
                          <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="Requests" stroke="#3b82f6" strokeWidth={2} fill="url(#grad-req)" dot={false} />
                    <Area type="monotone" dataKey="Sent" stroke="#10b981" strokeWidth={2} fill="url(#grad-sent)" dot={false} />
                    <Area type="monotone" dataKey="Opened" stroke="#8b5cf6" strokeWidth={2} fill="url(#grad-open)" dot={false} />
                    <Area type="monotone" dataKey="Clicked" stroke="#f59e0b" strokeWidth={2} fill="url(#grad-click)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Funnel */}
            <div className="col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 card-hover">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-800">Performance Funnel</h3>
                <p className="text-xs text-gray-400 mt-0.5">From request to purchase</p>
              </div>
              <div className="space-y-5">
                {funnelSteps.map((step) => <FunnelStep key={step.label} {...step} />)}
              </div>
              <div className="mt-6 pt-5 border-t border-gray-50">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Open Rate', val: `${openRate}%`, color: 'text-violet-500' },
                    { label: 'Click Rate', val: `${clickRate}%`, color: 'text-amber-500' },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className={`text-xl font-black ${item.color}`}>{item.val}</p>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden card-hover">
            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Top Performing Products</h3>
                <p className="text-xs text-gray-400 mt-0.5">Sorted by total requests</p>
              </div>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full">Top 5</span>
            </div>
            {topProducts.length > 0 ? (
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-400 font-bold tracking-widest bg-gray-50/60">
                      <th className="px-6 py-3 text-left">Product</th>
                      <th className="px-6 py-3 text-center">Requests</th>
                      <th className="px-6 py-3 text-center">Sent</th>
                      <th className="px-6 py-3 text-center">Opened</th>
                      <th className="px-6 py-3 text-center">Clicked</th>
                      <th className="px-6 py-3 text-center">Purchased</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((product, idx) => (
                      <tr key={idx} className="table-row border-t border-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <span className="absolute -top-1 -left-1 w-4 h-4 bg-gray-900 text-white text-[8px] font-black rounded-full flex items-center justify-center z-10">
                                {idx + 1}
                              </span>
                              <img src={product.image} alt={product.productTitle}
                                className="w-11 h-11 rounded-xl object-cover border border-gray-100"
                                onError={(e) => { e.target.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png'; }} />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 max-w-xs truncate">{product.productTitle}</span>
                          </div>
                        </td>
                        {[
                          { val: product.requests, cls: 'bg-blue-50 text-blue-600' },
                          { val: product.sent, cls: 'bg-emerald-50 text-emerald-600' },
                          { val: product.opened, cls: 'bg-violet-50 text-violet-600' },
                          { val: product.clicked, cls: 'bg-amber-50 text-amber-600' },
                          { val: product.purchased, cls: 'bg-rose-50 text-rose-600' },
                        ].map((cell, ci) => (
                          <td key={ci} className="px-6 py-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${cell.cls}`}>{cell.val}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center text-center text-gray-300">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
                  <Package size={28} />
                </div>
                <p className="text-sm font-bold text-gray-500">No product data yet</p>
                <p className="text-xs text-gray-400 mt-1">Appears once customers request notifications</p>
              </div>
            )}
          </div>

          {/* Recent Subscribers Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden card-hover">
            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Recent Subscribers</h3>
                <p className="text-xs text-gray-400 mt-0.5">Latest 10 notification requests</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold bg-blue-50 text-blue-500 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />Live
              </span>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase text-gray-400 font-bold tracking-widest bg-gray-50/60">
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3">Variant</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.length > 0 ? subscribers.map((sub) => (
                  <tr key={sub.id} className="table-row border-t border-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">{sub.email}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-700 max-w-xs truncate">{sub.productTitle}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{sub.variantTitle || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${sub.notified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'}`}>
                        {sub.notified ? '✓ Notified' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 font-medium">
                      {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-300 text-sm italic">No subscribers found for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </>
  );
}