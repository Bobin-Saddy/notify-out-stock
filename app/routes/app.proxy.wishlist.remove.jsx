export const action = async ({ request }) => {
  console.log("💔 Remove from Wishlist API called");

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const body = await request.json();
    
    const { email, productId, shop } = body;

    if (!email || !productId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const deleted = await prisma.wishlist.deleteMany({
      where: { shop, email, productId: String(productId) }
    });

    console.log("✅ Removed from wishlist, deleted:", deleted.count);

    return new Response(
      JSON.stringify({ success: true, message: "Removed from wishlist" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Remove from wishlist error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
