// File: app/routes/api.subscribe.jsx
// This handles the form submission when user subscribes

import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function action({ request }) {
  try {
    // Handle both JSON and FormData
    const contentType = request.headers.get("content-type");
    let email, variantId, inventoryItemId, shop, currentPrice;

    if (contentType && contentType.includes("application/json")) {
      const body = await request.json();
      email = body.email;
      variantId = body.variantId;
      inventoryItemId = body.inventoryItemId;
      shop = body.shop;
      currentPrice = body.currentPrice;
    } else {
      const formData = await request.formData();
      email = formData.get("email");
      variantId = formData.get("variantId");
      inventoryItemId = formData.get("inventoryItemId");
      shop = formData.get("shop");
      currentPrice = formData.get("currentPrice");
    }

    console.log("📧 Subscription request:", { email, variantId, inventoryItemId, shop, currentPrice });

    if (!email || !variantId || !shop) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if already subscribed
    const existing = await prisma.backInStock.findFirst({
      where: {
        email,
        variantId,
        shop,
      },
    });

    if (existing) {
      console.log("⚠️ User already subscribed:", email);
      return json({ 
        success: false, 
        message: "You're already subscribed to this product!" 
      });
    }

    // Create new subscription with current price
    const subscription = await prisma.backInStock.create({
      data: {
        email,
        variantId,
        inventoryItemId: inventoryItemId || null,
        shop,
        notified: false,
        subscribedPrice: currentPrice ? parseFloat(currentPrice) : null, // IMPORTANT: Set price here
      },
    });

    console.log("✅ Subscription created:", subscription.id, "Price set to:", currentPrice);

    return json({ 
      success: true, 
      message: "You'll be notified when this product is back in stock!" 
    });

  } catch (error) {
    console.error("❌ Subscription error:", error);
    return json({ error: "Failed to subscribe" }, { status: 500 });
  }
}