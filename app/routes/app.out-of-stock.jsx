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
  await prisma.appSettings.upsert({ where: { shop: session.shop }, update: data, create: data });
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
          <h1 className="text-xl font-bold">Basic Settings</h1>
        </div>
        <button 
          form="settings-form"
          className="bg-black text-white px-8 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-800 transition-all"
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {isSaving ? "Saving..." : "SAVE"}
        </button>
      </div>

      <Form method="POST" id="settings-form" className="max-w-6xl mx-auto p-8 space-y-12">
        
        {/* General Settings */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">General Settings</h2>
          <div className="space-y-4">
            <label className="block font-bold text-gray-700">Emails</label>
            <div className="flex gap-4">
              <input 
                name="adminEmail"
                type="email" 
                defaultValue={settings?.adminEmail}
                className="flex-1 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:border-black"
                placeholder="Type your email here...."
              />
              <button type="button" className="bg-black text-white px-10 py-3 rounded-lg font-bold">ADD</button>
            </div>
            <p className="text-sm text-gray-500">
              Don't miss out! Currently, you can add only one email address for inventory alerts. <span className="text-blue-600 underline cursor-pointer">Upgrade your plan</span> today to add up to five email addresses.
            </p>
          </div>
        </section>

        {/* Inventory Alert Settings */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Inventory Alert Settings</h2>
          <div className="space-y-4">
            <label className="block font-bold text-gray-700">Global Inventory Restock Status</label>
            <div className="border border-gray-200 rounded-lg p-2 flex items-center justify-between">
              <span className="px-4 text-gray-500 italic">"Auto Restock Inventory (OOS)" is available on the "Growth" plan and higher.</span>
              <button type="button" className="bg-black text-white px-6 py-2 rounded-lg font-bold text-sm uppercase">Upgrade Now</button>
            </div>
            <p className="text-sm text-gray-500">Your current plan (Free) doesn't include this feature. Upgrade your plan to unlock Auto Restock Inventory (OOS).</p>
          </div>
        </section>

        {/* Email Display Preferences */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Email Display Preferences</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border border-gray-200 rounded-xl p-8 shadow-sm">
            <CustomCheckbox label="Update inventory via email?" name="updateViaEmail" defaultChecked={settings?.updateViaEmail} subtext="Reply to email to update stock" />
            <CustomCheckbox label="Include SKU in email?" name="includeSku" defaultChecked={settings?.includeSku ?? true} />
            <CustomCheckbox label="Include price in email?" name="includePrice" defaultChecked={settings?.includePrice} />
            <CustomCheckbox label="Include vendor in email?" name="includeVendor" defaultChecked={settings?.includeVendor ?? true} />
            <CustomCheckbox label="Include product tags in email?" name="includeTags" defaultChecked={settings?.includeTags} />
          </div>
        </section>

        {/* Additional Settings */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Additional Settings (Optional)</h2>
          <div className="space-y-4">
            <label className="block font-bold text-gray-700">Email reminder subject line</label>
            <input 
              name="subjectLine"
              type="text"
              defaultValue={settings?.subjectLine}
              className="w-full border border-gray-200 rounded-full px-6 py-4 outline-none focus:border-black"
              placeholder="Default: Out of stock products reminder"
            />
            <p className="text-sm text-gray-500">Enter 15-50 characters. Leave blank to use the default subject.</p>
          </div>
        </section>

      </Form>
    </div>
  );
}

function CustomCheckbox({ label, name, defaultChecked, subtext }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-3 cursor-pointer group">
        <input 
          type="checkbox" 
          name={name} 
          defaultChecked={defaultChecked} 
          className="mt-1 w-5 h-5 border-gray-300 rounded accent-black" 
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-700 group-hover:text-black">{label}</span>
          {subtext && <span className="text-[10px] text-gray-400 italic">{subtext}</span>}
        </div>
      </label>
    </div>
  );
}