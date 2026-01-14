import prisma from "../db.server";
import nodemailer from "nodemailer";

export async function action({ request }) {
  try {
    const payload = await request.json();

    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;

    // Only when product becomes IN STOCK
    if (available <= 0) {
      return new Response("Ignored", { status: 200 });
    }

    // 🔍 Find all subscribers
    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId },
    });
console.log("Subscribers:", subscribers);
    if (!subscribers.length) {
      return new Response("No subscribers", { status: 200 });
    }

    // 📧 Email setup
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 📤 Send emails
    for (const sub of subscribers) {
      await transporter.sendMail({
        from: `"Restock Alert" <${process.env.EMAIL_USER}>`,
        to: sub.email,
        subject: "🎉 Product is back in stock!",
        html: `
          <h2>Good news!</h2>
          <p>The product you were waiting for is now back in stock.</p>
          <p>Visit the store to buy it now!</p>
        `,
      });
    }

    // 🧹 Delete subscriptions after sending
    await prisma.backInStock.deleteMany({
      where: { inventoryItemId },
    });

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Server error", { status: 500 });
  }
}
