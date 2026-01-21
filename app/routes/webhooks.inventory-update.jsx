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

// Helper function to get current inventory levels
async function getInventoryLevels(admin, inventoryItemId, locationId = null) {
  try {
    const query = locationId 
      ? `query {
          inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
            inventoryLevel(locationId: "gid://shopify/Location/${locationId}") {
              available
            }
          }
        }`
      : `query {
          inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
            inventoryLevels(first: 1) {
              edges {
                node {
                  available
                }
              }
            }
          }
        }`;
    
    const response = await admin.graphql(query);
    const json = await response.json();
    
    if (locationId) {
      return json.data?.inventoryItem?.inventoryLevel?.available || 0;
    } else {
      return json.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.available || 0;
    }
  } catch (err) {
    console.error("Error fetching inventory:", err);
    return null;
  }
}

// Generate countdown badge HTML
function getCountdownBadge(quantity, threshold = 200) {
  if (quantity === null || quantity > threshold) return '';
  
  const color = quantity <= 3 ? '#dc2626' : quantity <= 7 ? '#f59e0b' : '#10b981';
  const urgency = quantity <= 3 ? 'Only' : quantity <= 7 ? 'Just' : 'Only';
  
  return `
    <div style="background: linear-gradient(135deg, ${color}22 0%, ${color}44 100%); 
                border: 2px solid ${color}; 
                border-radius: 12px; 
                padding: 12px 20px; 
                margin: 20px 0;
                text-align: center;">
      <p style="margin: 0; color: ${color}; font-weight: 800; font-size: 18px;">
        ⚡ ${urgency} <span style="font-size: 24px;">${quantity}</span> Left in Stock!
      </p>
      <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
        Hurry before it sells out again
      </p>
    </div>
  `;
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
    countdownThreshold: 200 // Show countdown when stock is below this
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
        // Get current inventory level (in case it changed since webhook fired)
        const currentStock = await getInventoryLevels(admin, inventoryItemId);
        const stockQuantity = currentStock !== null ? currentStock : available;
        
        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        // Generate countdown badge
        const countdownBadge = getCountdownBadge(stockQuantity, settings.countdownThreshold || 200);

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding: 40px; text-align: center;">
                <h1 style="color: #111827; font-size: 28px; font-weight: 800;">🎉 Back In Stock!</h1>
                <p style="color: #6b7280;">Available now at <strong>${shopName}</strong>.</p>
              </td></tr>
              <tr><td style="padding: 0 40px; text-align: center;">
                <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px;">
                  <img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;" alt="${variant.product.title}">
                  <h2 style="color: #111827; margin: 15px 0;">${variant.product.title}</h2>
                  <p style="color: #6b7280; margin: 10px 0;">${variant.displayName}</p>
                  ${settings.includePrice ? `<p style="font-size: 24px; font-weight: 900; color: #4f46e5; margin: 15px 0;">${currency} ${variant.price}</p>` : ''}
                  
                  ${countdownBadge}
                  
                  <a href="${clickUrl}" style="display: inline-block; background-color: #111827; color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold; margin-top: 10px;">Buy Now</a>
                </div>
              </td></tr>
              <tr><td style="padding: 30px; text-align: center;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  You're receiving this because you subscribed to back-in-stock alerts
                </p>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" alt="" />
          </div>
        `;

        const sent = await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}${stockQuantity <= 5 ? ' - Limited Quantity!' : ''}`,
          html: customerHtml
        });
        
        if (sent) {
          await prisma.backInStock.update({ 
            where: { id: sub.id }, 
            data: { notified: true } 
          });
        }
      }
    } 
    
    // --- CASE 2: OUT OF STOCK (Admin Alert) ---
    else if (available <= 0) {
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <h2 style="color: #991b1b; font-size: 20px;">🚨 ${settings.subjectLine || 'Inventory Alert'}</h2>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca; margin-top: 15px;">
            <p style="margin: 8px 0;"><strong>Product:</strong> ${variant.product.title}</p>
            <p style="margin: 8px 0;"><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku ? `<p style="margin: 8px 0;"><strong>SKU:</strong> ${inv.sku}</p>` : ''}
            ${settings.includeVendor ? `<p style="margin: 8px 0;"><strong>Vendor:</strong> ${variant.product.vendor}</p>` : ''}
            ${settings.includePrice ? `<p style="margin: 8px 0;"><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
            ${settings.includeTags ? `<p style="margin: 8px 0;"><strong>Tags:</strong> ${variant.product.tags?.join(", ")}</p>` : ''}
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