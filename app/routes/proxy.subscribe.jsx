import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const body = await request.json();

    const { email, variantId, shop } = body;

    if (!email || !variantId || !shop) {
      return new Response(JSON.stringify({ success: false, message: "Missing data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await prisma.backInStock.create({
      data: {
        email,
        variantId: String(variantId),
        shop,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("SUBSCRIBE ERROR:", err);

    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
