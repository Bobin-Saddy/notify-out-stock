import prisma from "../db.server";

/**
 * Receives:
 * - email
 * - variantId
 * - shop
 * Converts variant → inventory_item_id
 * Saves subscription
 */
export async function action({ request }) {
  try {
    const { email, variantId, shop } = await request.json();

    if (!email || !variantId || !shop) {
      return Response.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    // 🔁 Get inventory_item_id from Shopify
    const res = await fetch(
      `https://${shop}/admin/api/2024-10/variants/${variantId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();

    const inventoryItemId = String(data.variant.inventory_item_id);

    // 💾 Save to DB
    await prisma.backInStock.create({
      data: {
        email,
        shop,
        inventoryItemId,
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return Response.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
