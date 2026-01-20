import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "react-router";
import { 
  ArrowLeft, Loader2, Mail, ShieldCheck, Layout, Zap, 
  CheckCircle2, BellRing, Settings2, MessageSquare, ExternalLink
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
    <div className="bg-[#F1F5F9] min-h-screen pb-20 font-sans">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      {/* --- STICKY HEADER --- */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-10 py-5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button className="p-2.5 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Settings2 size={24} className="text-indigo-600" /> Configuration
              </h1>
              <p className="text-slate-500 text-sm font-medium">Manage alerts and display preferences</p>
            </div>
          </div>
          
          <button 
            form="settings-form" 
            type="submit" 
            disabled={isSaving} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all transform active:scale-95"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
            <span className="uppercase tracking-widest text-sm">{isSaving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </div>

      <Form method="POST" id="settings-form" className="max-w-6xl mx-auto px-10 mt-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* --- LEFT SECTION (2 Columns) --- */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* Notification Card */}
          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Notification Settings</h3>
            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm transition-hover hover:shadow-md">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-indigo-50 rounded-2xl"><Mail size={24} className="text-indigo-600"/></div>
                <h2 className="text-xl font-bold text-slate-800">Receiver Email</h2>
              </div>
              
              <div className="relative group">
                <input 
                  name="adminEmail" 
                  type="email" 
                  defaultValue={settings?.adminEmail} 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 outline-none focus:border-indigo-500 focus:bg-white transition-all font-bold text-slate-700 text-lg shadow-inner" 
                  placeholder="admin@yourstore.com" 
                />
              </div>
              <div className="mt-6 flex items-start gap-3 bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200">
                <Zap size={18} className="text-amber-500 mt-1 shrink-0" />
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                  Currently on <span className="text-indigo-600 font-bold italic underline">Free Plan</span>. You can set 1 recipient. To add your team members, <strong>Upgrade Now</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* Email Automation Upgrade Card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <h2 className="text-xl font-bold text-white flex items-center justify-center md:justify-start gap-2 italic">
                  <MessageSquare size={22} className="text-indigo-400" /> "Update inventory via email?"
                </h2>
                <p className="text-indigo-200/70 text-sm font-medium tracking-wide">Reply directly to our alerts to update stock levels instantly.</p>
              </div>
              <button type="button" className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-[12px] uppercase tracking-tighter hover:bg-indigo-50 transition-all shadow-lg flex items-center gap-2">
                UPGRADE TO GROWTH <ExternalLink size={14}/>
              </button>
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
          </div>

          {/* Subject Line Card */}
          <section className="space-y-4">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Email Branding</h3>
             <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-purple-50 rounded-2xl"><ShieldCheck size={24} className="text-purple-600"/></div>
                  <h2 className="text-xl font-bold text-slate-800">Email Subject Line</h2>
                </div>
                <input 
                  name="subjectLine" 
                  type="text"
                  defaultValue={settings?.subjectLine || "Good news! Your item is back in stock."} 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 outline-none focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700" 
                />
             </div>
          </section>
        </div>

        {/* --- RIGHT SECTION (Content Builder) --- */}
        <aside className="space-y-6">
           <div className="sticky top-32">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] ml-2 mb-4 text-center">Visual Builder</h3>
              <div className="bg-white rounded-[3rem] p-2 border border-slate-200 shadow-2xl">
                <div className="bg-slate-900 rounded-[2.8rem] p-8 text-white">
                  <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center mb-4 border border-white/10 shadow-inner">
                      <Layout size={28} className="text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-bold">Email Content</h2>
                    <p className="text-slate-400 text-xs mt-1">Select fields to show in email</p>
                  </div>
                  
                  <div className="space-y-4 px-2">
                    <ToggleItem label="Display Price" name="includePrice" checked={settings?.includePrice} />
                    <ToggleItem label="Include SKU" name="includeSku" checked={settings?.includeSku ?? true} />
                    <ToggleItem label="Vendor Name" name="includeVendor" checked={settings?.includeVendor ?? true} />
                    <ToggleItem label="Product Tags" name="includeTags" checked={settings?.includeTags} />
                  </div>

                  <div className="mt-12 pt-8 border-t border-white/5 text-center flex flex-col items-center">
                    <BellRing size={32} className="text-indigo-500 opacity-50 mb-4 animate-pulse" />
                    <p className="text-[10px] text-indigo-300 uppercase tracking-[0.4em] font-black">Sync Engine Active</p>
                  </div>
                </div>
              </div>
           </div>
        </aside>
      </Form>
    </div>
  );
}

function ToggleItem({ label, name, checked }) {
  return (
    <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer group">
      <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{label}</span>
      <div className="relative inline-flex items-center">
        <input type="checkbox" name={name} defaultChecked={checked} className="sr-only peer" />
        <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-5"></div>
      </div>
    </label>
  );
}