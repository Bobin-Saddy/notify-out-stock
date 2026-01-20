import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Bell, Eye, MousePointer2, Settings, CheckCircle2, TrendingUp, Mail, Package, Search, Sparkles, Filter, Download
} from 'lucide-react';

export default function Dashboard() {
  // Yeh props aapke loader se aayenge
  const stats = {
    total: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    purchased: 0,
  };
  
  const subscribers = [];
  const trendData = [];
  const filters = {
    searchQuery: "",
    variantSearch: "",
    dateFilter: "7"
  };

  const getPct = (val) => (stats.total > 0 ? Math.round((val / stats.total) * 100) : 0);

  const metrics = [
    { label: 'Total Requests', val: stats.total, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50', gradient: 'from-blue-500 to-cyan-500' },
    { label: 'Notifications Sent', val: stats.sent, icon: Bell, color: 'text-green-600', bg: 'bg-green-50', gradient: 'from-green-500 to-emerald-500' },
    { label: 'Delivery Rate', val: getPct(stats.sent) + '%', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50', gradient: 'from-cyan-500 to-teal-500' },
    { label: 'Open Rate', val: getPct(stats.opened) + '%', icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50', gradient: 'from-purple-500 to-pink-500' },
    { label: 'Click Rate', val: getPct(stats.clicked) + '%', icon: MousePointer2, color: 'text-amber-600', bg: 'bg-amber-50', gradient: 'from-amber-500 to-orange-500' },
    { label: 'Conversion Rate', val: getPct(stats.purchased) + '%', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50', gradient: 'from-indigo-500 to-purple-500' },
  ];

  const funnelSteps = [
    { label: 'Request', val: stats.total, pct: 100, color: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
    { label: 'Sent', val: stats.sent, pct: getPct(stats.sent), color: 'bg-gradient-to-r from-green-500 to-emerald-500' },
    { label: 'Opened', val: stats.opened, pct: getPct(stats.opened), color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
    { label: 'Clicked', val: stats.clicked, pct: getPct(stats.clicked), color: 'bg-gradient-to-r from-amber-500 to-orange-500' },
    { label: 'Purchased', val: stats.purchased, pct: getPct(stats.purchased), color: 'bg-gradient-to-r from-indigo-500 to-purple-500' },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 min-h-screen p-6 md:p-8 font-sans text-gray-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{backgroundImage: 'radial-gradient(circle at 2px 2px, #cbd5e1 1px, transparent 0)', backgroundSize: '32px 32px'}}></div>
      
      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        {/* Enhanced Header */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-white/40 flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl shadow-lg">
              <Package className="text-white" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Back In Stock Dashboard
                </h1>
                <Sparkles size={18} className="text-indigo-500 animate-pulse" />
              </div>
              <p className="text-sm text-gray-500 mt-1">Monitor notification performance and customer engagement</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="bg-white hover:bg-gray-50 border-2 border-gray-200 text-gray-700 px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105">
              <Download size={16} /> Export
            </button>
            <button className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group">
              <Settings size={16} className="group-hover:rotate-90 transition-transform duration-300" /> Settings
            </button>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-lg border border-white/40">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-gray-500" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Filters</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <select name="dateRange" defaultValue={filters.dateFilter} className="bg-white/80 border-2 border-gray-200 p-3 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white shadow-sm hover:shadow-md transition-all font-medium">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-gray-400" size={16} />
              <input name="search" placeholder="Product Search" defaultValue={filters.searchQuery} className="w-full bg-white/80 border-2 border-gray-200 p-3 pl-10 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white shadow-sm hover:shadow-md transition-all" />
            </div>
            <input name="variant" placeholder="Variant Search" defaultValue={filters.variantSearch} className="bg-white/80 border-2 border-gray-200 p-3 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white shadow-sm hover:shadow-md transition-all" />
            <select className="bg-white/80 border-2 border-gray-200 p-3 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white shadow-sm hover:shadow-md transition-all font-medium">
              <option>All Channels</option>
            </select>
          </div>
        </div>

        {/* Enhanced Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {metrics.map((m, i) => (
            <div key={i} className="group bg-white/90 backdrop-blur-sm p-6 rounded-2xl border border-gray-100 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden">
              {/* Gradient Accent */}
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              
              <div className="flex items-center gap-5 relative z-10">
                <div className={`p-4 rounded-xl ${m.bg} ${m.color} shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300`}>
                  <m.icon size={24} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="text-3xl font-black text-gray-900">{m.val}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Enhanced Charts & Funnel */}
        <div className="grid grid-cols-12 gap-6">
          {/* Trend Chart */}
          <div className="col-span-12 lg:col-span-8 bg-white/90 backdrop-blur-sm p-7 rounded-3xl border border-gray-100 shadow-xl hover:shadow-2xl transition-shadow duration-300">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-xl text-gray-800">Requests and Notifications Trend</h3>
                <p className="text-xs text-gray-500 mt-1">Daily breakdown of requests and engagement</p>
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8', fontWeight: 600}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8', fontWeight: 600}} />
                  <Tooltip 
                    cursor={{fill: 'rgba(99, 102, 241, 0.05)'}} 
                    contentStyle={{
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                      padding: '12px'
                    }} 
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle" 
                    wrapperStyle={{paddingBottom: '20px', fontSize: '12px', fontWeight: 600}}
                  />
                  <Bar name="Requests" dataKey="Requests" fill="url(#colorRequests)" radius={[8, 8, 0, 0]} barSize={16} />
                  <Bar name="Sent" dataKey="Sent" fill="url(#colorSent)" radius={[8, 8, 0, 0]} barSize={16} />
                  <Bar name="Opened" dataKey="Opened" fill="url(#colorOpened)" radius={[8, 8, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Enhanced Funnel */}
          <div className="col-span-12 lg:col-span-4 bg-white/90 backdrop-blur-sm p-7 rounded-3xl border border-gray-100 shadow-xl hover:shadow-2xl transition-shadow duration-300">
            <div className="mb-6">
              <h3 className="font-bold text-xl text-gray-800">Notification Performance Funnel</h3>
              <p className="text-xs text-gray-500 mt-1">Customer journey breakdown</p>
            </div>
            <div className="space-y-5">
              {funnelSteps.map((step, idx) => (
                <div key={step.label} className="space-y-2 group">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{step.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-gray-900">{step.val.toLocaleString()}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        step.pct >= 80 ? 'bg-green-50 text-green-600' : 
                        step.pct >= 50 ? 'bg-amber-50 text-amber-600' : 
                        'bg-red-50 text-red-600'
                      }`}>
                        {step.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className={`h-full ${step.color} rounded-full transition-all duration-1000 ease-out shadow-lg group-hover:shadow-xl`}
                      style={{ width: `${step.pct}%` }}
                    ></div>
                  </div>
                  {idx < funnelSteps.length - 1 && (
                    <div className="flex items-center justify-center py-1">
                      <div className="w-0.5 h-4 bg-gradient-to-b from-gray-300 to-transparent"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performing Products */}
        <div className="bg-white/90 backdrop-blur-sm p-7 rounded-3xl border border-gray-100 shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-xl text-gray-800">Top Performing Products</h3>
              <p className="text-xs text-gray-500 mt-1">Products with highest conversion rates</p>
            </div>
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-2xl py-16 flex flex-col items-center justify-center text-center bg-gradient-to-br from-gray-50 to-white">
            <div className="bg-gradient-to-br from-gray-100 to-gray-50 p-5 rounded-2xl mb-4 shadow-inner">
               <Package size={40} className="text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-700 mb-1">No data found</p>
            <p className="text-xs text-gray-500">Data will appear here once customers request a back-in-stock notification.</p>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl border border-gray-100 shadow-xl overflow-hidden hover:shadow-2xl transition-shadow duration-300">
          <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
            <div>
              <h3 className="font-bold text-xl text-gray-800">Recent Subscribers</h3>
              <p className="text-xs text-gray-500 mt-1">Latest notification requests</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-full uppercase tracking-tight shadow-md flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                Live Updates
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 text-[10px] uppercase text-gray-500 font-black tracking-widest border-b border-gray-200">
                <tr>
                  <th className="px-8 py-4">Customer Email</th>
                  <th className="px-8 py-4">Product</th>
                  <th className="px-8 py-4">Variant</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscribers.length > 0 ? subscribers.map((sub) => (
                  <tr key={sub.id} className="text-sm hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-indigo-50/30 transition-all duration-200 group">
                    <td className="px-8 py-5">
                      <span className="text-blue-600 font-semibold group-hover:text-blue-700 transition-colors">{sub.email}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="font-semibold text-gray-800">{sub.productTitle}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-gray-500 text-xs font-medium bg-gray-50 px-2 py-1 rounded-lg">{sub.variantTitle || '-'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                        sub.notified 
                          ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200' 
                          : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200'
                      }`}>
                        {sub.notified ? '✓ Notified' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-gray-500 text-xs font-medium">
                        {new Date(sub.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                     <td colSpan="5" className="px-8 py-12 text-center">
                       <div className="flex flex-col items-center gap-2">
                         <Package size={32} className="text-gray-300" />
                         <p className="text-gray-400 italic text-sm">No recent activity found.</p>
                       </div>
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