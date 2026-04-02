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

    const {
      email, variantId, shop,
      productName, variantTitle, currentPrice, productId,
      language  // ← new field from multilang modal
    } = body;

    // ✅ Validate required fields
    if (!email || !variantId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Sanitize language — default to 'en' if not valid
    const SUPPORTED_LANGS = ['en','hi','fr','de','es','ar','zh','ja'];
    const finalLanguage = SUPPORTED_LANGS.includes(language) ? language : 'en';

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
          inventoryItem { id }
          product { id title handle }
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

    // ✅ Server-side stock check
    const isShopifyManaged = variant.inventoryManagement === "SHOPIFY";
    const liveQty          = variant.inventoryQuantity ?? 0;
    const isOutOfStock     = isShopifyManaged
      ? (variant.inventoryPolicy !== "CONTINUE" && liveQty <= 0)
      : !variant.available;

    console.log("📊 LIVE STOCK CHECK:", {
      inventoryManagement: variant.inventoryManagement,
      inventoryPolicy:     variant.inventoryPolicy,
      inventoryQuantity:   liveQty,
      available:           variant.available,
      isOutOfStock,
      language:            finalLanguage
    });

    // ✅ Always get IDs from Shopify (never trust client)
    const rawInventoryId      = variant.inventoryItem?.id;
    const finalInventoryItemId = rawInventoryId ? rawInventoryId.split('/').pop() : null;
    const rawProductId         = variant.product?.id;
    const finalProductId       = productId || (rawProductId ? rawProductId.split('/').pop() : null);

    const finalProductTitle    = productName || variant.product?.title || "Unknown Product";
    const finalVariantTitle    = variantTitle || variant.title || variant.displayName || "Default";
    const finalSubscribedPrice = currentPrice
      ? parseFloat(currentPrice)
      : (variant.price ? parseFloat(variant.price) : 0);

    // ✅ Check for existing subscription
    const existing = await prisma.backInStock.findFirst({
      where: {
        email, shop,
        OR: [
          { variantId: String(variantId) },
          ...(finalInventoryItemId ? [{ inventoryItemId: String(finalInventoryItemId) }] : [])
        ]
      }
    });

    if (existing) {
      // CASE A: Notified + still in stock → block
      if (existing.notified && !isOutOfStock) {
        return new Response(
          JSON.stringify({ success: false, message: "You were already notified and this product is currently in stock. Go grab it! 🛒" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // CASE B: Notified + out of stock again → re-subscribe + update language
      if (existing.notified && isOutOfStock) {
        await prisma.backInStock.update({
          where: { id: existing.id },
          data: {
            notified:        false,
            subscribedPrice: finalSubscribedPrice,
            language:        finalLanguage,
            createdAt:       new Date()
          }
        });
        return new Response(
          JSON.stringify({ success: true, message: "You're back on the waitlist! We'll notify you when it's back. 🔔" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // CASE C: Already pending → update language preference
      if (!existing.notified) {
        await prisma.backInStock.update({
          where: { id: existing.id },
          data:  { language: finalLanguage }
        });
        return new Response(
          JSON.stringify({ success: true, message: "You're already on the waitlist! 🔔" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ✅ Block if product in stock
    if (!isOutOfStock) {
      return new Response(
        JSON.stringify({ success: false, message: "This product is currently in stock. No need to subscribe!" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Create new subscription with language
    const subscription = await prisma.backInStock.create({
      data: {
        email,
        variantId:       String(variantId),
        inventoryItemId: finalInventoryItemId ? String(finalInventoryItemId) : null,
        productId:       finalProductId ? String(finalProductId) : null,
        productTitle:    finalProductTitle,
        variantTitle:    finalVariantTitle,
        subscribedPrice: finalSubscribedPrice,
        language:        finalLanguage,
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
      language:        subscription.language,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully subscribed! We'll notify you when it's back in stock. 🔔",
        data: {
          id:           subscription.id,
          email:        subscription.email,
          productTitle: subscription.productTitle,
          variantTitle: subscription.variantTitle,
          language:     subscription.language
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ SUBSCRIBE ERROR:", err.message, err.stack);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to subscribe. Please try again.", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};