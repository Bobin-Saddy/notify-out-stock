import prisma from "../db.server";
import nodemailer from "nodemailer";

export async function action({ request }) {
  try {
    const payload = await request.json();
    
    // Shopify inventory webhook sends inventory_item_id
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;

    console.log(`📦 Inventory Update Received: Item ${inventoryItemId}, Qty: ${available}`);

    // Only proceed if stock is back (available > 0)
    if (available <= 0) {
      return new Response("Ignored: Still out of stock", { status: 200 });
    }

    // 🔍 Find subscribers
    // NOTE: Make sure your DB has inventoryItemId. 
    // If not, you might need to find by variantId.
    const subscribers = await prisma.backInStock.findMany({
      where: { 
        OR: [
          { inventoryItemId: inventoryItemId },
          // { variantId: some_variant_id } // Optional fallback
        ],
        notified: false 
      },
    });

    console.log("Subscribers found:", subscribers.length);

    if (subscribers.length === 0) {
      return new Response("No subscribers to notify", { status: 200 });
    }

    // 📧 Email setup (Using 587 for better cloud compatibility)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use false for Port 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS, 
  },
  // Add these specific TLS settings for cloud environments
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2"
  },
  connectionTimeout: 20000, // Increase to 20 seconds
});

    // 📤 Send emails
    for (const sub of subscribers) {
      try {
        await transporter.sendMail({
          from: `"Restock Alert" <${process.env.MAIL_USER}>`,
          to: sub.email,
          subject: "🎉 Product is back in stock!",
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Good news!</h2>
              <p>The product you were waiting for is now back in stock.</p>
              <p>Shop: <strong>${sub.shop}</strong></p>
              <p><a href="https://${sub.shop}" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Visit Store</a></p>
            </div>
          `,
        });

        // Mark as notified instead of deleting immediately (safer)
        await prisma.backInStock.update({
          where: { id: sub.id },
          data: { notified: true }
        });

        console.log(`✅ Email sent to ${sub.email}`);
      } catch (emailErr) {
        console.error(`❌ Failed for ${sub.email}:`, emailErr.message);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook logic error:", err);
    return new Response("Server error", { status: 500 });
  }
}