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

  // NGROK ya Production URL check karein
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

    // --- CASE 1: BACK IN STOCK (Customers) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        // Dynamic Badge URL with Cache Buster
        const dynamicStockBadge = `${APP_URL}api/stock-badge?inventoryItemId=${inventoryItemId}&shop=${shop}&t=${Date.now()}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif; text-align: center;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; border-collapse: collapse; overflow: hidden;">
              <tr><td style="padding: 40px;">
                <h1 style="color: #111827; margin: 0;">Back In Stock!</h1>
                <p style="color: #4b5563;">Available now at <strong>${shopName}</strong>.</p>
                
                <div style="margin: 25px 0;">
                  <img src="${dynamicStockBadge}" alt="Current Stock" width="200" style="display: inline-block; vertical-align: middle; min-height: 40px;">
                </div>

                <div style="border: 1px solid #e5e7eb; border-radius: 20px; padding: 20px;">
                  <img src="${productImg}" style="width: 100%; max-width: 180px; border-radius: 10px;">
                  <h3 style="margin: 15px 0 5px;">${variant.product.title}</h3>
                  ${settings.includePrice ? `<p style="font-size: 20px; font-weight: bold; color: #4f46e5;">${currency} ${variant.price}</p>` : ''}
                  <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">Shop Now</a>
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
    
    // --- CASE 2: OUT OF STOCK (Admin Alert) ---
    else if (available <= 0) {
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 12px; max-width: 500px;">
          <h2 style="color: #b91c1c;">🚨 Inventory Alert</h2>
          <p><strong>Product:</strong> ${variant.product.title}</p>
          <p><strong>Status:</strong> OUT OF STOCK</p>
          ${settings.includeSku ? `<p><strong>SKU:</strong> ${inv.sku}</p>` : ''}
          <a href="https://${shop}/admin/products">View in Shopify</a>
        </div>
      `;
      await sendEmail({
        from: 'Inventory Manager <onboarding@resend.dev>',
        to: settings.adminEmail,
        subject: `🚨 Out of Stock: ${variant.product.title}`,
        html: adminHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}