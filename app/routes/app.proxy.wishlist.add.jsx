import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return json({ ok: true }, { status: 200 });
};

export const action = async ({ request }) => {
  console.log("💚 Add to Wishlist API called");

  // Handle CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    
    console.log("📦 Request body:", body);
    
    const { email, productId, variantId, productTitle, variantTitle, productImage, productHandle, price, shop } = body;

    if (!email || !productId || !shop) {
      console.error("❌ Missing required fields:", { email: !!email, productId: !!productId, shop: !!shop });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("❌ Invalid email format:", email);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if already in wishlist
    const existing = await prisma.wishlist.findFirst({
      where: { 
        shop: shop,
        email: email,
        productId: String(productId) 
      }
    });

    if (existing) {
      console.log("⚠️ Already in wishlist:", email, productId);
      return new Response(
        JSON.stringify({ success: true, message: "Already in wishlist" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Add to wishlist
    const wishlistItem = await prisma.wishlist.create({
      data: {
        shop: shop,
        email: email,
        productId: String(productId),
        variantId: String(variantId),
        productTitle: productTitle,
        variantTitle: variantTitle || "Default",
        productImage: productImage,
        productHandle: productHandle,
        price: parseFloat(price) || 0,
      }
    });

    console.log("✅ Added to wishlist:", wishlistItem.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Added to wishlist", 
        data: wishlistItem 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Add to wishlist error:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};