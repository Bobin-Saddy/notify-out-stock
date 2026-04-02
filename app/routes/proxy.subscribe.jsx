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

    const { email, variantId, shop, productName, variantTitle, currentPrice, productId } = body;

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
    console.log("🔍 FETCHING LIVE VARIANT DETAILS for variantId:", variantId);
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

    // ✅ REAL-TIME STOCK CHECK — Server side verify
    const isShopifyManaged = variant.inventoryManagement === "SHOPIFY";
    const liveQty = variant.inventoryQuantity ?? 0;
    const isOutOfStock = isShopifyManaged ? liveQty <= 0 : !variant.available;

    console.log("📊 LIVE STOCK CHECK:", {
      inventoryManagement: variant.inventoryManagement,
      inventoryQuantity: liveQty,
      available: variant.available,
      isOutOfStock
    });

    // ✅ Always extract IDs from Shopify GraphQL (never trust client)
    const rawInventoryId = variant.inventoryItem?.id; // "gid://shopify/InventoryItem/123"
    const finalInventoryItemId = rawInventoryId ? rawInventoryId.split('/').pop() : null;

    const rawProductId = variant.product?.id;
    const finalProductId = productId || (rawProductId ? rawProductId.split('/').pop() : null);

    const finalProductTitle    = productName || variant.product?.title || "Unknown Product";
    const finalVariantTitle    = variantTitle || variant.title || variant.displayName || "Default";
    const finalSubscribedPrice = currentPrice
      ? parseFloat(currentPrice)
      : (variant.price ? parseFloat(variant.price) : 0);

    // ✅ Check if subscription already exists
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
      // ─── CASE A: Already subscribed AND notified AND still in stock
      // Matlab: notification gayi thi, product abhi bhi in-stock hai
      // Is case mein dobara subscribe karne ki zarurat nahi
      if (existing.notified && !isOutOfStock) {
        console.log("ℹ️ Already notified and product is still in stock:", email);
        return new Response(
          JSON.stringify({
            success: false,
            message: "You were already notified and this product is currently in stock. Go grab it! 🛒"
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // ─── CASE B: Already subscribed, notified, but product went out of stock again
      // Reset karo taaki next restock pe phir notify ho
      if (existing.notified && isOutOfStock) {
        console.log("🔄 Previously notified but product is out of stock again — resetting for:", email);
        await prisma.backInStock.update({
          where: { id: existing.id },
          data: {
            notified:        false,
            subscribedPrice: finalSubscribedPrice,
            createdAt:       new Date()
          }
        });
        return new Response(
          JSON.stringify({
            success: true,
            message: "You're back on the waitlist! We'll notify you when it's back in stock. 🔔"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // ─── CASE C: Already subscribed, not yet notified (still waiting)
      if (!existing.notified) {
        console.log("⚠️ Already on waitlist (pending notification):", email);
        return new Response(
          JSON.stringify({
            success: true,
            message: "You're already on the waitlist! We'll notify you when it's back in stock. 🔔"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ─── New subscription: only allow if product is OUT OF STOCK
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

    console.log("✅ CONFIRMED OUT OF STOCK — Creating new subscription");
    console.log("📦 SAVING WITH:", {
      variantId:       String(variantId),
      inventoryItemId: finalInventoryItemId,
      productId:       finalProductId,
      productTitle:    finalProductTitle,
    });

    // ✅ Create new subscription
    const subscription = await prisma.backInStock.create({
      data: {
        email,
        variantId:       String(variantId),
        inventoryItemId: finalInventoryItemId ? String(finalInventoryItemId) : null,
        productId:       finalProductId ? String(finalProductId) : null,
        productTitle:    finalProductTitle,
        variantTitle:    finalVariantTitle,
        subscribedPrice: finalSubscribedPrice,
        shop,
        notified:        false,
        createdAt:       new Date()
      }
    });

    console.log("✅ SUBSCRIPTION CREATED:", {
      id:              subscription.id,
      email:           subscription.email,
      variantId:       subscription.variantId,
      inventoryItemId: subscription.inventoryItemId,
      productTitle:    subscription.productTitle,
    });
    console.log("=".repeat(80));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully subscribed! We'll notify you when it's back in stock. 🔔",
        data: {
          id:           subscription.id,
          email:        subscription.email,
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
        error:   "Failed to subscribe. Please try again.",
        details: err.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};