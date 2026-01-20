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
    const result = await res.json();
    console.log("Resend API Response:", result); // Debugging ke liye
    return res.ok;
  } catch (err) {
    console.error("Email failed:", err.message);
    return false;
  }
}

export async function action({ request }) {
  // 1. Webhook Authentication
  const { payload, shop, admin } = await authenticate.webhook(request);
  
  // Shopify inventory level webhooks mein kabhi kabhi field names alag hote hain
  const inventoryItemId = String(payload.inventory_item_id);
  
  // Available quantity check logic (robust version)
  const available = payload.available !== undefined ? Number(payload.available) : 
                    (payload.available_adjustment !== undefined ? Number(payload.available_adjustment) : null);

  console.log(`Processing Webhook for ${shop}. Item: ${inventoryItemId}, Qty: ${available}`);

  // 2. Fetch Settings from DB
  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Product Restock Alert', 
    includeSku: true, 
    includeVendor: true, 
    includePrice: true 
  };

  // 3. App URL for Tracking
  let APP_URL = process.env.SHOPIFY_APP_URL || "";
  if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

  try {
    // 4. Get Product/Variant Data via GraphQL
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

    if (!variant) {
      console.error("Variant not found for ID:", inventoryItemId);
      return new Response("Variant Not Found", { status: 200 });
    }

    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;
    const productImg = variant.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    // --- CASE 1: BACK IN STOCK (Sent to Customers) ---
    if (available !== null && available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <h1 style="color: #111827; font-size: 28px; font-weight: 800; margin: 0;">Back In Stock!</h1>
                  <p style="color: #4b5563; margin-top: 10px;">A product you liked is available again at <strong>${shopName}</strong>.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 40px;">
                  <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px; text-align: center;">
                    <img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;">
                    <h2 style="font-size: 20px; color: #111827; margin: 0;">${variant.product.title}</h2>
                    <p style="font-size: 24px; font-weight: 900; color: #4f46e5; margin: 15px 0;">${currency} ${variant.price}</p>
                    <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold;">Buy It Now</a>
                  </div>
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
    
    // --- CASE 2: OUT OF STOCK (Sent to Admin) ---
    else if (available !== null && available <= 0) {
      console.log("Sending Out of Stock mail to Admin:", settings.adminEmail);
      
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <span style="font-size: 24px; margin-right: 10px;">🚨</span>
            <h2 style="color: #991b1b; margin: 0; font-size: 18px;">${settings.subjectLine}</h2>
          </div>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca;">
            <p style="margin: 0 0 10px 0;"><strong>Product:</strong> ${variant.product.title}</p>
            <p style="margin: 0 0 10px 0;"><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku ? `<p style="margin: 0 0 10px 0; color: #6b7280;"><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includeVendor ? `<p style="margin: 0 0 10px 0; color: #6b7280;"><strong>Vendor:</strong> ${variant.product.vendor}</p>` : ''}
            ${settings.includePrice ? `<p style="margin: 0 0 10px 0; color: #111827;"><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
          </div>
          <div style="margin-top: 25px; text-align: center;">
            <a href="https://${shop}/admin/products" style="background-color: #111827; color: white; padding: 12px 25px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 14px;">Update Stock in Shopify</a>
          </div>
        </div>
      `;

      const adminMailSent = await sendEmail({
        from: 'Inventory Alerts <onboarding@resend.dev>',
        to: settings.adminEmail, // Database se li gayi email
        subject: `🚨 Stock Alert: ${variant.product.title}`,
        html: adminHtml
      });

      console.log("Admin Mail Status:", adminMailSent ? "Sent" : "Failed");
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}