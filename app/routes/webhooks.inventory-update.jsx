import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

async function sendEmail(emailData) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    const data = await res.json();
    if (!res.ok) console.error("Resend specific error:", data);
    return res.ok;
  } catch (err) {
    console.error("Fetch failed:", err.message);
    return false;
  }
}

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  try {
    console.log(`Checking stock for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            price
            product {
              title
              featuredImage { url }
            }
          }
        }
        shop { currencyCode }
      }
    `);

    const json = await response.json();
    const variant = json.data?.inventoryItem?.variant;
    const currency = json.data?.shop?.currencyCode || "USD";

    if (!variant) {
      console.log("No variant found for this inventory item.");
      return new Response("Variant not found", { status: 200 });
    }

    const productTitle = variant.product.title;
    const variantTitle = variant.displayName;
    const price = variant.price;
    const imageUrl = variant.product.featuredImage?.url || "";

    const productCardHtml = `
      <div style="font-family: Arial, sans-serif; border: 1px solid #eeeeee; padding: 20px; border-radius: 12px; max-width: 450px; background-color: #ffffff;">
        ${imageUrl ? `<img src="${imageUrl}" alt="${productTitle}" style="width: 100%; border-radius: 8px; margin-bottom: 15px;" />` : ''}
        <h2 style="margin: 0; color: #333333; font-size: 22px;">${productTitle}</h2>
        <p style="color: #777777; margin: 5px 0 15px 0; font-size: 16px;">${variantTitle}</p>
        <div style="font-size: 20px; font-weight: bold; color: #000000; margin-bottom: 20px;">
          Price: ${currency} ${price}
        </div>
      </div>
    `;

    // --- LOGIC START ---

    if (available <= 0) {
      console.log("Sending Out of Stock alert to Admin...");
      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productTitle}`,
        html: `<div style="padding: 20px;"><h1>It's Back!</h1>${productCardHtml}<br/><a href="https://${shop}">Shop Now →</a></div>`
      });
    } 
    else {
      // Step 1: Check database for subscribers
      const subscribers = await prisma.backInStock.findMany({
        where: { 
          inventoryItemId: inventoryItemId, 
          notified: false 
        },
      });

      console.log(`Found ${subscribers.length} pending subscribers for this item.`);

      if (subscribers.length > 0) {
        // Step 2: Send emails in a loop with a tiny delay to avoid 429 error
        for (const sub of subscribers) {
          const sent = await sendEmail({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🎉 Back in Stock: ${productTitle}`,
            html: `<div style="padding: 20px;"><h1>It's Back!</h1>${productCardHtml}<br/><a href="https://${shop}">Shop Now →</a></div>`
          });

          if (sent) {
            await prisma.backInStock.update({ 
              where: { id: sub.id }, 
              data: { notified: true } 
            });
            console.log(`✅ Success: Mail sent to ${sub.email}`);
          }
          
          // 500ms gap between each email to prevent Resend rate limit
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}