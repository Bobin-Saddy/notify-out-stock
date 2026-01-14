import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  // 1. Authenticate to get the admin object
  const { admin, shop } = await authenticate.webhook(request);

  try {
    const payload = await request.json();
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;

    console.log(`📦 Inventory Update: Item ${inventoryItemId}, Qty: ${available}`);

    if (available <= 0) {
      return new Response("Ignored", { status: 200 });
    }

    // 2. Find subscribers in DB
    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId,
        notified: false 
      },
    });

    if (subscribers.length === 0) {
      return new Response("No subscribers", { status: 200 });
    }

    // 3. Fetch Product Details from Shopify using GraphQL
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            product {
              title
            }
          }
        }
      }
    `);

    const details = await response.json();
    const productName = details.data?.inventoryItem?.variant?.product?.title || "A product you like";
    const variantName = details.data?.inventoryItem?.variant?.displayName || "";

    // 4. Send emails via Resend
    for (const sub of subscribers) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🔔 ${productName} is Back in Stock!`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #28a745;">🎉 Great News!</h2>
                <p>The <strong>${productName}</strong> is now back in stock.</p>
                ${variantName ? `<p style="color: #666;">Variant: ${variantName}</p>` : ''}
                <p>Shop: <strong>${sub.shop}</strong></p>
                <br />
                <a href="https://${sub.shop}" style="background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Shop Now</a>
              </div>
            `
          })
        });

        if (res.ok) {
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { notified: true }
          });
          console.log(`✅ Success for ${sub.email}`);
        }
      } catch (err) {
        console.error("❌ Send Error:", err.message);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Error", { status: 500 });
  }
}