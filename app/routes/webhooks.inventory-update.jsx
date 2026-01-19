import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);
  
  // App URL ensure trailing slash is handled
  let APP_URL = process.env.SHOPIFY_APP_URL || "https://notify-out-stock-production.up.railway.app/";
  if (!APP_URL.endsWith('/')) APP_URL += '/';

  try {
    console.log(`Checking stock for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            price
            product {
              title
              handle
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

    if (!variant) return new Response("Variant not found", { status: 200 });

    const productTitle = variant.product.title;
    const variantTitle = variant.displayName;
    const price = variant.price;
    const imageUrl = variant.product.featuredImage?.url || "";
    const productHandle = variant.product.handle;

    // --- CASE 1: STOCK IS BACK (Send to Customers) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({
        where: { inventoryItemId: inventoryItemId, notified: false },
      });

      if (subscribers.length > 0) {
        for (const sub of subscribers) {
          const openTrackingUrl = `${APP_URL}api/track-open?id=${sub.id}`;
          const targetStoreUrl = `https://${shop}/products/${productHandle}`;
          const clickTrackingUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(targetStoreUrl)}`;

          const backInStockHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
              <h1 style="text-align: center; color: #764ba2;">🎉 Back in Stock!</h1>
              ${imageUrl ? `<img src="${imageUrl}" style="width: 100%; max-width: 200px; display: block; margin: 0 auto;" />` : ''}
              <h2 style="text-align: center;">${productTitle}</h2>
              <p style="text-align: center; color: #666;">${variantTitle} is now available for ${currency} ${price}</p>
              <div style="text-align: center; margin-top: 20px;">
                <a href="${clickTrackingUrl}" style="background: #764ba2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Shop Now</a>
              </div>
              <img src="${openTrackingUrl}" width="1" height="1" style="display:none !important;" />
            </div>
          `;

          const sent = await sendEmail({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🎉 Back in Stock: ${productTitle}`,
            html: backInStockHtml
          });

          if (sent) {
            await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } 
    
    // --- CASE 2: STOCK IS ZERO (Send to Admin) ---
    else if (available <= 0) {
      console.log("Sending Out of Stock alert to Admin...");
      const outOfStockHtml = `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #ff6b6b;">
          <h2 style="color: #ff6b6b;">🚨 Out of Stock Alert</h2>
          <p>The following item just hit 0 stock on your store <strong>${shop}</strong>:</p>
          <p><strong>Product:</strong> ${productTitle}<br><strong>Variant:</strong> ${variantTitle}</p>
          <a href="https://${shop}/admin" style="color: #667eea;">View in Shopify Admin</a>
        </div>
      `;

      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com', // Aapki Admin ID
        subject: `🚨 Out of Stock: ${productTitle}`,
        html: outOfStockHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}