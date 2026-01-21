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

async function getInventoryLevels(admin, inventoryItemId) {
  try {
    const query = `query {
      inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
        inventoryLevels(first: 1) {
          edges { node { available } }
        }
      }
    }`;
    const response = await admin.graphql(query);
    const json = await response.json();
    return json.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.available || 0;
  } catch (err) {
    return null;
  }
}

// Badge for Low Stock
function getCountdownBadge(quantity, threshold = 200) {
  if (quantity === null || quantity > threshold) return '';
  const color = quantity <= 3 ? '#dc2626' : quantity <= 7 ? '#f59e0b' : '#10b981';
  return `
    <div style="background: ${color}11; border: 1px solid ${color}; border-radius: 8px; padding: 10px; margin: 10px 0; text-align: center;">
      <p style="margin: 0; color: ${color}; font-weight: bold; font-size: 14px;">
        ⚡ Only ${quantity} left in stock!
      </p>
    </div>
  `;
}

// Badge for Price Drop
function getPriceDropBadge(oldPriceStr, newPriceNum, currency) {
  const oldPrice = parseFloat(oldPriceStr);
  if (!oldPrice || newPriceNum >= oldPrice) return '';
  
  const savings = (oldPrice - newPriceNum).toFixed(2);
  return `
    <div style="background: #f0fdf4; border: 1px solid #16a34a; border-radius: 8px; padding: 10px; margin: 10px 0; text-align: center;">
      <p style="margin: 0; color: #16a34a; font-weight: bold; font-size: 14px;">
        📉 Price Dropped! Save ${currency} ${savings}
      </p>
    </div>
  `;
}

export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = payload.available ?? payload.available_adjustment ?? null;

  if (available === null) return new Response("No quantity data", { status: 200 });

  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    includePrice: true,
    countdownThreshold: 200 
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
              featuredImage { url }
            }
          }
        }
        shop { currencyCode name }
      }
    `);

    const json = await response.json();
    const variant = json.data?.inventoryItem?.variant;
    if (!variant) return new Response("Variant not found", { status: 200 });

    const currentPrice = parseFloat(variant.price);
    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;
    const productImg = variant.product.featuredImage?.url || "";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;

    // CASE 1: STOCK IS BACK
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId, notified: false } 
      });

      for (const sub of subscribers) {
        const stockQuantity = (await getInventoryLevels(admin, inventoryItemId)) ?? available;
        const isPriceDrop = sub.priceAtSubscription && (currentPrice < parseFloat(sub.priceAtSubscription));

        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        // Dynamic HTML Content
        const customerHtml = `
          <div style="background-color: #f9fafb; padding: 20px; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 500px; background: white; border-radius: 15px; border: 1px solid #e5e7eb;">
              <tr><td style="padding: 30px; text-align: center;">
                <h2 style="margin: 0;">${isPriceDrop ? '📉 Price Drop + Back in Stock!' : '🎉 It\'s Back in Stock!'}</h2>
                <p style="color: #6b7280;">Good news! <strong>${variant.product.title}</strong> is available again.</p>
                
                <img src="${productImg}" style="width: 200px; margin: 20px 0; border-radius: 10px;">
                
                ${getPriceDropBadge(sub.priceAtSubscription, currentPrice, currency)}
                
                <div style="margin: 15px 0;">
                  <span style="font-size: 24px; font-weight: bold; color: #4f46e5;">${currency} ${currentPrice}</span>
                  ${isPriceDrop ? `<span style="text-decoration: line-through; color: #9ca3af; margin-left: 10px;">${currency} ${sub.priceAtSubscription}</span>` : ''}
                </div>

                ${getCountdownBadge(stockQuantity, settings.countdownThreshold)}

                <a href="${clickUrl}" style="display: block; background: #111827; color: white; padding: 15px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">Shop Now</a>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;">
          </div>
        `;

        const sent = await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: isPriceDrop ? `📉 Price Dropped! ${variant.product.title} is back!` : `🎉 Back in Stock: ${variant.product.title}`,
          html: customerHtml
        });

        if (sent) {
          await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
        }
      }
    } 
    
    // CASE 2: OUT OF STOCK (Admin Alert)
    else if (available <= 0) {
      await sendEmail({
        from: 'Inventory Manager <onboarding@resend.dev>',
        to: settings.adminEmail,
        subject: `🚨 Stock Out: ${variant.product.title}`,
        html: `<h3>${variant.product.title} is now out of stock.</h3><p>Variant: ${variant.displayName}</p>`
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}