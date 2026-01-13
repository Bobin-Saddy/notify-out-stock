import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendEmail } from "./utils/mailer.server";

export const action = async ({ request }) => {
  const { topic, payload, session } = await authenticate.webhook(request);

  const inventoryItemId = payload.inventory_item_id;
  const available = payload.available;

  // 🔎 Get variant via GraphQL
  const query = `
    query getVariant($id: ID!) {
      inventoryItem(id: $id) {
        variant {
          id
          product {
            title
          }
        }
      }
    }
  `;

  const gqlRes = await fetch(`https://${session.shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({
      query,
      variables: {
        id: "gid://shopify/InventoryItem/" + inventoryItemId,
      },
    }),
  });

  const data = await gqlRes.json();
  const variantGid = data.data.inventoryItem.variant.id;
  const variantId = variantGid.split("/").pop();
  const productTitle = data.data.inventoryItem.variant.product.title;

  // 1️⃣ Out of stock → email admin
  if (available === 0) {
    await sendEmail(
      process.env.ADMIN_EMAIL,
      "Product Out Of Stock ❌",
      `${productTitle} is now out of stock`
    );
  }

  // 2️⃣ Back in stock → email users
  if (available > 0) {
    const users = await prisma.backInStock.findMany({
      where: { variantId: String(variantId), notified: false },
    });

    for (const user of users) {
      await sendEmail(
        user.email,
        "Product Back In Stock 🎉",
        `${productTitle} is now available. Go buy it!`
      );
    }

    await prisma.backInStock.updateMany({
      where: { variantId: String(variantId) },
      data: { notified: true },
    });
  }

  return new Response("OK");
};
