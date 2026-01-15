import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

// Rate limit se bachne ke liye delay function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);

  try {
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;
    
    let productName = `Inventory Item #${inventoryItemId}`;
    let variantName = "";

    console.log(`📦 Inventory Update for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    try {
      const { graphql } = await unauthenticated.admin(shop);
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
      if (details.data?.inventoryItem?.variant) {
        productName = details.data.inventoryItem.variant.product.title;
        variantName = details.data.inventoryItem.variant.displayName;
      }
    } catch (sessionError) {
      console.error(`⚠️ Session missing. Using IDs only.`);
    }

    // --- CASE A: OUT OF STOCK (Admin Alert) ---
    if (available <= 0) {
      // 500ms wait taaki pichle webhook se conflict na ho
      await sleep(500); 
      
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Stock Alert <onboarding@resend.dev>',
          to: 'digittrix.savita@gmail.com',
          subject: `🚨 Out of Stock: ${productName}`,
          html: `<h3>Stock Alert</h3><p>${productName} is out of stock in ${shop}.</p>`
        })
      });

      return new Response("Admin notified", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Alert) ---
    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId, notified: false },
    });

    if (subscribers.length === 0) {
      return new Response("No subscribers", { status: 200 });
    }

    for (const sub of subscribers) {
      try {
        // Har email ke beech mein 600ms ka gap (Rate Limit Fix)
        await sleep(600); 

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🎉 ${productName} is Back in Stock!`,
            html: `<h3>Great News!</h3><p>${productName} is back in stock.</p>`
          })
        });

        if (res.ok) {
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { notified: true }
          });
          console.log(`✅ Sent to ${sub.email}`);
        } else if (res.status === 429) {
            console.error("⚠️ Still hitting rate limit, consider increasing sleep time.");
        }
      } catch (err) {
        console.error(`❌ Loop Error:`, err.message);
      }
    }

    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Internal Error", { status: 500 });
  }
}