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

    // ✅ REAL-TIME STOCK CHECK
    const isShopifyManaged = variant.inventoryManagement === "SHOPIFY";
    const liveQty = variant.inventoryQuantity ?? 0;
    const isOutOfStock = isShopifyManaged ? liveQty <= 0 : !variant.available;

    console.log("📊 LIVE STOCK CHECK:", {
      inventoryManagement: variant.inventoryManagement,
      inventoryQuantity: liveQty,
      available: variant.available,
      isOutOfStock
    });

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

    // ✅ Extract inventoryItemId from Shopify response (most reliable source)
    // Never rely on client-sent inventoryItemId — always use Shopify GraphQL value
    const rawInventoryId = variant.inventoryItem?.id; // "gid://shopify/InventoryItem/12345"
    const finalInventoryItemId = rawInventoryId ? rawInventoryId.split('/').pop() : null;

    const rawProductId = variant.product?.id; // "gid://shopify/Product/99999"
    const finalProductId = productId || (rawProductId ? rawProductId.split('/').pop() : null);

    const finalProductTitle  = productName || variant.product?.title || "Unknown Product";
    const finalVariantTitle  = variantTitle || variant.title || variant.displayName || "Default";
    const finalSubscribedPrice = currentPrice
      ? parseFloat(currentPrice)
      : (variant.price ? parseFloat(variant.price) : 0);

    console.log("📦 SAVING WITH:", {
      variantId: String(variantId),
      inventoryItemId: finalInventoryItemId,   // Should never be null now
      productId: finalProductId,
      productTitle: finalProductTitle,
    });

    // ✅ Check if already subscribed — check both variantId AND inventoryItemId
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

    // ✅ Create subscription — inventoryItemId always from Shopify GraphQL
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
      inventoryItemId: subscription.inventoryItemId,  // Log karo — should not be null
      productTitle:    subscription.productTitle,
    });
    console.log("=".repeat(80));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully subscribed! We'll notify you when it's back in stock.",
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