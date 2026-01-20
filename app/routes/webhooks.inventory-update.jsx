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
  
  // 1. Database se Admin ki Dynamic Settings fetch karein
  const settings = await prisma.appSettings.findUnique({
    where: { shop: shop }
  }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Out of stock products reminder',
    includeSku: true,
    includeVendor: true,
    includePrice: false
  };

  let APP_URL = process.env.SHOPIFY_APP_URL || "";
  if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

  try {
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          sku
          variant {
            displayName
            price
            product {
              title
              handle
              vendor
              featuredImage { url }
            }
          }
        }
        shop { currencyCode }
      }
    `);

    const json = await response.json();
    const invItem = json.data?.inventoryItem;
    const variant = invItem?.variant;
    const currency = json.data?.shop?.currencyCode || "USD";

    if (!variant) return new Response("Variant not found", { status: 200 });

    // --- CASE 1: BACK IN STOCK (Customers) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({
        where: { inventoryItemId: inventoryItemId, notified: false },
      });

      for (const sub of subscribers) {
        const targetStoreUrl = `https://${shop}/products/${variant.product.handle}`;
        const clickTrackingUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(targetStoreUrl)}`;

        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
            <h1 style="color: #4f46e5; text-align: center;">🎉 It's Back!</h1>
            <p>Hi, <strong>${variant.product.title}</strong> is back in stock.</p>
            <p>Price: ${currency} ${variant.price}</p>
            <div style="text-align: center; margin-top: 20px;">
              <a href="${clickTrackingUrl}" style="background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px;">Buy Now</a>
            </div>
          </div>
        `;

        const sent = await sendEmail({
          from: 'Restock Alert <onboarding@resend.dev>',
          to: sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}`,
          html: html
        });

        if (sent) {
          await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
        }
      }
    } 
    
    // --- CASE 2: OUT OF STOCK (Admin Alert) ---
    else if (available <= 0) {
      const outOfStockHtml = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ff6b6b; border-radius: 12px;">
          <h2 style="color: #ff6b6b;">🚨 ${settings.subjectLine}</h2>
          <p>Product: <strong>${variant.product.title}</strong></p>
          <p>Variant: ${variant.displayName}</p>
          ${settings.includeSku ? `<p>SKU: ${invItem.sku}</p>` : ''}
          ${settings.includeVendor ? `<p>Vendor: ${variant.product.vendor}</p>` : ''}
          ${settings.includePrice ? `<p>Price: ${currency} ${variant.price}</p>` : ''}
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <a href="https://${shop}/admin" style="color: #4f46e5; font-weight: bold;">Open Shopify Admin</a>
        </div>
      `;

      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: settings.adminEmail, // Dynamic Email from Settings
        subject: `🚨 ${settings.subjectLine}`,
        html: outOfStockHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}