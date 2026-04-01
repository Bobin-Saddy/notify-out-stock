// File: app/routes/app.proxy.subscribe.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const action = async ({ request }) => {
  console.log("=".repeat(80));
  console.log("🔔 PROXY SUBSCRIBE ACTION HIT");
  console.log("=".repeat(80));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    console.log("📧 RAW REQUEST BODY:", JSON.stringify(body, null, 2));

    const { email, variantId, shop, productName, variantTitle, currentPrice, productId, inventoryItemId } = body;

    // ✅ Validate required fields
    if (!email || !variantId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
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

    // ✅ Fetch LIVE variant details from Shopify GraphQL
    console.log("🔍 FETCHING LIVE VARIANT DETAILS...");
    const response = await admin.graphql(`
      query getVariantDetails($id: ID!) {
        productVariant(id: $id) {
          id
          displayName
          title
          price
          available
          inventoryQuantity
          inventoryManagement
          inventoryPolicy
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
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(variantData.errors, null, 2));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch variant from Shopify" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const variant = variantData.data?.productVariant;

    if (!variant) {
      return new Response(
        JSON.stringify({ success: false, error: "Variant not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ REAL-TIME STOCK CHECK — Server side pe verify karo
    // Shopify GraphQL se live inventoryQuantity aata hai
    const isShopifyManaged = variant.inventoryManagement === "SHOPIFY";
    const liveQty = variant.inventoryQuantity ?? 0;
    const isOutOfStock = isShopifyManaged
      ? liveQty <= 0
      : !variant.available;

    console.log("📊 LIVE STOCK CHECK:", {
      inventoryManagement: variant.inventoryManagement,
      inventoryQuantity: liveQty,
      available: variant.available,
      isOutOfStock
    });

    // ❌ Agar product IN STOCK hai toh subscription mat banao
    if (!isOutOfStock) {
      console.log("⚠️ PRODUCT IS IN STOCK — Subscription rejected");
      return new Response(
        JSON.stringify({
          success: false,
          message: "This product is currently in stock. No need to subscribe!"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("✅ CONFIRMED OUT OF STOCK — Proceeding with subscription");

    // Extract IDs
    const rawInventoryId = variant.inventoryItem?.id;
    const finalInventoryItemId = inventoryItemId || (rawInventoryId ? rawInventoryId.split('/').pop() : null);

    const rawProductId = variant.product?.id;
    const finalProductId = productId || (rawProductId ? rawProductId.split('/').pop() : null);

    const finalProductTitle = productName || variant.product?.title || "Unknown Product";
    const finalVariantTitle = variantTitle || variant.title || variant.displayName || "Default";
    const finalSubscribedPrice = currentPrice
      ? parseFloat(currentPrice)
      : (variant.price ? parseFloat(variant.price) : 0);

    // ✅ Check if already subscribed
    const existing = await prisma.backInStock.findFirst({
      where: {
        email,
        shop,
        OR: [
          { variantId: String(variantId) },
          ...(finalInventoryItemId ? [{ inventoryItemId: String(finalInventoryItemId) }] : [])
        ]
      }
    });

    if (existing) {
      console.log("⚠️ ALREADY SUBSCRIBED:", email);
      return new Response(
        JSON.stringify({
          success: true,
          message: "You're already subscribed to this product!"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Create subscription
    const subscriptionData = {
      email,
      variantId: String(variantId),
      inventoryItemId: finalInventoryItemId ? String(finalInventoryItemId) : null,
      productId: finalProductId ? String(finalProductId) : null,
      productTitle: finalProductTitle,
      variantTitle: finalVariantTitle,
      subscribedPrice: finalSubscribedPrice,
      shop,
      notified: false,
      createdAt: new Date()
    };

    const subscription = await prisma.backInStock.create({ data: subscriptionData });

    console.log("✅ SUBSCRIPTION CREATED:", subscription.id);
    console.log("=".repeat(80));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully subscribed! We'll notify you when it's back in stock.",
        data: {
          id: subscription.id,
          email: subscription.email,
          productTitle: subscription.productTitle,
          variantTitle: subscription.variantTitle
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ SUBSCRIBE ERROR:", err.message);
    console.error(err.stack);
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