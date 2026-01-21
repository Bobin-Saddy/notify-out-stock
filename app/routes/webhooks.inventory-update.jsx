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
    includePrice: true 
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
              tags
            }
          }
        }
        shop { currencyCode name }
      }
    `);

    const json = await response.json();
    const inv = json.data?.inventoryItem;
    const variant = inv?.variant;
    if (!variant) return new Response("Variant not found", { status: 200 });

    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;
    const productImg = variant.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    // --- CASE 1: BACK IN STOCK ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        // --- DYNAMIC INVENTORY IMAGE URL ---
        // This hits your server every time the email is opened
        const dynamicStockBadge = `${APP_URL}api/stock-badge?inventoryItemId=${inventoryItemId}&shop=${shop}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding: 40px; text-align: center;">
                <h1 style="color: #111827; font-size: 28px; font-weight: 800; margin-bottom: 10px;">Back In Stock!</h1>
                <p>Available now at <strong>${shopName}</strong>.</p>
                
                <div style="margin: 20px 0;">
                  <img src="${dynamicStockBadge}" alt="Checking live stock..." style="display: block; margin: 0 auto; height: 45px;">
                  <p style="font-size: 11px; color: #9ca3af; margin-top: 5px;">*Updates live on every open</p>
                </div>
              </td></tr>
              
              <tr><td style="padding: 0 40px; text-align: center;">
                <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px;">
                  <img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;">
                  <h2>${variant.product.title}</h2>
                  ${settings.includePrice ? `<p style="font-size: 24px; font-weight: 900; color: #4f46e5;">${currency} ${variant.price}</p>` : ''}
                  <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold;">Buy Now</a>
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
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <h2 style="color: #991b1b; font-size: 20px;">🚨 ${settings.subjectLine || 'Inventory Alert'}</h2>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca; margin-top: 15px;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            <p><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku ? `<p><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includeVendor ? `<p><strong>Vendor:</strong> ${variant.product.vendor}</p>` : ''}
            ${settings.includePrice ? `<p><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
            ${settings.includeTags ? `<p><strong>Tags:</strong> ${variant.product.tags?.join(", ")}</p>` : ''}
          </div>
          <div style="margin-top: 25px; text-align: center;">
            <a href="https://${shop}/admin/products" style="background-color: #111827; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold;">Manage Inventory</a>
          </div>
        </div>
      `;

      await sendEmail({
        from: 'Inventory Manager <onboarding@resend.dev>',
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