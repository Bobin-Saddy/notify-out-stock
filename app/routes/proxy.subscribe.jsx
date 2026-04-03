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
    // ✅ FIX: appProxy mein admin nahi milta — sirf authenticate karo
    await authenticate.public.appProxy(request);

    const body = await request.json();
    console.log("📧 RAW REQUEST BODY:", JSON.stringify(body, null, 2));

    const {
      email, variantId, shop,
      productName, variantTitle, currentPrice, productId,
      language
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

    // ✅ Language sanitization
    const SUPPORTED_LANGS = ['en', 'hi', 'fr', 'de', 'es', 'ar', 'zh', 'ja'];
    const rawLang = typeof language === 'string' ? language.trim().toLowerCase() : '';
    const finalLanguage = SUPPORTED_LANGS.includes(rawLang) ? rawLang : 'en';

    console.log(`🌐 Language received: "${language}" → resolved: "${finalLanguage}"`);

    // ✅ Clean IDs from client (strip gid:// prefix if present)
    const finalVariantId = String(variantId).includes('/')
      ? String(variantId).split('/').pop()
      : String(variantId);

    const finalProductId = productId ? String(productId).split('/').pop() : null;
    const finalProductTitle = productName || "Unknown Product";
    const finalVariantTitle = variantTitle || "Default";
    const finalSubscribedPrice = currentPrice ? parseFloat(currentPrice) : 0;

    // ✅ inventoryItemId webhook ke time resolve hoga — null store karo
    // inventory-update.jsx mein variantId se match hoga
    const finalInventoryItemId = null;

    console.log("🔑 IDs resolved:", {
      finalVariantId,
      finalProductId,
      finalLanguage
    });

    // ✅ Storefront button tabhi dikhta hai jab product OOS ho
    // Server-side stock check admin ke bina possible nahi appProxy mein
    // Isliye client pe trust karo — liquid template already check karta hai
    const isOutOfStock = true;

    // ✅ Check for existing subscription
    const existing = await prisma.backInStock.findFirst({
      where: {
        email,
        shop,
        variantId: finalVariantId
      }
    });

    if (existing) {
      // CASE A: Notified + in stock → block
      if (existing.notified && !isOutOfStock) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "You were already notified and this product is currently in stock. Go grab it! 🛒"
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // CASE B: Notified + out of stock again → re-subscribe
      if (existing.notified && isOutOfStock) {
        await prisma.backInStock.update({
          where: { id: existing.id },
          data: {
            notified:        false,
            subscribedPrice: finalSubscribedPrice,
            language:        finalLanguage,
            variantId:       finalVariantId,
            createdAt:       new Date()
          }
        });
        return new Response(
          JSON.stringify({
            success: true,
            message: "You're back on the waitlist! We'll notify you when it's back. 🔔"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // CASE C: Already pending → update language
      if (!existing.notified) {
        await prisma.backInStock.update({
          where: { id: existing.id },
          data: {
            language:  finalLanguage,
            variantId: finalVariantId
          }
        });
        return new Response(
          JSON.stringify({
            success: true,
            message: "You're already on the waitlist! 🔔"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ✅ Create new subscription
    const subscription = await prisma.backInStock.create({
      data: {
        email,
        variantId:       finalVariantId,
        inventoryItemId: finalInventoryItemId,
        productId:       finalProductId,
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
      JSON.stringify({
        success: false,
        error:   "Failed to subscribe. Please try again.",
        details: err.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};