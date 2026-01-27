import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return json({ ok: true }, { status: 200 });
};

export const action = async ({ request }) => {
  console.log("🔍 Check Wishlist API called");

  // Handle CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    
    const { email, productId, shop } = body;

    if (!email || !productId || !shop) {
      return new Response(
        JSON.stringify({ inWishlist: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const existing = await prisma.wishlist.findFirst({
      where: { 
        shop: shop,
        email: email,
        productId: String(productId) 
      }
    });

    console.log("🔍 Wishlist check result:", !!existing);

    return new Response(
      JSON.stringify({ inWishlist: !!existing }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Check wishlist error:", error);
    return new Response(
      JSON.stringify({ inWishlist: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};