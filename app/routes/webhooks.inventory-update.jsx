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
  const available = Number(payload.available);
  
  // App URL setup for tracking routes
  let APP_URL = process.env.SHOPIFY_APP_URL || "";
  if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Product Restock Alert', 
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

    const productImg = variant.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    // --- CASE 1: BACK IN STOCK (Sent to Customers with Tracking) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        // --- TRACKING LOGIC ---
        // 1. Open Tracking: Invisible pixel
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        // 2. Click Tracking: Proxy link that redirects to product
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; border-collapse: separate; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <span style="background-color: #e0e7ff; color: #4338ca; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">Back In Stock</span>
                  <h1 style="color: #111827; font-size: 32px; font-weight: 800; margin: 20px 0 10px 0; letter-spacing: -1px;">It’s finally here!</h1>
                  <p style="color: #4b5563; font-size: 16px; line-height: 24px;">Good news! The item you were waiting for is back in stock.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 40px;">
                  <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 20px; padding: 30px; text-align: center;">
                    <img src="${productImg}" alt="${variant.product.title}" style="width: 100%; max-width: 280px; height: auto; border-radius: 12px; margin-bottom: 25px;">
                    <h2 style="font-size: 22px; color: #111827; margin: 0; font-weight: 700;">${variant.product.title}</h2>
                    <p style="color: #6b7280; font-size: 14px; margin: 8px 0;">${variant.displayName}</p>
                    <p style="font-size: 28px; font-weight: 900; color: #4f46e5; margin: 20px 0;">${currency} ${variant.price}</p>
                    
                    <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 18px 45px; border-radius: 15px; text-decoration: none; font-weight: bold; font-size: 16px;">Secure Yours Now</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">You're receiving this because you subscribed to alerts on <strong>${shopName}</strong>.</p>
                </td>
              </tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none !important;" />
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
    
    // --- CASE 2: OUT OF STOCK (Admin Notification) ---
    else if (available <= 0) {
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <h2 style="color: #991b1b; font-size: 20px;">🚨 ${settings.subjectLine}</h2>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca; margin-top: 15px;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            ${settings.includeSku ? `<p style="color: #6b7280;"><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includePrice ? `<p><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
          </div>
          <div style="margin-top: 25px; text-align: center;">
            <a href="https://${shop}/admin/products" style="background-color: #111827; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold;">Manage Inventory</a>
          </div>
        </div>
      `;

      await sendEmail({
        from: 'Inventory System <onboarding@resend.dev>',
        to: settings.adminEmail,
        subject: `🚨 Stock Out: ${variant.product.title}`,
        html: adminHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}