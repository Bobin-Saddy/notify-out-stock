import prisma from "../db.server";

/**
 * This handles GET request (when you open in browser)
 */
export const loader = async () => {
  return new Response(
    JSON.stringify({ ok: true, message: "Proxy route working" }),
    { headers: { "Content-Type": "application/json" } }
  );
};

/**
 * This handles POST request (from Shopify storefront)
 */
export const action = async ({ request }) => {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();

    if (!body.email || !body.variantId || !body.shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await prisma.backInStock.create({
      data: {
        email: body.email,
        variantId: String(body.variantId),
        shop: body.shop,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PROXY SUBSCRIBE ERROR:", err);

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
