import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "react-router";
import { ArrowLeft, Loader2, CheckCircle2, Settings2 } from 'lucide-react';
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
    updateViaEmail: formData.get("updateViaEmail") === "on",
  };

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    update: data,
    create: data,
  });

  return json({ success: true });
}

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  return (
    <div className="bg-white min-h-screen pb-20 font-sans text-slate-900">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
        <div className="flex items-center gap-4">
          <ArrowLeft size={20} className="cursor-pointer" />
          <h1 className="text-xl font-bold flex items-center gap-2"><Settings2 size={22}/> Basic Settings</h1>
        </div>
        <button 
          form="settings-form"
          className="bg-black text-white px-10 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-800 transition-all active:scale-95"
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {isSaving ? "SAVING..." : "SAVE"}
        </button>
      </div>

      <Form method="POST" id="settings-form" className="max-w-6xl mx-auto p-8 space-y-12">
        
        {/* General Settings */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">General Settings</h2>
          <div className="space-y-4">
            <label className="block font-bold text-gray-600 uppercase text-xs tracking-wider">Receiver Email</label>
            <div className="flex gap-4">
              <input 
                name="adminEmail"
                type="email" 
                defaultValue={settings?.adminEmail}
                className="flex-1 border border-gray-200 rounded-xl px-5 py-3.5 outline-none focus:ring-2 focus:ring-black/5"
                placeholder="admin@example.com"
                required
              />
              <button type="button" className="bg-black text-white px-10 rounded-xl font-bold">ADD</button>
            </div>
            <p className="text-sm text-gray-500 italic">Currently, you can add 1 email for alerts. <span className="text-blue-600 underline">Upgrade Plan</span></p>
          </div>
        </section>

        {/* Display Preferences */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Email Display Preferences</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border border-gray-100 rounded-2xl p-10 bg-gray-50/50 shadow-sm">
            <CustomCheckbox label="Update inventory via email?" name="updateViaEmail" defaultChecked={settings?.updateViaEmail} subtext="Reply to mail to sync stock" />
            <CustomCheckbox label="Include SKU in email?" name="includeSku" defaultChecked={settings?.includeSku ?? true} />
            <CustomCheckbox label="Include price in email?" name="includePrice" defaultChecked={settings?.includePrice} />
            <CustomCheckbox label="Include vendor in email?" name="includeVendor" defaultChecked={settings?.includeVendor ?? true} />
            <CustomCheckbox label="Include tags in email?" name="includeTags" defaultChecked={settings?.includeTags} />
          </div>
        </section>

        {/* Email Subject */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Additional Settings (Optional)</h2>
          <div className="space-y-4">
            <label className="block font-bold text-gray-600 uppercase text-xs tracking-wider">Email Subject Line</label>
            <input 
              name="subjectLine"
              type="text"
              defaultValue={settings?.subjectLine}
              className="w-full border border-gray-200 rounded-full px-8 py-4 outline-none focus:border-black shadow-sm"
              placeholder="Out of stock products reminder"
            />
          </div>
        </section>
      </Form>
    </div>
  );
}

function CustomCheckbox({ label, name, defaultChecked, subtext }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <label className="flex items-start gap-3 cursor-pointer group">
        <input 
          type="checkbox" 
          name={name} 
          defaultChecked={defaultChecked} 
          className="mt-1 w-5 h-5 accent-black" 
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-gray-800">{label}</span>
          {subtext && <span className="text-[10px] text-gray-400 font-medium italic">{subtext}</span>}
        </div>
      </label>
    </div>
  );
}