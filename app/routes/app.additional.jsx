import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import React from 'react';
import { 
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { Mail, CheckCircle, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);

  // 1. Fetch Summary Stats
  const totalSent = await prisma.backInStock.count({ where: { notified: true } });
  const totalPending = await prisma.backInStock.count({ where: { notified: false } });
  
  // 2. Fetch History
  const historyRaw = await prisma.backInStock.findMany({
    orderBy: { updatedAt: 'asc' },
    select: { updatedAt: true, notified: true }
  });

  // Grouping logic with fallback
  const dateMap = {};
  historyRaw.forEach(item => {
    if (item.notified) {
      const date = new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dateMap[date] = (dateMap[date] || 0) + 1;
    }
  });

  const emailHistory = Object.keys(dateMap).map(date => ({
    date,
    sent: dateMap[date],
  }));

  // Agar data nahi hai toh dummy point dikhao taaki graph khali na dikhe
  const finalHistory = emailHistory.length > 0 ? emailHistory : [{ date: 'No Data', sent: 0 }];

  return json({
    stats: { totalSent, totalPending },
    finalHistory,
    rawCount: historyRaw.length // Debugging ke liye
  });
}

export default function Dashboard() {
  const { stats, finalHistory, rawCount } = useLoaderData();

  // Stats cards helper
  const StatCard = ({ icon: Icon, title, value, color, bgColor }) => (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center space-x-4">
      <div className={`p-3 rounded-lg ${bgColor}`}>
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* DEBUG BOX: Sirf check karne ke liye ki data aa raha hai ya nahi */}
      {rawCount === 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center text-amber-700">
          <AlertCircle className="mr-2" />
          <span>Database check: <b>0 records found</b>. Graph tabhi dikhega jab subscribers add honge.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <StatCard icon={Mail} title="Sent" value={stats.totalSent} color="#6366f1" bgColor="bg-indigo-50" />
        <StatCard icon={Clock} title="Pending" value={stats.totalPending} color="#f59e0b" bgColor="bg-amber-50" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold mb-6 flex items-center">
          <TrendingUp className="mr-2 text-indigo-500" size={20} />
          Sending History
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={finalHistory}>
              <defs>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="sent" stroke="#6366f1" fill="url(#colorSent)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}