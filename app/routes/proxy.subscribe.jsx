// app/routes/proxy.subscribe.jsx
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { email, variantId, shop } = await request.json();

    await prisma.backInStock.create({
      data: { email, variantId: String(variantId), shop },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
