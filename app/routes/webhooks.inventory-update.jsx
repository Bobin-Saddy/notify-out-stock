import prisma from "../db.server";
import { sendMail } from "./utils/mailer.server"; // we'll create this

export const action = async ({ request }) => {
  try {
    const payload = await request.json();

    const inventoryItemId = payload.inventory_item_id;
    const available = payload.available;

    // Only trigger when stock becomes available
    if (available <= 0) {
      return new Response("OK");
    }

    // Find all variants mapped to this inventory item
    // If you're storing variantId directly, we assume variantId === inventory_item_id
    const subscriptions = await prisma.backInStock.findMany({
      where: {
        variantId: String(inventoryItemId),
      },
    });

    if (!subscriptions.length) {
      return new Response("No subscribers");
    }

    // Send emails
    for (const sub of subscriptions) {
      await sendMail({
        to: sub.email,
        subject: "Product is back in stock! 🎉",
        html: `
          <h2>Good news!</h2>
          <p>Your product is back in stock.</p>
          <a href="https://${sub.shop}">Buy now</a>
        `,
      });
    }

    // Delete entries after sending
    await prisma.backInStock.deleteMany({
      where: {
        variantId: String(inventoryItemId),
      },
    });

    return new Response("Emails sent");
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    return new Response("Error", { status: 500 });
  }
};
