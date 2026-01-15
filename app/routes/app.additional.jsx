import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Mail, CheckCircle, XCircle, Clock, TrendingUp, Package, Users } from 'lucide-react';

export default function EmailStatsDashboard() {
  const [stats, setStats] = useState({
    totalEmails: 0,
    successfulEmails: 0,
    failedEmails: 0,
    pendingSubscribers: 0,
    outOfStockAlerts: 0,
    backInStockAlerts: 0
  });

  const [emailHistory, setEmailHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mock data - Replace with actual API call
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setStats({
        totalEmails: 1247,
        successfulEmails: 1189,
        failedEmails: 58,
        pendingSubscribers: 342,
        outOfStockAlerts: 89,
        backInStockAlerts: 1158
      });

      setEmailHistory([
        { date: 'Jan 10', sent: 145, failed: 8, pending: 32 },
        { date: 'Jan 11', sent: 198, failed: 12, pending: 45 },
        { date: 'Jan 12', sent: 167, failed: 5, pending: 38 },
        { date: 'Jan 13', sent: 223, failed: 15, pending: 52 },
        { date: 'Jan 14', sent: 189, failed: 9, pending: 41 },
        { date: 'Jan 15', sent: 267, failed: 9, pending: 67 }
      ]);

      setLoading(false);
    }, 1000);
  }, []);

  const pieData = [
    { name: 'Successful', value: stats.successfulEmails, color: '#10b981' },
    { name: 'Failed', value: stats.failedEmails, color: '#ef4444' },
    { name: 'Pending', value: stats.pendingSubscribers, color: '#f59e0b' }
  ];

  const emailTypeData = [
    { name: 'Back In Stock', value: stats.backInStockAlerts, color: '#667eea' },
    { name: 'Out of Stock', value: stats.outOfStockAlerts, color: '#ff6b6b' }
  ];

  const StatCard = ({ icon: Icon, title, value, color, bgColor }) => (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2" style={{ color }}>{value.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-full" style={{ backgroundColor: bgColor }}>
          <Icon size={32} style={{ color }} />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📊 Email Statistics Dashboard</h1>
          <p className="text-gray-600">Track your back-in-stock notification performance</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatCard 
            icon={Mail} 
            title="Total Emails Sent" 
            value={stats.totalEmails} 
            color="#667eea"
            bgColor="#eef2ff"
          />
          <StatCard 
            icon={CheckCircle} 
            title="Successful Deliveries" 
            value={stats.successfulEmails} 
            color="#10b981"
            bgColor="#d1fae5"
          />
          <StatCard 
            icon={XCircle} 
            title="Failed Emails" 
            value={stats.failedEmails} 
            color="#ef4444"
            bgColor="#fee2e2"
          />
          <StatCard 
            icon={Clock} 
            title="Pending Subscribers" 
            value={stats.pendingSubscribers} 
            color="#f59e0b"
            bgColor="#fef3c7"
          />
          <StatCard 
            icon={Package} 
            title="Out of Stock Alerts" 
            value={stats.outOfStockAlerts} 
            color="#ff6b6b"
            bgColor="#ffe5e5"
          />
          <StatCard 
            icon={TrendingUp} 
            title="Back In Stock Alerts" 
            value={stats.backInStockAlerts} 
            color="#667eea"
            bgColor="#eef2ff"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Email Status Distribution */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <Mail className="mr-2" size={24} />
              Email Status Distribution
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Email Type Distribution */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <Package className="mr-2" size={24} />
              Alert Type Distribution
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={emailTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {emailTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Email History Chart */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <TrendingUp className="mr-2" size={24} />
            Email Activity Over Time
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={emailHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }} 
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="sent" 
                stroke="#10b981" 
                strokeWidth={3}
                name="Sent Successfully"
                dot={{ fill: '#10b981', r: 5 }}
              />
              <Line 
                type="monotone" 
                dataKey="failed" 
                stroke="#ef4444" 
                strokeWidth={3}
                name="Failed"
                dot={{ fill: '#ef4444', r: 5 }}
              />
              <Line 
                type="monotone" 
                dataKey="pending" 
                stroke="#f59e0b" 
                strokeWidth={3}
                name="Pending"
                dot={{ fill: '#f59e0b', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart - Daily Comparison */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Users className="mr-2" size={24} />
            Daily Email Comparison
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={emailHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }} 
              />
              <Legend />
              <Bar dataKey="sent" fill="#10b981" name="Sent Successfully" radius={[8, 8, 0, 0]} />
              <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[8, 8, 0, 0]} />
              <Bar dataKey="pending" fill="#f59e0b" name="Pending" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Success Rate */}
        <div className="mt-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg shadow-md p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Overall Success Rate</h2>
          <p className="text-6xl font-bold">
            {((stats.successfulEmails / stats.totalEmails) * 100).toFixed(1)}%
          </p>
          <p className="mt-2 text-lg opacity-90">
            {stats.successfulEmails} out of {stats.totalEmails} emails delivered successfully
          </p>
        </div>
      </div>
    </div>
  );
}