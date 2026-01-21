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
      return json.data?.inventoryItem?.inventoryLevel?.available ?? 0;
    } else {
      return json.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.available ?? 0;
    }
  } catch (err) {
    console.error("Error fetching inventory levels:", err);
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

// Generate price drop badge HTML
function getPriceDropBadge(oldPrice, newPrice, currency, discountPercent) {
  if (!oldPrice || !newPrice || oldPrice <= newPrice) return '';
  
  return `
    <div style="background: linear-gradient(135deg, #dc262622 0%, #dc262644 100%); 
                border: 2px solid #dc2626; 
                border-radius: 12px; 
                padding: 15px 20px; 
                margin: 20px 0;
                text-align: center;">
      <p style="margin: 0; color: #dc2626; font-weight: 900; font-size: 16px;">
        🔥 PRICE DROP ALERT!
      </p>
      <div style="margin: 10px 0;">
        <span style="color: #9ca3af; text-decoration: line-through; font-size: 18px;">${currency} ${oldPrice}</span>
        <span style="color: #dc2626; font-weight: 900; font-size: 28px; margin-left: 10px;">${currency} ${newPrice}</span>
      </div>
      <p style="margin: 5px 0 0 0; color: #dc2626; font-size: 18px; font-weight: 800;">
        Save ${discountPercent}% (${currency} ${(parseFloat(oldPrice) - parseFloat(newPrice)).toFixed(2)})
      </p>
    </div>
  `;
}

export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  
  // Ensure we extract the ID correctly from the Shopify payload
  const rawId = payload.inventory_item_id;
  const inventoryItemId = String(rawId).replace("gid://shopify/InventoryItem/", "");
  
  const available = payload.available !== undefined ? Number(payload.available) : 
                    (payload.available_adjustment !== undefined ? Number(payload.available_adjustment) : null);

  if (available === null) return new Response("No quantity data", { status: 200 });

  const settings = await prisma.appSettings.findUnique({ where: { shop: shop } }) || { 
    adminEmail: 'digittrix.savita@gmail.com', 
    subjectLine: 'Out of stock products reminder', 
    includeSku: true, 
    includeVendor: true, 
    includePrice: true,
    includeTags: true,
    countdownThreshold: 200,
    emailLimitPerRestock: 100,
    enablePriceDropAlerts: true,
    priceDropThreshold: 5 
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
            compareAtPrice
            product {
              title
              handle
              vendor
              featuredImage { url }
              tags
            }
          }
        }
        shop { 
          id
          currencyCode 
          name 
        }
      }
    `, {
      variables: {
        id: `gid://shopify/InventoryItem/${inventoryItemId}`
      }
    });

    const json = await response.json();
    
    // Handle GraphQL Errors explicitly
    if (json.errors) {
      console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
      return new Response("GraphQL Error", { status: 200 });
    }

    const inv = json.data?.inventoryItem;
    const variant = inv?.variant;
    if (!variant) {
      console.error("Variant not found for ID:", inventoryItemId);
      return new Response("Variant not found", { status: 200 });
    }

    const currency = json.data?.shop?.currencyCode || "USD";
    const shopName = json.data?.shop?.name;
    const productImg = variant.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl = `https://${shop}/products/${variant.product.handle}`;
    const currentPrice = parseFloat(variant.price);

    // --- CASE 1: BACK IN STOCK ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({ 
        where: { inventoryItemId: String(inventoryItemId), notified: false },
        orderBy: { createdAt: 'asc' }
      });

      if (subscribers.length === 0) return new Response("No subscribers to notify", { status: 200 });

      const emailLimit = settings.emailLimitPerRestock || 100;
      const subscribersToNotify = subscribers.slice(0, emailLimit);
      const skippedCount = subscribers.length - subscribersToNotify.length;

      let successCount = 0;
      let failCount = 0;
      let priceDropCount = 0;

      for (const sub of subscribersToNotify) {
        const currentStock = await getInventoryLevels(admin, inventoryItemId);
        const stockQuantity = currentStock !== null ? currentStock : available;
        
        const subscribedPrice = sub.priceAtSubscription ? parseFloat(sub.priceAtSubscription) : null;
        let hasPriceDrop = false;
        let discountPercent = 0;
        
        if (subscribedPrice && currentPrice < subscribedPrice && settings.enablePriceDropAlerts) {
          discountPercent = Math.round(((subscribedPrice - currentPrice) / subscribedPrice) * 100);
          hasPriceDrop = discountPercent >= (settings.priceDropThreshold || 5);
          if (hasPriceDrop) priceDropCount++;
        }

        const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        
        const countdownBadge = getCountdownBadge(stockQuantity, settings.countdownThreshold || 200);
        const priceDropBadge = hasPriceDrop ? getPriceDropBadge(subscribedPrice, currentPrice, currency, discountPercent) : '';

        const isComboAlert = hasPriceDrop && stockQuantity <= (settings.countdownThreshold || 200);
        const headerText = isComboAlert ? '🎉🔥 Back In Stock + Price Drop!' : 
                          hasPriceDrop ? '🔥 Back In Stock at Lower Price!' : 
                          '🎉 Back In Stock!';
        const headerColor = isComboAlert || hasPriceDrop ? '#dc2626' : '#111827';

        const customerHtml = `
          <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
            <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding: 40px; text-align: center; background: ${isComboAlert ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : '#ffffff'};">
                <h1 style="color: ${headerColor}; font-size: 28px; font-weight: 800; margin: 0;">${headerText}</h1>
                <p style="color: #6b7280; margin: 10px 0;">Available now at <strong>${shopName}</strong>.</p>
              </td></tr>
              <tr><td style="padding: 0 40px; text-align: center;">
                <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px;">
                  <img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;" alt="${variant.product.title}">
                  <h2 style="color: #111827; margin: 15px 0;">${variant.product.title}</h2>
                  <p style="color: #6b7280; margin: 10px 0;">${variant.displayName}</p>
                  ${priceDropBadge}
                  ${!hasPriceDrop && settings.includePrice ? `<p style="font-size: 24px; font-weight: 900; color: #4f46e5; margin: 15px 0;">${currency} ${variant.price}</p>` : ''}
                  ${countdownBadge}
                  <a href="${clickUrl}" style="display: inline-block; background-color: ${hasPriceDrop ? '#dc2626' : '#111827'}; color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold; margin-top: 10px;">
                    ${isComboAlert ? '🔥 Grab This Deal Now!' : 'Buy Now'}
                  </a>
                </div>
              </td></tr>
              <tr><td style="padding: 30px; text-align: center;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">You're receiving this because you subscribed to alerts.</p>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" alt="" />
          </div>
        `;

        let subjectLine = isComboAlert ? `🔥 DEAL: ${variant.product.title} - ${discountPercent}% OFF!` : `🎉 Back in Stock: ${variant.product.title}`;

        const sent = await sendEmail({
          from: `${shopName} <onboarding@resend.dev>`,
          to: sub.email,
          subject: subjectLine,
          html: customerHtml
        });
        
        if (sent) {
          await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true, notifiedAt: new Date() } });
          successCount++;
        } else {
          failCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Admin Summary Email logic
      if (successCount > 0) {
        const adminSummaryHtml = `<div style="font-family: sans-serif; padding: 20px;"><h2>Notifications Sent</h2><p>Product: ${variant.product.title}</p><p>Sent: ${successCount}</p></div>`;
        await sendEmail({
          from: 'Inventory Manager <onboarding@resend.dev>',
          to: settings.adminEmail,
          subject: `✅ Notifications Sent - ${variant.product.title}`,
          html: adminSummaryHtml
        });
      }

      return new Response(JSON.stringify({ success: true, sent: successCount }), { status: 200 });
    } 
    
    // --- CASE 2: OUT OF STOCK ---
    else {
      const pendingSubscribers = await prisma.backInStock.count({
        where: { inventoryItemId: String(inventoryItemId), notified: false }
      });

      const adminHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #fffafb; border: 1px solid #fee2e2; border-radius: 16px; max-width: 500px; margin: 20px auto;">
          <h2 style="color: #991b1b; font-size: 20px; margin: 0;">🚨 ${settings.subjectLine || 'Inventory Alert'}</h2>
          <div style="background-color: #ffffff; border-radius: 12px; padding: 20px; border: 1px solid #fecaca; margin-top: 15px;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            <p><strong>Variant:</strong> ${variant.displayName}</p>
            <p><strong>Waiting:</strong> ${pendingSubscribers} customers</p>
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
    console.error("Webhook Error Catch:", err);
    return new Response("Error", { status: 200 }); // Return 200 to prevent Shopify from retrying failing webhooks indefinitely
  }
}