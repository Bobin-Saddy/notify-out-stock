import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendEmail } from "./utils/mailer.server";

export const action = async ({ request }) => {
  const { payload, session, admin } = await authenticate.webhook(request);

  const inventoryItemId = payload.inventory_item_id;
  const available = payload.available;

  // 🔹 GraphQL query: inventoryItem → variant
  const gql = `
    query getInventoryItem($id: ID!) {
      inventoryItem(id: $id) {
        id
        variant {
          id
          title
          product {
            title
          }
        }
      }
    }
  `;

  const gid = `gid://shopify/InventoryItem/${inventoryItemId}`;

  const result = await admin.graphql(gql, {
    variables: { id: gid },
  });

  const json = await result.json();

  const variantGid = json.data.inventoryItem.variant.id; 
  const variantId = variantGid.replace("gid://shopify/ProductVariant/", "");

  const productTitle = json.data.inventoryItem.variant.product.title;
  const variantTitle = json.data.inventoryItem.variant.title;

  // 1️⃣ If OUT OF STOCK → email admin
  if (available === 0) {
    await sendEmail(
      process.env.ADMIN_EMAIL,
      "Product Out Of Stock ❌",
      `<p><b>${productTitle}</b> (${variantTitle}) is now out of stock.</p>`
    );
  }

  // 2️⃣ If BACK IN STOCK → email customers
  if (available > 0) {
    const users = await prisma.backInStock.findMany({
      where: { variantId: String(variantId), notified: false },
    });

    for (const user of users) {
      await sendEmail(
        user.email,
        "Product Back In Stock 🎉",
        `<p>Good news! <b>${productTitle}</b> is available again.</p>`
      );
    }

    await prisma.backInStock.updateMany({
      where: { variantId: String(variantId) },
      data: { notified: true },
    });
  }

  return new Response("OK");
};
