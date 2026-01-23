// File: app/routes/app.proxy.subscribe.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const action = async ({ request }) => {
  console.log("🔔 PROXY ACTION HIT");

  // Handle CORS for local testing if necessary
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    // 1. Authenticate the App Proxy request
    const { admin } = await authenticate.public.appProxy(request);
    
    const body = await request.json();
    console.log("📧 Request body:", body);
    
    const { email, variantId, shop, productName, currentPrice } = body;

    // ✅ Validate required fields
    if (!email || !variantId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, variantId, or shop" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch FULL variant details using GraphQL (includes inventory, price, product info)
    const response = await admin.graphql(`
      query getVariantDetails($id: ID!) {
        productVariant(id: $id) {
          id
          displayName
          price
          inventoryQuantity
          inventoryItem {
            id
          }
          product {
            id
            title
            handle
          }
        }
      }
    `, {
      variables: { id: `gid://shopify/ProductVariant/${variantId}` }
    });

    const variantData = await response.json();
    
    if (variantData.errors) {
      console.error("❌ GraphQL Error:", JSON.stringify(variantData.errors, null, 2));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch variant details" }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const variant = variantData.data?.productVariant;
    
    if (!variant) {
      console.error("❌ Variant not found:", variantId);
      return new Response(
        JSON.stringify({ success: false, error: "Variant not found" }), 
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract the clean numeric ID from the GID
    const rawInventoryId = variant.inventoryItem?.id;
    const inventoryItemId = rawInventoryId ? rawInventoryId.split('/').pop() : null;
    
    // Get product details
    const productId = variant.product?.id?.split('/').pop() || null;
    const productTitle = variant.product?.title || productName || "Unknown Product";
    const variantTitle = variant.displayName || "";
    
    // ✅ CRITICAL: Get current price for price drop tracking
    // Frontend sends price/100 (in dollars), but we can also get it from GraphQL
    const subscribedPrice = currentPrice ? parseFloat(currentPrice) : parseFloat(variant.price) || 0;

    console.log(`🔍 Variant Details:`, {
      variantId,
      inventoryItemId,
      productId,
      productTitle,
      variantTitle,
      subscribedPrice,
      inventoryQty: variant.inventoryQuantity
    });

    // 3. Check if already subscribed
    const existing = await prisma.backInStock.findFirst({
      where: {
        email: email,
        shop: shop,
        OR: [
          { variantId: String(variantId) },
          ...(inventoryItemId ? [{ inventoryItemId: String(inventoryItemId) }] : [])
        ]
      }
    });

    if (existing) {
      console.log("⚠️ Already subscribed:", email, "for variant:", variantId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "You're already subscribed to this product!" 
        }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Create subscription with ALL required fields
    const subscription = await prisma.backInStock.create({
      data: {
        email: email,
        variantId: String(variantId),
        inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
        productId: productId ? String(productId) : null,
        productTitle: productTitle,
        variantTitle: variantTitle,
        subscribedPrice: subscribedPrice, // ✅ CRITICAL for price drop alerts
        shop: shop,
        notified: false,
        createdAt: new Date()
      },
    });

    console.log("✅ Subscription created:", subscription.id, "for", email);

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
    console.error("Error stack:", err.stack);
    
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