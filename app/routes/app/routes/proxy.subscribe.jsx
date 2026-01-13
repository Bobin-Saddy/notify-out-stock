import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { email, variantId, shop } = await request.json();

    if (!email || !variantId || !shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await prisma.backInStock.create({
      data: {
        email,
        variantId: String(variantId),
        shop,
      },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
