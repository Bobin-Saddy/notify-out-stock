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
    console.error("Email failed:", err.message);
    return false;
  }
}

export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  
  const available = payload.available !== undefined ? Number(payload.available) : 
                    (payload.available_adjustment !== undefined ? Number(payload.available_adjustment) : null);

  if (available === null) return new Response("No quantity data", { status: 200 });

  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Out of stock products reminder', 
    includeSku: true, 
    includeVendor: true, 
    includePrice: true,
    includeTags: true
  };

  // IMPORTANT: Ensure SHOPIFY_APP_URL is your NGROK/Cloudflare URL
  let APP_URL = process.env.SHOPIFY_APP_URL || "";
  if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

  try {
    const response = await admin.graphql(`
      query getProductInfo($id: ID!) {
        inventoryItem(id: $id) {
          sku
          variant {
            displayName
            price
            product {
              title
              handle
              vendor
              featuredImage { url }
              tags
            }
          }
        }
        shop { currencyCode name }
      }
    `, { variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` } });

    const json = await response.json();
    const inv = json.data?.inventoryItem;
    const variant = inv?.variant;
    
    if (!variant) return new Response("Variant not found", { status: 200 });

    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;
    const productImg = variant.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        // We add a timestamp (v=...) to prevent email clients from caching an old stock count
        const dynamicStockBadge = `${APP_URL}api/stock-badge?inventoryItemId=${inventoryItemId}&shop=${shop}&v=${Date.now()}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding: 40px; text-align: center;">
                <h1 style="color: #111827; font-size: 28px; font-weight: 800; margin: 0;">Back In Stock!</h1>
                <p style="color: #4b5563; margin: 10px 0 20px 0;">Available now at <strong>${shopName}</strong>.</p>
                
                <div style="padding: 15px; border: 1px solid #e5e7eb; border-radius: 12px; display: inline-block; background-color: #f9fafb;">
                   <p style="font-size: 11px; color: #9ca3af; text-transform: uppercase; margin: 0 0 8px 0; font-weight: bold;">Live Inventory Status</p>
                   <img src="${dynamicStockBadge}" alt="Stock Count" width="200" height="40" style="display: block; border: 0;">
                </div>
              </td></tr>
              <tr><td style="padding: 0 40px 40px; text-align: center;">
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 30px;">
                  <img src="${productImg}" style="width: 100%; max-width: 200px; border-radius: 12px; margin-bottom: 20px;">
                  <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 18px;">${variant.product.title}</h2>
                  ${settings.includePrice ? `<p style="font-size: 22px; font-weight: 900; color: #4f46e5; margin: 0 0 20px 0;">${currency} ${variant.price}</p>` : ''}
                  <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 14px 35px; border-radius: 10px; text-decoration: none; font-weight: bold;">Shop Now</a>
                </div>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" />
          </div>
        `;

        const sent = await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}`,
          html: customerHtml
        });

        if (sent) await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
      }
    } 
    else if (available <= 0) {
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 20px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 12px;">
          <h2 style="color: #991b1b;">🚨 ${settings.subjectLine}</h2>
          <p><strong>Product:</strong> ${variant.product.title}</p>
          <p><strong>Variant:</strong> ${variant.displayName}</p>
          ${settings.includeSku ? `<p><strong>SKU:</strong> ${inv.sku}</p>` : ''}
          <a href="https://${shop}/admin/products" style="color: #4f46e5; font-weight: bold;">Manage Product</a>
        </div>
      `;
      await sendEmail({
        from: 'Inventory <onboarding@resend.dev>',
        to: settings.adminEmail,
        subject: `🚨 Stock Out: ${variant.product.title}`,
        html: adminHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}