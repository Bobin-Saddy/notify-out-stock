import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "react-router";
import { 
  ArrowLeft, Loader2, Mail, ShieldCheck, Layout, Zap, 
  CheckCircle2, BellRing, Settings2, MessageSquare
} from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.appSettings.findUnique({ where: { shop: session.shop } });
  return json({ settings });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const data = {
    shop: session.shop,
    adminEmail: formData.get("adminEmail"),
    subjectLine: formData.get("subjectLine"),
    includeSku: formData.get("includeSku") === "on",
    includeVendor: formData.get("includeVendor") === "on",
    includePrice: formData.get("includePrice") === "on",
    includeTags: formData.get("includeTags") === "on",
  };
  await prisma.appSettings.upsert({ where: { shop: session.shop }, update: data, create: data });
  return json({ success: true });
}

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-20 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 mb-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-slate-100 rounded-full cursor-pointer hover:bg-slate-200 transition-all">
              <ArrowLeft size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-slate-800">
                <Settings2 size={22} className="text-indigo-600" /> Basic Settings
              </h1>
            </div>
          </div>
          <button 
            form="settings-form" 
            type="submit" 
            disabled={isSaving} 
            className="bg-black hover:bg-slate-800 text-white px-8 py-2.5 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            {isSaving ? "SAVING..." : (settings ? "UPDATE" : "SAVE")}
          </button>
        </div>
      </div>

      <Form method="POST" id="settings-form" className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Side: Main Settings */}
        <div className="md:col-span-2 space-y-8">
          
          {/* Email Settings Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Mail size={20} className="text-indigo-600"/> General Settings
            </h2>
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
              <label className="text-sm font-bold text-slate-600 mb-2 block uppercase tracking-wider">Receiver Email</label>
              <input 
                name="adminEmail" 
                type="email" 
                defaultValue={settings?.adminEmail} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 ring-indigo-100 font-semibold" 
                placeholder="Type your email here...." 
                required
              />
              <p className="text-[12px] text-slate-400 mt-3 flex items-center gap-1 font-medium">
                Don't miss out! Currently, you can add only one email address for inventory alerts. 
                <span className="text-blue-600 underline cursor-pointer ml-1">Upgrade your plan</span>
              </p>
            </div>
          </div>

          {/* Email Automation Section (The one from your screenshot) */}
          <div className="space-y-4 pt-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare size={20} className="text-emerald-600"/> Inventory Alert Settings
            </h2>
            <div className="bg-white rounded-[2rem] p-4 border border-slate-200 shadow-sm flex items-center justify-between px-8 py-6">
              <div className="flex-1">
                <p className="font-bold text-slate-800 italic text-sm">"Update inventory via email?" is available on "Growth" plan.</p>
              </div>
              <button type="button" className="bg-black text-white px-6 py-2.5 rounded-full font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all">
                UPGRADE NOW
              </button>
            </div>
          </div>

          {/* Subject Line Settings */}
          <div className="space-y-4 pt-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck size={20} className="text-purple-600"/> Additional Settings (Optional)
            </h2>
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
              <label className="text-sm font-bold text-slate-600 mb-2 block uppercase tracking-wider">Email reminder subject line</label>
              <input 
                name="subjectLine" 
                type="text"
                defaultValue={settings?.subjectLine || "Out of stock products reminder"} 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 ring-purple-100 font-semibold" 
              />
              <p className="text-[12px] text-slate-400 mt-2 italic font-medium">Enter 15–50 characters. Leave blank for default.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Display Preferences */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
                <Layout size={20} className="text-indigo-400" /> Email Content Builder
              </h2>
              <div className="space-y-6">
                <ModernToggle label="Include Price" name="includePrice" checked={settings?.includePrice} />
                <ModernToggle label="Include Tags" name="includeTags" checked={settings?.includeTags} />
                <ModernToggle label="Include SKU" name="includeSku" checked={settings?.includeSku ?? true} />
                <ModernToggle label="Include Vendor" name="includeVendor" checked={settings?.includeVendor ?? true} />
              </div>
              <div className="mt-12 pt-8 border-t border-white/10 text-center flex flex-col items-center">
                 <BellRing size={24} className="text-indigo-400 opacity-40 mb-2" />
                 <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black italic">Live Sync Active</p>
              </div>
            </div>
          </div>
        </div>
      </Form>
    </div>
  );
}

function ModernToggle({ label, name, checked }) {
  return (
    <label className="flex items-center justify-between group cursor-pointer p-1">
      <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{label}</span>
      <div className="relative inline-flex items-center">
        <input type="checkbox" name={name} defaultChecked={checked} className="sr-only peer" />
        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
      </div>
    </label>
  );
}