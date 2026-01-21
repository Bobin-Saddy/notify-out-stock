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
    const productImg = variant.product.featuredImage?.url || "";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    // --- CASE 1: BACK IN STOCK (Send to Customers) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        const dynamicStockBadge = `${APP_URL}api/stock-badge?inventoryItemId=${inventoryItemId}&shop=${shop}&v=${Date.now()}`;

        const customerHtml = `
          <div style="background-color: #f9fafb; padding: 50px 0; font-family: sans-serif; text-align: center;">
            <table align="center" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb;">
              <tr><td style="padding: 40px;">
                <h1 style="color: #111827; font-size: 24px;">Good News!</h1>
                <p style="color: #4b5563;">It's back in stock at <strong>${shopName}</strong>.</p>
                
                <div style="margin: 25px 0;">
                  <img src="${dynamicStockBadge}" alt="Live Stock Status" width="180" height="35" style="display: block; margin: 0 auto;">
                </div>

                <div style="padding: 24px; background-color: #f8fafc; border-radius: 12px;">
                  <img src="${productImg}" width="150" style="border-radius: 8px; margin-bottom: 16px;">
                  <h2 style="font-size: 18px; color: #111827;">${variant.product.title}</h2>
                  ${settings.includePrice ? `<p style="font-size: 20px; font-weight: bold; color: #4f46e5;">${currency} ${variant.price}</p>` : ''}
                  <a href="${clickUrl}" style="background-color: #111827; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Shop Now</a>
                </div>
              </td></tr>
            </table>
          </div>
        `;

        await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}`,
          html: customerHtml
        });
        await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
      }
    } 
    
    // --- CASE 2: OUT OF STOCK (Send to Admin) ---
    else if (available <= 0) {
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 25px; border: 1px solid #fee2e2; background-color: #fef2f2; border-radius: 12px; max-width: 500px;">
          <h2 style="color: #991b1b; margin-top: 0;">🚨 ${settings.subjectLine}</h2>
          <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #fecaca;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            <p><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku ? `<p><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includeVendor ? `<p><strong>Vendor:</strong> ${variant.product.vendor}</p>` : ''}
          </div>
          <p style="text-align: center; margin-top: 20px;">
            <a href="https://${shop}/admin/products" style="background-color: #b91c1c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Update Inventory</a>
          </p>
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