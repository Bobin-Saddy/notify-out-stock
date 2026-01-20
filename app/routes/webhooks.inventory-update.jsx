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
  const available = Number(payload.available); // Current stock level
  
  // App URL for tracking (Trailing slash handled)
  let APP_URL = process.env.SHOPIFY_APP_URL || "https://notify-out-stock-production.up.railway.app/";
  if (!APP_URL.endsWith('/')) APP_URL += '/';

  // 1. Fetch Dynamic Settings
  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Product Alert', 
    includeSku: true, 
    includeVendor: true, 
    includePrice: true 
  };

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
        shop { currencyCode name }
      }
    `);

    const json = await response.json();
    const inv = json.data?.inventoryItem;
    const variant = inv?.variant;
    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;

    if (!variant) return new Response("Variant not found", { status: 200 });

    const productImg = variant.product.featuredImage?.url || "";
    const targetStoreUrl = `https://${shop}/products/${variant.product.handle}`;

    // --- CASE 1: BACK IN STOCK (available > 0) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        // --- TRACKING LINKS ---
        const openTrackingUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickTrackingUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(targetStoreUrl)}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden;">
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <h1 style="color: #111827; font-size: 28px; font-weight: 800; margin-bottom: 10px;">It’s Back in Stock!</h1>
                  <p style="color: #4b5563; font-size: 16px;">The wait is over. <strong>${variant.product.title}</strong> is available again.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 40px;">
                  <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px; text-align: center;">
                    ${productImg ? `<img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;">` : ''}
                    <h2 style="font-size: 20px; color: #111827;">${variant.displayName}</h2>
                    <p style="font-size: 24px; font-weight: 900; color: #4f46e5; margin: 15px 0;">${currency} ${variant.price}</p>
                    <a href="${clickTrackingUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold;">Shop Now</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px; text-align: center;">
                  <p style="color: #9ca3af; font-size: 12px;">From ${shopName}</p>
                </td>
              </tr>
            </table>
            <img src="${openTrackingUrl}" width="1" height="1" style="display:none !important;" />
          </div>
        `;

        const sent = await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}`,
          html: customerHtml
        });

        if (sent) {
          await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
        }
      }
    } 
    
    // --- CASE 2: OUT OF STOCK (available <= 0) ---
    else if (available <= 0) {
      console.log(`Sending Out of Stock alert to Admin: ${settings.adminEmail}`);
      
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <h2 style="color: #ef4444;">🚨 ${settings.subjectLine}</h2>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            <p><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku ? `<p style="color: #6b7280;"><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includeVendor ? `<p style="color: #6b7280;"><strong>Vendor:</strong> ${variant.product.vendor}</p>` : ''}
            ${settings.includePrice ? `<p style="color: #111827;"><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
          </div>
          <p style="color: #991b1b; font-size: 14px; margin-top: 15px;">Stock is currently: <strong>${available}</strong></p>
          <div style="margin-top: 20px; text-align: center;">
            <a href="https://${shop}/admin/products" style="background-color: #111827; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold;">Check Admin</a>
          </div>
        </div>
      `;

      await sendEmail({
        from: 'Inventory Alert <onboarding@resend.dev>',
        to: settings.adminEmail,
        subject: `🚨 Out of Stock: ${variant.product.title}`,
        html: adminHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}