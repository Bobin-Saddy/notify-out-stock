import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useNavigation } from "react-router";
import { ArrowLeft, Loader2 } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// 1. Loader: Database se existing settings fetch karne ke liye
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.appSettings.findUnique({
    where: { shop: session.shop },
  });
  return json({ settings });
}

// 2. Action: Settings save karne ke liye
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

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    update: data,
    create: data,
  });

  return json({ success: true });
}

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  return (
    <div className="bg-[#f6f6f7] min-h-screen p-8 font-sans text-[#202223]">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

      <Form method="POST" className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <ArrowLeft size={18} className="cursor-pointer" />
          <span className="font-bold text-lg">Basic Settings</span>
        </div>

        {/* General Settings */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold">General Settings</h2>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Emails</label>
            <div className="flex gap-2">
              <input 
                name="adminEmail"
                type="email" 
                defaultValue={settings?.adminEmail || ""}
                placeholder="Type your email here...." 
                className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-black shadow-sm"
                required
              />
              <button 
                type="submit"
                disabled={isSaving}
                className="bg-black text-white px-8 py-2.5 rounded-full font-bold text-sm flex items-center gap-2"
              >
                {isSaving && <Loader2 className="animate-spin" size={16} />}
                {settings ? "UPDATE" : "ADD"}
              </button>
            </div>
            <p className="text-[13px] text-gray-500">
              Don't miss out! Currently, you can add only one email address for inventory alerts. 
              <span className="text-blue-600 ml-1 underline cursor-pointer">Upgrade your plan</span>
            </p>
          </div>
        </div>

        {/* Inventory Alert Status (Static/Locked) */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Inventory Alert Settings</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-2 flex justify-between items-center shadow-sm">
            <span className="px-3 text-gray-500 text-sm italic italic">"Auto Restock Inventory (OOS)" is available on "Growth" plan.</span>
            <button type="button" className="bg-black text-white px-6 py-2 rounded-full font-bold text-[11px] uppercase tracking-widest">
              UPGRADE NOW
            </button>
          </div>
        </div>

        {/* Display Preferences (Dynamic Checkboxes) */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Email Display Preferences</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm grid grid-cols-2 gap-6">
            <PreferenceCheckbox label="Include price in email?" name="includePrice" defaultChecked={settings?.includePrice} />
            <PreferenceCheckbox label="Include product tags in email?" name="includeTags" defaultChecked={settings?.includeTags} />
            <PreferenceCheckbox label="Include SKU in email?" name="includeSku" defaultChecked={settings?.includeSku ?? true} />
            <PreferenceCheckbox label="Include vendor in email?" name="includeVendor" defaultChecked={settings?.includeVendor ?? true} />
          </div>
        </div>

        {/* Subject Line Settings */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold">Additional Settings (Optional)</h2>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Email reminder subject line</label>
            <input 
              name="subjectLine"
              type="text" 
              defaultValue={settings?.subjectLine || "Out of stock products reminder"}
              placeholder="Default: Out of stock products reminder" 
              className="w-full bg-white border border-gray-300 rounded-2xl px-6 py-4 outline-none focus:ring-1 ring-black shadow-sm"
            />
            <p className="text-[13px] text-gray-500 italic">Enter 15–50 characters. Leave blank for default.</p>
          </div>
        </div>
      </Form>
    </div>
  );
}

// Reusable Checkbox Component
function PreferenceCheckbox({ label, name, defaultChecked }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <input 
        type="checkbox" 
        name={name}
        defaultChecked={defaultChecked}
        className="w-5 h-5 rounded border-gray-300 accent-black cursor-pointer" 
      />
      <span className="text-sm font-medium text-gray-600 group-hover:text-black transition-colors">{label}</span>
    </label>
  );
}