import prisma from "../db.server";

export const action = async ({ request }) => {
  const { email, variantId, shop } = await request.json();

  await prisma.backInStock.create({
    data: {
      email,
      variantId: String(variantId),
      shop,
    },
  });

  return new Response(JSON.stringify({ success: true }));
};
