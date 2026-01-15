import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

export async function action({ request }) {
  // 1. Authenticate the webhook to get payload and shop domain
  const { payload, shop } = await authenticate.webhook(request);

  try {
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;
    
    // Default values in case GraphQL fails due to session issues
    let productName = `Inventory Item #${inventoryItemId}`;
    let variantName = "";

    console.log(`📦 Inventory Update for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    // 2. Try to fetch real Product Names from Shopify
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
      console.error(`⚠️ Session missing for ${shop}. Sending alert with IDs only.`);
    }

    // --- CASE A: PRODUCT OUT OF STOCK (Notify Admin) ---
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
          to: 'digittrix.savita@gmail.com', // Your Admin Email
          subject: `🚨 Out of Stock: ${productName}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid #d9534f; border-radius: 10px; max-width: 500px;">
              <h2 style="color: #d9534f;">Inventory Alert</h2>
              <p>The following item is now <strong>OUT OF STOCK</strong>.</p>
              <hr />
              <p><strong>Product:</strong> ${productName}</p>
              ${variantName && variantName !== 'Default Title' ? `<p><strong>Variant:</strong> ${variantName}</p>` : ''}
              <p><strong>Store:</strong> ${shop}</p>
              <br />
              <a href="https://admin.shopify.com/store/${shop.split('.')[0]}/products" style="background: #d9534f; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Manage Inventory</a>
            </div>
          `
        })
      });

      return new Response("Admin notified", { status: 200 });
    }

    // --- CASE B: PRODUCT BACK IN STOCK (Notify Customers) ---
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
            subject: `🎉 ${productName} is Back in Stock!`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
                <h2 style="color: #28a745;">Great News!</h2>
                <p>The <strong>${productName}</strong> you were looking for is now back in stock.</p>
                ${variantName && variantName !== 'Default Title' ? `<p style="color: #666;">Variant: ${variantName}</p>` : ''}
                <br />
                <a href="https://${sub.shop}" style="background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Shop Now</a>
              </div>
            `
          })
        });

        if (res.ok) {
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { notified: true }
          });
          console.log(`✅ Success for subscriber: ${sub.email}`);
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