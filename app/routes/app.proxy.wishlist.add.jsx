import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("💚 Add to Wishlist API called");

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    
    const { email, productId, variantId, productTitle, variantTitle, productImage, productHandle, price, shop } = body;

    if (!email || !productId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if already in wishlist
    const existing = await prisma.wishlist.findFirst({
      where: { shop, email, productId: String(productId) }
    });

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, message: "Already in wishlist" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Add to wishlist
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
      JSON.stringify({ success: true, message: "Added to wishlist", data: wishlistItem }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Add to wishlist error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};