export const action = async ({ request }) => {
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
      where: { shop, email, productId: String(productId) }
    });

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