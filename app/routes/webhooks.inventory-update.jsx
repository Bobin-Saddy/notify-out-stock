import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

// Rate limit se bachne ke liye delay function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Robust email sender with Retry logic
async function sendEmailWithRetry(emailData, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (res.ok) return true;

      if (res.status === 429) { // Rate limit error
        console.log(`⚠️ Rate limit hit, sleeping for ${1000 * (i + 1)}ms before retry...`);
        await sleep(1000 * (i + 1)); // Har fail par wait badhao
        continue;
      }
      
      const err = await res.json();
      console.error("❌ Resend Error:", err);
      return false;
    } catch (err) {
      console.error("❌ Fetch Network Error:", err.message);
      await sleep(1000);
    }
  }
  return false;
}

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);

  try {
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;
    
    let productName = `Product ID: ${inventoryItemId}`;
    let variantName = "";

    console.log(`📦 Inventory Update for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    // Shopify se details fetch karein
    try {
      const { graphql } = await unauthenticated.admin(shop);
      const response = await graphql(`
        query getProductInfo {
          inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
            variant { displayName product { title } }
          }
        }
      `);
      const details = await response.json();
      if (details.data?.inventoryItem?.variant) {
        productName = details.data.inventoryItem.variant.product.title;
        variantName = details.data.inventoryItem.variant.displayName;
      }
    } catch (e) { console.error("Session Error, using IDs only."); }

    // --- CASE A: OUT OF STOCK (Admin Notification) ---
    if (available <= 0) {
      await sleep(600); // Thoda gap
      await sendEmailWithRetry({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productName}`,
        html: `<h3>Stock Alert</h3><p>${productName} is now 0 in ${shop}.</p>`
      });
      return new Response("OK", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Notifications) ---
    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId, notified: false },
    });

    if (subscribers.length === 0) return new Response("OK", { status: 200 });

    // Processing 50+ subscribers safely
    for (const sub of subscribers) {
      // Har email ke beech 600ms gap taaki Resend limit (2/sec) na toote
      await sleep(600);

      const success = await sendEmailWithRetry({
        from: 'Restock Alert <onboarding@resend.dev>',
        to: sub.email,
        subject: `🎉 ${productName} is Back in Stock!`,
        html: `<h3>Great News!</h3><p>${productName} is back at ${sub.shop}.</p>`
      });

      if (success) {
        await prisma.backInStock.update({
          where: { id: sub.id },
          data: { notified: true }
        });
        console.log(`✅ Sent to ${sub.email}`);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Error:", err);
    return new Response("Error", { status: 500 });
  }
}