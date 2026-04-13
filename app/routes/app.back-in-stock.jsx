import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import React, { useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import {
  Bell, Eye, MousePointer2, Settings, CheckCircle2, TrendingUp,
  Mail, Package, Search, Filter, Zap, ArrowUpRight, RefreshCw,
  ShoppingBag, Activity
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/* ─── Loader ──────────────────────────────────────────────────────────────── */
export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const searchQuery   = url.searchParams.get("search")    || "";
  const variantSearch = url.searchParams.get("variant")   || "";
  const dateFilter    = url.searchParams.get("dateRange") || "7";
  const dateFilterStart = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const whereClause = {
    shop, createdAt: { gte: dateFilterStart },
    ...(searchQuery && { OR: [{ email: { contains: searchQuery } }, { productTitle: { contains: searchQuery } }] }),
    ...(variantSearch && { variantId: { contains: variantSearch } }),
  };

  const [allRecords, recentSubscribers] = await Promise.all([
    prisma.backInStock.findMany({ where: whereClause }),
    prisma.backInStock.findMany({ where: whereClause, take: 10, orderBy: { createdAt: 'desc' } }),
  ]);

  const stats = {
    total:     allRecords.length,
    sent:      allRecords.filter(r => r.notified).length,
    opened:    allRecords.filter(r => r.opened).length,
    clicked:   allRecords.filter(r => r.clicked).length,
    purchased: allRecords.filter(r => r.purchased).length,
  };

  const deliveryRate   = stats.total   > 0 ? Math.round((stats.sent      / stats.total)   * 100) : 0;
  const openRate       = stats.sent    > 0 ? Math.round((stats.opened    / stats.sent)    * 100) : 0;
  const clickRate      = stats.opened  > 0 ? Math.round((stats.clicked   / stats.opened)  * 100) : 0;
  const conversionRate = stats.clicked > 0 ? Math.round((stats.purchased / stats.clicked) * 100) : 0;

  const enrichedSubscribers = await Promise.all(recentSubscribers.map(async (sub) => {
    if (sub.productTitle && sub.productTitle !== 'Unknown Product') return sub;
    try {
      const res = await admin.graphql(`query { productVariant(id:"gid://shopify/ProductVariant/${sub.variantId}") { displayName product { title } } }`);
      const { data } = await res.json();
      return { ...sub, productTitle: data?.productVariant?.product?.title || 'Unknown Product', variantTitle: data?.productVariant?.displayName || 'N/A' };
    } catch { return { ...sub, productTitle: sub.productTitle || 'Deleted Product', variantTitle: sub.variantTitle || 'N/A' }; }
  }));

  const trendData = Object.values(allRecords.reduce((acc, curr) => {
    const date = new Date(curr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = { name: date, Requests: 0, Sent: 0, Opened: 0, Clicked: 0 };
    acc[date].Requests++;
    if (curr.notified) acc[date].Sent++;
    if (curr.opened)   acc[date].Opened++;
    if (curr.clicked)  acc[date].Clicked++;
    return acc;
  }, {}));

  const productPerf = allRecords.reduce((acc, curr) => {
    if (!curr.productTitle || curr.productTitle === 'Unknown Product') return acc;
    const key = `${curr.productTitle}_${curr.productId}`;
    if (!acc[key]) acc[key] = { productTitle: curr.productTitle, productId: curr.productId, variantId: curr.variantId, requests: 0, sent: 0, opened: 0, clicked: 0, purchased: 0 };
    acc[key].requests++;
    if (curr.notified)  acc[key].sent++;
    if (curr.opened)    acc[key].opened++;
    if (curr.clicked)   acc[key].clicked++;
    if (curr.purchased) acc[key].purchased++;
    return acc;
  }, {});

  const topProductsRaw = Object.values(productPerf).sort((a, b) => b.requests - a.requests).slice(0, 5);
  const topProducts = await Promise.all(topProductsRaw.map(async (p) => {
    try {
      const res = await admin.graphql(`query { productVariant(id:"gid://shopify/ProductVariant/${p.variantId}") { product { featuredImage { url } } } }`);
      const { data } = await res.json();
      return { ...p, image: data?.productVariant?.product?.featuredImage?.url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png' };
    } catch { return { ...p, image: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png' }; }
  }));

  return json({ stats, deliveryRate, openRate, clickRate, conversionRate, subscribers: enrichedSubscribers, trendData, topProducts, filters: { searchQuery, variantSearch, dateFilter } });
}

/* ─── Animated Counter ────────────────────────────────────────────────────── */
function AnimatedNumber({ target, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const num = typeof target === 'number' ? target : parseInt(target) || 0;
    let start = null;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 900, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * num));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <>{display}{suffix}</>;
}

/* ─── Metric Card ─────────────────────────────────────────────────────────── */
function MetricCard({ label, rawValue, isPercent, icon: Icon, grad, blobColor }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 22,
        padding: '22px 20px 18px',
        border: '1px solid #f0f4ff',
        boxShadow: hovered ? '0 16px 40px rgba(0,0,0,0.10)' : '0 2px 14px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all .22s ease',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: blobColor, opacity: 0.15 }} />
      <div style={{ width: 42, height: 42, borderRadius: 14, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: `0 6px 16px ${blobColor}60` }}>
        <Icon size={19} color="#fff" />
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-1px' }}>
        <AnimatedNumber target={rawValue} suffix={isPercent ? '%' : ''} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginTop: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  );
}

/* ─── Tooltip ─────────────────────────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '14px 18px', boxShadow: '0 10px 30px rgba(0,0,0,0.10)', minWidth: 150 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginLeft: 'auto' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ─── Funnel Step ─────────────────────────────────────────────────────────── */
function FunnelStep({ label, val, pct, color, icon: Icon }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 300); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={13} color={color} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 19, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px' }}>{val}</span>
          <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 600 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: `linear-gradient(90deg,${color}99,${color})`, borderRadius: 99, transition: 'width 1.1s cubic-bezier(0.34,1.4,0.64,1)', boxShadow: `0 0 8px ${color}50` }} />
      </div>
    </div>
  );
}

/* ─── Status Badge ────────────────────────────────────────────────────────── */
const StatusBadge = ({ notified }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: notified ? '#f0fdf4' : '#fffbeb', color: notified ? '#15803d' : '#b45309' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: notified ? '#22c55e' : '#fbbf24' }} />
    {notified ? 'Notified' : 'Pending'}
  </span>
);

/* ─── Dashboard ───────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { stats, deliveryRate, openRate, clickRate, conversionRate, subscribers, trendData, topProducts, filters } = useLoaderData();
  const submit = useSubmit();

  const METRICS = [
    { label: 'Total Requests',     rawValue: stats.total,    isPercent: false, icon: Mail,          grad: 'linear-gradient(135deg,#60a5fa,#2563eb)', blobColor: '#3b82f6' },
    { label: 'Notifications Sent', rawValue: stats.sent,     isPercent: false, icon: Bell,          grad: 'linear-gradient(135deg,#34d399,#059669)', blobColor: '#10b981' },
    { label: 'Delivery Rate',      rawValue: deliveryRate,   isPercent: true,  icon: CheckCircle2,  grad: 'linear-gradient(135deg,#22d3ee,#0891b2)', blobColor: '#06b6d4' },
    { label: 'Emails Opened',      rawValue: stats.opened,   isPercent: false, icon: Eye,           grad: 'linear-gradient(135deg,#a78bfa,#7c3aed)', blobColor: '#8b5cf6' },
    { label: 'Links Clicked',      rawValue: stats.clicked,  isPercent: false, icon: MousePointer2, grad: 'linear-gradient(135deg,#fbbf24,#d97706)', blobColor: '#f59e0b' },
    { label: 'Conversion Rate',    rawValue: conversionRate, isPercent: true,  icon: TrendingUp,    grad: 'linear-gradient(135deg,#fb7185,#e11d48)', blobColor: '#f43f5e' },
  ];

  const FUNNEL = [
    { label: 'Requests',  val: stats.total,     pct: 100,  color: '#3b82f6', icon: Mail },
    { label: 'Sent',      val: stats.sent,      pct: stats.total > 0 ? Math.round((stats.sent      / stats.total) * 100) : 0, color: '#10b981', icon: Bell },
    { label: 'Opened',    val: stats.opened,    pct: stats.total > 0 ? Math.round((stats.opened    / stats.total) * 100) : 0, color: '#8b5cf6', icon: Eye },
    { label: 'Clicked',   val: stats.clicked,   pct: stats.total > 0 ? Math.round((stats.clicked   / stats.total) * 100) : 0, color: '#f59e0b', icon: MousePointer2 },
    { label: 'Purchased', val: stats.purchased, pct: stats.total > 0 ? Math.round((stats.purchased / stats.total) * 100) : 0, color: '#f43f5e', icon: ShoppingBag },
  ];

  const BAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e'];
  const barData = topProducts.slice(0, 5).map((p, i) => ({
    name: p.productTitle.length > 20 ? p.productTitle.slice(0, 20) + '…' : p.productTitle,
    Requests: p.requests,
    fill: BAR_COLORS[i],
  }));

  const card = { background: '#fff', borderRadius: 24, border: '1px solid #f0f4ff', boxShadow: '0 2px 16px rgba(0,0,0,0.04)', padding: '26px 28px' };
  const TH = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', padding: '12px 18px', background: '#fafbff', textAlign: 'left', whiteSpace: 'nowrap' };
  const TD = { padding: '14px 18px', fontSize: 13, color: '#374151', borderTop: '1px solid #f8f9fc', verticalAlign: 'middle' };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#f0f4ff;font-family:'Inter',sans-serif}
        .hrow:hover td{background:#f8f9ff!important}
        input,select{font-family:inherit}
        input:focus,select:focus{outline:none;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#dde3f0;border-radius:99px}
        @keyframes pulse2{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .slide-up{animation:slideUp .45s ease both}
      `}</style>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div style={{ background: 'linear-gradient(145deg,#eef2ff 0%,#f0f9ff 50%,#fdf4ff 100%)', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

        {/* NAV */}
        <nav style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(224,231,255,0.6)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(79,70,229,.35)' }}>
              <Zap size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>Back In Stock</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>Analytics & Insights</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 12, background: 'linear-gradient(135deg,#1e1b4b,#312e81)', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(49,46,129,.3)' }}>
              <Settings size={13} /> Settings
            </button>
          </div>
        </nav>

        <div style={{ maxWidth: 1340, margin: '0 auto', padding: '28px 28px 56px' }}>

          {/* FILTERS */}
          <Form method="get" onChange={(e) => submit(e.currentTarget)}
            className="slide-up"
            style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', marginBottom: 24 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Filter size={14} color="#9ca3af" />
            </div>
            <select name="dateRange" defaultValue={filters.dateFilter}
              style={{ fontSize: 13, fontWeight: 600, border: '1.5px solid #e5e7eb', borderRadius: 11, padding: '8px 14px', color: '#374151', background: '#fafafa', cursor: 'pointer' }}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} size={14} color="#d1d5db" />
              <input name="search" placeholder="Search email or product…" defaultValue={filters.searchQuery}
                style={{ width: '100%', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 11, padding: '9px 12px 9px 36px', background: '#fafafa', color: '#374151' }} />
            </div>
            <input name="variant" placeholder="Variant ID…" defaultValue={filters.variantSearch}
              style={{ fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 11, padding: '9px 14px', background: '#fafafa', color: '#374151', width: 150 }} />
            <button type="submit"
              style={{ marginLeft: 'auto', padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,.35)', letterSpacing: '-0.01em' }}>
              Apply Filters
            </button>
          </Form>

          {/* METRICS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 16, marginBottom: 24 }}>
            {METRICS.map((m, i) => (
              <div key={i} className="slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                <MetricCard {...m} />
              </div>
            ))}
          </div>

          {/* CHART + FUNNEL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 20, marginBottom: 20 }}>

            {/* Area Chart */}
            <div style={card} className="slide-up">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 3 }}>Notification Trend</h3>
                  <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Requests, deliveries, opens & clicks</p>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[['Requests','#3b82f6'],['Sent','#10b981'],['Opened','#8b5cf6'],['Clicked','#f59e0b']].map(([l, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                    <defs>
                      {[['r','#3b82f6'],['s','#10b981'],['o','#8b5cf6'],['c','#f59e0b']].map(([id, col]) => (
                        <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={col} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={col} stopOpacity={0.01} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#d1d5db', fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#d1d5db', fontWeight: 600 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="Requests" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gr)" dot={false} activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="Sent"     stroke="#10b981" strokeWidth={2.5} fill="url(#gs)" dot={false} activeDot={{ r: 6, fill: '#10b981', strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="Opened"   stroke="#8b5cf6" strokeWidth={2.5} fill="url(#go)" dot={false} activeDot={{ r: 6, fill: '#8b5cf6', strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="Clicked"  stroke="#f59e0b" strokeWidth={2.5} fill="url(#gc)" dot={false} activeDot={{ r: 6, fill: '#f59e0b', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Funnel */}
            <div style={card} className="slide-up">
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Performance Funnel</h3>
              <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, marginBottom: 22 }}>From subscribe to purchase</p>
              {FUNNEL.map(s => <FunnelStep key={s.label} {...s} />)}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Open Rate',  val: `${openRate}%`,  bg: '#f5f3ff', color: '#7c3aed' },
                  { label: 'Click Rate', val: `${clickRate}%`, bg: '#fff8f0', color: '#d97706' },
                ].map(it => (
                  <div key={it.label} style={{ background: it.bg, borderRadius: 16, padding: '16px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: it.color, letterSpacing: '-1px' }}>{it.val}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>{it.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PRODUCTS ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Horizontal Bar Chart */}
            <div style={card} className="slide-up">
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Product Overview</h3>
              <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, marginBottom: 20 }}>Top 5 by subscriber requests</p>
              {barData.length > 0 ? (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 5" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#d1d5db' }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} width={120} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Requests" radius={[0, 10, 10, 0]} barSize={22}>
                        {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#e5e7eb' }}>
                  <Activity size={40} />
                  <span style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>No product data yet</span>
                </div>
              )}
            </div>

            {/* Top Products mini table */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }} className="slide-up">
              <div style={{ padding: '22px 26px 16px' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Top Performing Products</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Ranked by request volume</p>
              </div>
              {topProducts.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Product', 'Req', 'Sent', 'Conv'].map(h => <th key={h} style={TH}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={i} className="hrow">
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', top: -5, left: -5, width: 17, height: 17, borderRadius: '50%', background: BAR_COLORS[i % 5], color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: `0 2px 6px ${BAR_COLORS[i % 5]}60` }}>{i + 1}</span>
                              <img src={p.image} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', border: '1px solid #f0f4ff' }}
                                onError={e => { e.target.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png'; }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.productTitle}</span>
                          </div>
                        </td>
                        <td style={TD}><span style={{ display: 'inline-block', padding: '3px 11px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 800 }}>{p.requests}</span></td>
                        <td style={TD}><span style={{ display: 'inline-block', padding: '3px 11px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 800 }}>{p.sent}</span></td>
                        <td style={TD}><span style={{ display: 'inline-block', padding: '3px 11px', borderRadius: 20, background: '#fdf4ff', color: '#9333ea', fontSize: 12, fontWeight: 800 }}>{p.purchased}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '48px', textAlign: 'center', color: '#e5e7eb' }}>
                  <Package size={36} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>No product data yet</div>
                </div>
              )}
            </div>
          </div>

          {/* RECENT SUBSCRIBERS */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }} className="slide-up">
            <div style={{ padding: '22px 28px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8f9ff' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 3 }}>Recent Subscribers</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Latest 10 back-in-stock requests</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#eff6ff,#eef2ff)', borderRadius: 20, padding: '6px 14px', border: '1px solid #dde5ff' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4f46e5', display: 'inline-block', animation: 'pulse2 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', letterSpacing: '0.04em' }}>LIVE</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Customer Email', 'Product', 'Variant', 'Status', 'Date'].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {subscribers.length > 0 ? subscribers.map(sub => (
                    <tr key={sub.id} className="hrow" style={{ transition: 'background .15s' }}>
                      <td style={TD}><span style={{ color: '#4f46e5', fontWeight: 700 }}>{sub.email}</span></td>
                      <td style={{ ...TD, fontWeight: 600, maxWidth: 240 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.productTitle}</span>
                      </td>
                      <td style={TD}>
                        <code style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', padding: '3px 9px', borderRadius: 7, fontFamily: 'monospace' }}>{sub.variantTitle || '—'}</code>
                      </td>
                      <td style={TD}><StatusBadge notified={sub.notified} /></td>
                      <td style={{ ...TD, color: '#9ca3af', fontWeight: 600, fontSize: 12 }}>
                        {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" style={{ padding: '52px', textAlign: 'center', color: '#d1d5db', fontSize: 14 }}>No subscribers found for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}