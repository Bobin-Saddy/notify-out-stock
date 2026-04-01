import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return json({ ok: true }, { status: 200 });
};

export const action = async ({ request }) => {
  console.log("💚 Wishlist API called");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    console.log("📦 Request body:", body);

    const {
      email, productId, variantId, productTitle,
      variantTitle, productImage, productHandle,
      price, shop,
      action: wishlistAction   // "add" | "remove"
    } = body;

    if (!email || !productId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ REMOVE action
    if (wishlistAction === "remove") {
      await prisma.wishlist.deleteMany({
        where: { shop, email, productId: String(productId) }
      });
      console.log("🗑️ Removed from wishlist:", email, productId);
      return new Response(
        JSON.stringify({ success: true, message: "Removed from wishlist", wishlisted: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ ADD action — duplicate check
    const existing = await prisma.wishlist.findFirst({
      where: { shop, email, productId: String(productId) }
    });

    if (existing) {
      console.log("⚠️ Already in wishlist");
      return new Response(
        JSON.stringify({ success: true, message: "Already in wishlist", wishlisted: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const wishlistItem = await prisma.wishlist.create({
      data: {
        shop,
        email,
        productId: String(productId),
        variantId: String(variantId),
        productTitle,
        variantTitle: variantTitle || "Default",
        productImage,
        productHandle,
        price: parseFloat(price) || 0,
      }
    });

    console.log("✅ Added to wishlist:", wishlistItem.id);
    return new Response(
      JSON.stringify({ success: true, message: "Added to wishlist", wishlisted: true, data: wishlistItem }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Wishlist error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};