import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// ✅ Loader
export const loader = async () => {
  return json({ ok: true }, { status: 200 });
};

// ✅ Action
export const action = async ({ request }) => {
  console.log("💚 Wishlist API called");

  // ✅ CORS Headers (important for App Proxy)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // ✅ Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    // ✅ Authenticate proxy request
    await authenticate.public.appProxy(request);

    // ✅ Safe JSON parse
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers }
      );
    }

    console.log("📦 Request body:", body);

    const {
      email,
      productId,
      variantId,
      productTitle,
      variantTitle,
      productImage,
      productHandle,
      price,
      shop,
      action: wishlistAction,
    } = body;

    // ✅ Required fields validation
    if (!email || !productId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers }
      );
    }

    // ✅ Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers }
      );
    }

    // =========================
    // ✅ REMOVE
    // =========================
    if (wishlistAction === "remove") {
      await prisma.wishlist.deleteMany({
        where: {
          shop,
          email,
          productId: String(productId),
        },
      });

      console.log("🗑️ Removed:", email, productId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Removed from wishlist",
          wishlisted: false,
        }),
        { status: 200, headers }
      );
    }

    // =========================
    // ✅ CHECK DUPLICATE
    // =========================
    const existing = await prisma.wishlist.findFirst({
      where: {
        shop,
        email,
        productId: String(productId),
      },
    });

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Already in wishlist",
          wishlisted: true,
        }),
        { status: 200, headers }
      );
    }

    // =========================
    // ✅ CREATE
    // =========================
    const wishlistItem = await prisma.wishlist.create({
      data: {
        shop,
        email,
        productId: String(productId),
        variantId: variantId ? String(variantId) : null,
        productTitle,
        variantTitle: variantTitle || "Default",
        productImage,
        productHandle,
        price: parseFloat(price) || 0,
      },
    });

    console.log("✅ Added:", wishlistItem.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Added to wishlist",
        wishlisted: true,
        data: wishlistItem,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error("❌ Wishlist error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal Server Error",
      }),
      { status: 500, headers }
    );
  }
};