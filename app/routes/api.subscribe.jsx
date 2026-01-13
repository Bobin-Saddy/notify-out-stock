import { json } from "@remix-run/node";
import db from "../db.server";

export const action = async ({ request }) => {
  // CORS issues se bachne ke liye
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { email, variantId, shop } = await request.json();

    if (!email || !variantId || !shop) {
      return json({ error: "Missing fields" }, { status: 400 });
    }

    // 1. Database mein shop entry check karein
    await db.shop.upsert({
      where: { shopDomain: shop },
      update: {},
      create: { shopDomain: shop, emailUsage: 0 }
    });

    // 2. Subscription save karein
    await db.subscription.create({
      data: {
        customerEmail: email,
        variantId: variantId.toString(),
        shopDomain: shop,
        status: "pending"
      }
    });

    return json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("Subscription Error:", error);
    return json({ error: "Database error" }, { status: 500 });
  }
};

// Loader dena zaroori hai Proxy ke liye
export const loader = () => json({});