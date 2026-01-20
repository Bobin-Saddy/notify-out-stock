import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useNavigation } from "react-router";
import { ArrowLeft, Loader2, Mail, ShieldCheck, Layout, PlusCircle } from 'lucide-react';
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
    <div className="bg-[#f4f6f8] min-h-screen p-10 font-sans text-slate-800">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <Form method="POST" className="max-w-3xl mx-auto space-y-10">
        {/* Modern Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:bg-slate-50">
                <ArrowLeft size={20} />
            </div>
            <div>
                <h1 className="text-2xl font-black tracking-tight">Configuration</h1>
                <p className="text-slate-500 text-sm">Manage your inventory alerts and email branding.</p>
            </div>
          </div>
          <button 
             type="submit" 
             disabled={isSaving}
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
            {settings ? "Save Changes" : "Activate Settings"}
          </button>
        </div>

        {/* Section 1: Admin Alerts */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg"><Mail size={20}/></div>
            <h2 className="text-lg font-bold">Admin Notification</h2>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <input 
                name="adminEmail"
                type="email" 
                defaultValue={settings?.adminEmail || ""}
                placeholder="admin@yourstore.com" 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 ring-indigo-100 focus:bg-white transition-all font-medium"
              />
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                <p className="text-[12px] text-amber-700 leading-relaxed font-medium">
                    ⚠️ Current plan allows 1 admin email. <span className="underline font-bold cursor-pointer">Upgrade to Growth Plan</span> to add up to 5 team members.
                </p>
            </div>
          </div>
        </div>

        {/* Section 2: Display Preferences */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg"><Layout size={20}/></div>
            <h2 className="text-lg font-bold">Email Content Builder</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <ModernCheckbox label="Show Product Price" name="includePrice" icon="💰" defaultChecked={settings?.includePrice} />
            <ModernCheckbox label="Display SKU ID" name="includeSku" icon="🆔" defaultChecked={settings?.includeSku ?? true} />
            <ModernCheckbox label="Show Vendor Name" name="includeVendor" icon="🏢" defaultChecked={settings?.includeVendor ?? true} />
            <ModernCheckbox label="Include Product Tags" name="includeTags" icon="🏷️" defaultChecked={settings?.includeTags} />
          </div>
        </div>

        {/* Section 3: Branding */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 text-purple-600 p-2 rounded-lg"><ShieldCheck size={20}/></div>
            <h2 className="text-lg font-bold">Email Branding</h2>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Custom Subject Line</label>
            <input 
              name="subjectLine"
              type="text" 
              defaultValue={settings?.subjectLine || "Good news! Your item is back."}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 ring-purple-100 transition-all"
            />
          </div>
        </div>
      </Form>
    </div>
  );
}

function ModernCheckbox({ label, name, icon, defaultChecked }) {
  return (
    <label className="relative flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 cursor-pointer hover:border-indigo-200 hover:bg-white transition-all group">
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-bold text-slate-600">{label}</span>
      </div>
      <input 
        type="checkbox" 
        name={name}
        defaultChecked={defaultChecked}
        className="w-5 h-5 rounded-lg border-slate-300 accent-indigo-600"
      />
    </label>
  );
}