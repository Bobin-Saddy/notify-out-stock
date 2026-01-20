import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans text-[#202223]">
      {/* External Tailwind Link for quick rendering */}
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Breadcrumb / Back Button */}
        <div className="flex items-center gap-2 mb-6 cursor-pointer hover:opacity-70 transition-all">
          <ArrowLeft size={18} />
          <span className="font-bold text-lg">Basic Settings</span>
        </div>

        {/* General Settings Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold">General Settings</h2>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold">Emails</label>
            <div className="flex gap-2">
              <input 
                type="email" 
                placeholder="Type your email here...." 
                className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-black transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="bg-black text-white px-8 py-2.5 rounded-full font-bold text-sm tracking-wide">
                ADD
              </button>
            </div>
            <p className="text-[13px] text-gray-500 mt-2">
              Don't miss out! Currently, you can add only one email address for inventory alerts. 
              <span className="text-blue-600 cursor-pointer ml-1 underline">Upgrade your plan</span> today to add up to five email addresses and ensure your team stays informed about low-stock warnings!
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Email Notification Frequency</label>
            <p className="text-[13px] text-gray-500">
              Email notifications are set to Once per hour by default. 
              <span className="text-blue-600 cursor-pointer ml-1 underline">Upgrade your plan</span> for more frequency options.
            </p>
          </div>
        </div>

        {/* Inventory Alert Settings Section */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Inventory Alert Settings</h2>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold">Global Inventory Restock Status</label>
            <div className="bg-white border border-gray-200 rounded-xl p-2 flex justify-between items-center shadow-sm">
              <input 
                disabled
                value='"Auto Restock Inventory (OOS)" is available on the "Growth" plan and higher.' 
                className="flex-1 bg-transparent px-3 text-gray-500 text-sm italic outline-none"
              />
              <button className="bg-black text-white px-6 py-2 rounded-full font-bold text-[11px] tracking-widest uppercase">
                UPGRADE NOW
              </button>
            </div>
            <p className="text-[13px] text-gray-500">
              Your current plan (Free) doesn't include this feature. Upgrade your plan to unlock Auto Restock Inventory (OOS).
            </p>
          </div>
        </div>

        {/* Email Display Preferences */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Email Display Preferences</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm grid grid-cols-3 gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-black" />
              <span className="text-sm font-medium text-gray-600">Update inventory via email?</span>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-black" />
              <span className="text-sm font-medium text-gray-600">Include price in email?</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-black" />
              <span className="text-sm font-medium text-gray-600">Include product tags in email?</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 accent-black" />
              <span className="text-sm font-medium text-gray-600">Include SKU in email?</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 accent-black" />
              <span className="text-sm font-medium text-gray-600">Include vendor in email?</span>
            </label>
          </div>
        </div>

        {/* Additional Settings Section */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Additional Settings (Optional)</h2>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Email reminder subject line</label>
            <input 
              type="text" 
              placeholder="Default: Out of stock products reminder" 
              className="w-full bg-white border border-gray-300 rounded-2xl px-6 py-4 outline-none focus:ring-1 ring-black transition-all shadow-sm"
            />
            <p className="text-[13px] text-gray-500 italic">
              Enter 15–50 characters. Leave blank to use the default subject.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}