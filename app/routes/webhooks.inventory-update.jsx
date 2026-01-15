import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  // 1. Webhook authenticate karein (payload lene ke liye)
  const { payload, shop, unauthenticated } = await authenticate.webhook(request);

  try {
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;

    console.log(`📦 Inventory Update for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    // 2. Admin context manually create karein (graphql error fix)
    // Agar authenticate.webhook se admin nahi milta, toh hum unauthenticated access use karte hain
    const { graphql } = await unauthenticated.admin(shop);

    // 3. Fetch Product Details
    const response = await graphql(`
      query getProductInfo {
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
    const productName = details.data?.inventoryItem?.variant?.product?.title || "Unknown Product";
    const variantName = details.data?.inventoryItem?.variant?.displayName || "";

    // --- CASE A: OUT OF STOCK (Admin Alert) ---
    if (available <= 0) {
      console.log(`🚨 Notifying Admin: ${productName} is out of stock.`);
      
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Stock Alert <onboarding@resend.dev>',
          to: 'digittrix.savita@gmail.com', // Admin email
          subject: `🚨 Out of Stock: ${productName}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid #d9534f; border-radius: 10px; max-width: 500px;">
              <h2 style="color: #d9534f;">Inventory Alert</h2>
              <p>The product <strong>${productName}</strong> is now out of stock.</p>
              ${variantName && variantName !== 'Default Title' ? `<p>Variant: ${variantName}</p>` : ''}
              <p>Store: ${shop}</p>
              <br />
              <a href="https://admin.shopify.com/store/${shop.split('.')[0]}/products" style="background: #d9534f; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Manage Inventory</a>
            </div>
          `
        })
      });

      return new Response("Admin notified", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Alert) ---
    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId,
        notified: false 
      },
    });

    if (subscribers.length === 0) {
      return new Response("No subscribers found", { status: 200 });
    }

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
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
                <h2 style="color: #28a745;">🎉 Great News!</h2>
                <p>The <strong>${productName}</strong> is now back in stock.</p>
                <a href="https://${sub.shop}" style="background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">Shop Now</a>
              </div>
            `
          })
        });

        if (res.ok) {
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { notified: true }
          });
        }
      } catch (err) {
        console.error(`❌ Send error:`, err.message);
      }
    }

    return new Response("Success", { status: 200 });

  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("Error", { status: 500 });
  }
}