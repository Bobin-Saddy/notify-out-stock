// File: app/routes/app.proxy.subscribe.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const action = async ({ request }) => {
  console.log("🔔 PROXY ACTION HIT");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    // Authenticate the App Proxy request
    await authenticate.public.appProxy(request);
    
    const body = await request.json();
    console.log("📧 Request body:", body);
    
    const { 
      email, 
      variantId, 
      shop, 
      productName, 
      currentPrice,
      productId,        // ✅ Frontend se bhejo
      variantTitle,     // ✅ Frontend se bhejo
      inventoryItemId   // ✅ Frontend se bhejo
    } = body;

    // Validate required fields
    if (!email || !variantId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const subscribedPrice = currentPrice ? parseFloat(currentPrice) : 0;

    // Check if already subscribed
    const existing = await prisma.backInStock.findFirst({
      where: {
        email: email,
        shop: shop,
        variantId: String(variantId)
      }
    });

    if (existing) {
      console.log("⚠️ Already subscribed:", email);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "You're already subscribed to this product!" 
        }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create subscription
    const subscription = await prisma.backInStock.create({
      data: {
        email: email,
        variantId: String(variantId),
        inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
        productId: productId ? String(productId) : null,
        productTitle: productName || "Unknown Product",
        variantTitle: variantTitle || "",
        subscribedPrice: subscribedPrice,
        shop: shop,
        notified: false,
        createdAt: new Date()
      },
    });

    console.log("✅ Subscription created:", subscription.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Successfully subscribed! We'll notify you when it's back in stock.",
        data: subscription 
      }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ SUBSCRIBE ERROR:", err);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Failed to subscribe. Please try again.",
        details: err.message 
      }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};