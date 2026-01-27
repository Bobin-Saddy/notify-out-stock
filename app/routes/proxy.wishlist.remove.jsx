import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return json({ ok: true }, { status: 200 });
};

export const action = async ({ request }) => {
  console.log("💔 Remove from Wishlist API called");

  // Handle CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    
    console.log("📦 Request body:", body);
    
    const { email, productId, shop } = body;

    if (!email || !productId || !shop) {
      console.error("❌ Missing required fields:", { email: !!email, productId: !!productId, shop: !!shop });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const deleted = await prisma.wishlist.deleteMany({
      where: { 
        shop: shop,
        email: email,
        productId: String(productId) 
      }
    });

    console.log("✅ Removed from wishlist, deleted:", deleted.count);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Removed from wishlist",
        deletedCount: deleted.count
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Remove from wishlist error:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
