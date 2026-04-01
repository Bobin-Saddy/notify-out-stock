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
    // 1. Authenticate the App Proxy request
    const { admin } = await authenticate.public.appProxy(request);
    
    const body = await request.json();
    console.log("📧 RAW REQUEST BODY:", JSON.stringify(body, null, 2));
    
    const { email, variantId, shop, productName, variantTitle, currentPrice, productId, inventoryItemId } = body;

    // ✅ Validate required fields
    if (!email || !variantId || !shop) {
      console.error("❌ VALIDATION FAILED - Missing fields:", { email: !!email, variantId: !!variantId, shop: !!shop });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, variantId, or shop" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("❌ INVALID EMAIL FORMAT:", email);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("✅ BASIC VALIDATION PASSED");
    console.log("📦 RECEIVED DATA:", {
      email,
      variantId,
      shop,
      productName,
      variantTitle,
      currentPrice,
      productId,
      inventoryItemId
    });

    // 2. Fetch FULL variant details using GraphQL
    console.log("🔍 FETCHING VARIANT DETAILS FROM SHOPIFY...");
    const response = await admin.graphql(`
      query getVariantDetails($id: ID!) {
        productVariant(id: $id) {
          id
          displayName
          title
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
    console.log("📊 GRAPHQL RESPONSE:", JSON.stringify(variantData, null, 2));
    
    if (variantData.errors) {
      console.error("❌ GRAPHQL ERROR:", JSON.stringify(variantData.errors, null, 2));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch variant details from Shopify" }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const variant = variantData.data?.productVariant;
    
    if (!variant) {
      console.error("❌ VARIANT NOT FOUND IN SHOPIFY:", variantId);
      return new Response(
        JSON.stringify({ success: false, error: "Variant not found in Shopify" }), 
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract data from GraphQL response
    const rawInventoryId = variant.inventoryItem?.id;
    const finalInventoryItemId = inventoryItemId || (rawInventoryId ? rawInventoryId.split('/').pop() : null);
    
    const rawProductId = variant.product?.id;
    const finalProductId = productId || (rawProductId ? rawProductId.split('/').pop() : null);
    
    const finalProductTitle = productName || variant.product?.title || "Unknown Product";
    const finalVariantTitle = variantTitle || variant.title || variant.displayName || "Default";
    
    // Get price - prefer frontend price, fallback to GraphQL
    const finalSubscribedPrice = currentPrice 
      ? parseFloat(currentPrice) 
      : (variant.price ? parseFloat(variant.price) : 0);

    console.log("✅ PROCESSED VARIANT DATA:", {
      variantId,
      finalInventoryItemId,
      finalProductId,
      finalProductTitle,
      finalVariantTitle,
      finalSubscribedPrice,
      inventoryQty: variant.inventoryQuantity
    });

    // 3. Check if already subscribed
    console.log("🔍 CHECKING FOR EXISTING SUBSCRIPTION...");
    const existing = await prisma.backInStock.findFirst({
      where: {
        email: email,
        shop: shop,
        OR: [
          { variantId: String(variantId) },
          ...(finalInventoryItemId ? [{ inventoryItemId: String(finalInventoryItemId) }] : [])
        ]
      }
    });

    if (existing) {
      console.log("⚠️ ALREADY SUBSCRIBED:", email, "for variant:", variantId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "You're already subscribed to this product!" 
        }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("✅ NO EXISTING SUBSCRIPTION FOUND");

    // 4. Create subscription with ALL fields
    const subscriptionData = {
      email: email,
      variantId: String(variantId),
      inventoryItemId: finalInventoryItemId ? String(finalInventoryItemId) : null,
      productId: finalProductId ? String(finalProductId) : null,
      productTitle: finalProductTitle,
      variantTitle: finalVariantTitle,
      subscribedPrice: finalSubscribedPrice,
      shop: shop,
      notified: false,
      createdAt: new Date()
    };

    console.log("💾 CREATING SUBSCRIPTION WITH DATA:");
    console.log(JSON.stringify(subscriptionData, null, 2));

    const subscription = await prisma.backInStock.create({
      data: subscriptionData,
    });

    console.log("✅ SUBSCRIPTION CREATED SUCCESSFULLY!");
    console.log("📋 SAVED SUBSCRIPTION:", {
      id: subscription.id,
      email: subscription.email,
      productTitle: subscription.productTitle,
      variantTitle: subscription.variantTitle,
      subscribedPrice: subscription.subscribedPrice,
      variantId: subscription.variantId,
      inventoryItemId: subscription.inventoryItemId
    });
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
    console.error("=".repeat(80));
    console.error("❌ SUBSCRIBE ERROR:");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("=".repeat(80));
    
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