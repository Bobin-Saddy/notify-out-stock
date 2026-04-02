// File: app/routes/webhooks.inventory-update.jsx
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

    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("❌ Resend API Error:", JSON.stringify(resBody));
    } else {
      console.log("✅ Resend accepted email, id:", resBody.id);
    }

    return res.ok;
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return false;
  }
}

// Get live inventory from Shopify
async function getLiveInventory(admin, inventoryItemId) {
  try {
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          inventoryLevels(first: 1) {
            edges { node { available } }
          }
        }
      }
    `);
    const json = await response.json();
    return json.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.available ?? 0;
  } catch (err) {
    console.error("❌ Error fetching live inventory:", err.message);
    return null;
  }
}

// Countdown badge — shown only when stock is low
function getCountdownBadge(quantity, threshold = 200) {
  if (quantity === null || quantity > threshold) return '';
  const color   = quantity <= 3 ? '#dc2626' : quantity <= 7 ? '#f59e0b' : '#10b981';
  const urgency = quantity <= 3 ? 'Only' : 'Just';
  return `
    <div style="background:linear-gradient(135deg,${color}22,${color}44);border:2px solid ${color};border-radius:12px;padding:12px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0;color:${color};font-weight:800;font-size:18px;">⚡ ${urgency} <span style="font-size:24px;">${quantity}</span> Left in Stock!</p>
      <p style="margin:5px 0 0;color:#6b7280;font-size:14px;">Hurry before it sells out again</p>
    </div>`;
}

// Price drop badge
function getPriceDropBadge(oldPrice, newPrice, currency, percentageOff) {
  return `
    <div style="background:linear-gradient(135deg,#10b98122,#10b98144);border:2px solid #10b981;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0;color:#10b981;font-weight:800;font-size:20px;">💰 Price Drop Alert!</p>
      <div style="margin-top:10px;">
        <span style="color:#9ca3af;font-size:16px;text-decoration:line-through;">${currency} ${oldPrice}</span>
        <span style="color:#111827;font-size:28px;font-weight:900;margin-left:10px;">${currency} ${newPrice}</span>
      </div>
      <p style="margin:10px 0 0;color:#10b981;font-size:16px;font-weight:bold;">Save ${percentageOff}% - Limited Time!</p>
    </div>`;
}

export async function action({ request }) {
  try {
    const { payload, shop, admin } = await authenticate.webhook(request);
    const inventoryItemId = String(payload.inventory_item_id);

    console.log("📦 Inventory Webhook received:", {
      inventoryItemId,
      available: payload.available,
      shop
    });

    const available = payload.available !== undefined
      ? Number(payload.available)
      : (payload.available_adjustment !== undefined
          ? Number(payload.available_adjustment)
          : null);

    if (available === null) {
      console.log("⚠️ No quantity data in payload — skipping");
      return new Response("No quantity data", { status: 200 });
    }

    // Load settings with safe defaults
    const settings = await prisma.appSettings.findUnique({ where: { shop } }) ?? {
      adminEmail:         process.env.ADMIN_EMAIL || 'admin@example.com',
      subjectLine:        'Out of stock products reminder',
      includeSku:         true,
      includeVendor:      true,
      includePrice:       true,
      countdownThreshold: 200
    };

    let APP_URL = process.env.SHOPIFY_APP_URL || "";
    if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

    // Fetch variant + product info from Shopify
    console.log("🔍 Querying Shopify for inventoryItemId:", inventoryItemId);
    const gqlResponse = await admin.graphql(`
      query getInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          sku
          variant {
            id
            displayName
            price
            product {
              id
              title
              handle
              vendor
              featuredImage { url }
              tags
            }
          }
        }
        shop {
          currencyCode
          name
        }
      }
    `, {
      variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` }
    });

    const gqlJson = await gqlResponse.json();

    if (gqlJson.errors) {
      console.error("❌ GraphQL Errors:", JSON.stringify(gqlJson.errors, null, 2));
      return new Response("GraphQL Error", { status: 200 });
    }

    const inv     = gqlJson.data?.inventoryItem;
    const variant = inv?.variant;

    if (!variant) {
      console.log("⚠️ Variant not found for inventoryItem:", inventoryItemId);
      return new Response("Variant not found", { status: 200 });
    }

    // Clean numeric variantId for DB query fallback
    const variantIdClean = variant.id?.split('/').pop(); // "gid://shopify/ProductVariant/123" → "123"

    const currency     = gqlJson.data?.shop?.currencyCode || "USD";
    const shopName     = gqlJson.data?.shop?.name || shop;
    const productImg   = variant.product.featuredImage?.url
      || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl   = `https://${shop}/products/${variant.product.handle}`;
    const currentPrice = parseFloat(variant.price);

    console.log("✅ Product found:", variant.product.title, "| variantId:", variantIdClean, "| available:", available);

    // ============================================================
    // CASE 1: BACK IN STOCK (available > 0)
    // ============================================================
    if (available > 0) {
      console.log(`🟢 Product restocked (qty: ${available})`);

      // ✅ Match by BOTH inventoryItemId AND variantId
      // Handles subscribers where inventoryItemId was null at subscribe time
      const allSubscribers = await prisma.backInStock.findMany({
        where: {
          shop,
          OR: [
            { inventoryItemId: inventoryItemId },
            ...(variantIdClean ? [{ variantId: variantIdClean }] : [])
          ]
        }
      });

      console.log(`👥 Total subscribers for this product: ${allSubscribers.length}`);

      // ✅ Only send to pending (notified: false)
      const pendingSubscribers = allSubscribers.filter(s => !s.notified);
      console.log(`📧 Pending subscribers to notify: ${pendingSubscribers.length}`);

      if (pendingSubscribers.length === 0) {
        console.log("ℹ️ No pending subscribers — all already notified or none exist");
      }

      // Get live stock once for all emails
      const liveStock    = await getLiveInventory(admin, inventoryItemId);
      const stockDisplay = liveStock !== null ? liveStock : available;

      // Send back-in-stock emails
      for (const sub of pendingSubscribers) {
        const openUrl        = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl       = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        const countdownBadge = getCountdownBadge(stockDisplay, settings.countdownThreshold || 200);

        const html = `
          <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
            <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding:40px;text-align:center;">
                <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">🎉 Back In Stock!</h1>
                <p style="color:#6b7280;margin:10px 0 0;">Good news! <strong>${variant.product.title}</strong> is now available at <strong>${shopName}</strong>.</p>
              </td></tr>
              <tr><td style="padding:0 40px 40px;text-align:center;">
                <div style="background:#f9fafb;border-radius:20px;padding:30px;">
                  <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${variant.product.title}">
                  <h2 style="color:#111827;margin:0 0 8px;">${variant.product.title}</h2>
                  <p style="color:#6b7280;margin:0 0 12px;">${variant.displayName}</p>
                  ${settings.includePrice ? `<p style="font-size:24px;font-weight:900;color:#4f46e5;margin:0 0 16px;">${currency} ${variant.price}</p>` : ''}
                  ${countdownBadge}
                  <a href="${clickUrl}" style="display:inline-block;background:#111827;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">
                    Buy Now
                  </a>
                </div>
              </td></tr>
              <tr><td style="padding:0 40px 30px;text-align:center;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">
                  You're receiving this because you subscribed to back-in-stock alerts.
                </p>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" alt="">
          </div>`;

        const sent = await sendEmail({
          from:    `${shopName} <onboarding@resend.dev>`,
          to:      sub.email,
          subject: `🎉 Back in Stock: ${variant.product.title}${stockDisplay <= 5 ? ' — Limited Quantity!' : ''}`,
          html
        });

        if (sent) {
          console.log(`✅ Back-in-stock email sent to ${sub.email}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: {
              notified:        true,
              subscribedPrice: sub.subscribedPrice ?? currentPrice
            }
          });
        } else {
          console.log(`❌ Failed to send to ${sub.email}`);
        }
      }

      // ─── Price Drop Check for already-notified subscribers ───
      const notifiedSubscribers = allSubscribers.filter(s => s.notified);
      console.log(`💰 Checking price drops for ${notifiedSubscribers.length} already-notified subscribers`);

      for (const sub of notifiedSubscribers) {
        if (!sub.subscribedPrice || sub.subscribedPrice === 0) continue;
        if (currentPrice >= sub.subscribedPrice) continue;

        const percentageOff = Math.round(((sub.subscribedPrice - currentPrice) / sub.subscribedPrice) * 100);
        if (percentageOff < 5) continue;

        console.log(`💰 Price drop for ${sub.email}: ${sub.subscribedPrice} → ${currentPrice} (${percentageOff}%)`);

        const openUrl  = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        const badge    = getPriceDropBadge(
          sub.subscribedPrice.toFixed(2),
          currentPrice.toFixed(2),
          currency,
          percentageOff
        );

        const html = `
          <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
            <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding:40px;text-align:center;">
                <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">💰 Price Drop Alert!</h1>
                <p style="color:#6b7280;margin:10px 0 0;">The price just dropped on <strong>${shopName}</strong>.</p>
              </td></tr>
              <tr><td style="padding:0 40px 40px;text-align:center;">
                <div style="background:#f9fafb;border-radius:20px;padding:30px;">
                  <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${variant.product.title}">
                  <h2 style="color:#111827;margin:0 0 8px;">${variant.product.title}</h2>
                  <p style="color:#6b7280;margin:0 0 12px;">${variant.displayName}</p>
                  ${badge}
                  <a href="${clickUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">
                    Shop Now &amp; Save
                  </a>
                </div>
              </td></tr>
              <tr><td style="padding:0 40px 30px;text-align:center;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">
                  You're receiving this because you subscribed to alerts for this product.
                </p>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" alt="">
          </div>`;

        const sent = await sendEmail({
          from:    `${shopName} <onboarding@resend.dev>`,
          to:      sub.email,
          subject: `💰 Price Drop: ${variant.product.title} — Save ${percentageOff}%!`,
          html
        });

        if (sent) {
          console.log(`✅ Price drop email sent to ${sub.email}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data:  { subscribedPrice: currentPrice }
          });
        } else {
          console.log(`❌ Failed to send price drop email to ${sub.email}`);
        }
      }
    }

    // ============================================================
    // CASE 2: OUT OF STOCK (available <= 0)
    // ============================================================
    else {
      console.log("🔴 Product went out of stock");

      // ✅ KEY FIX: Reset notified = false for ALL subscribers
      // Next restock → everyone gets notified again
      const resetResult = await prisma.backInStock.updateMany({
        where: {
          shop,
          OR: [
            { inventoryItemId: inventoryItemId },
            ...(variantIdClean ? [{ variantId: variantIdClean }] : [])
          ]
        },
        data: { notified: false }
      });
      console.log(`🔄 Reset notified=false for ${resetResult.count} subscribers (ready for next restock)`);

      // Send admin out-of-stock alert
      console.log("📧 Sending out-of-stock alert to admin:", settings.adminEmail);

      const adminHtml = `
        <div style="font-family:sans-serif;padding:30px;background:#fffafb;border:1px solid #fee2e2;border-radius:16px;max-width:500px;margin:20px auto;">
          <h2 style="color:#991b1b;font-size:20px;">🚨 ${settings.subjectLine || 'Inventory Alert'}</h2>
          <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #fecaca;margin-top:15px;">
            <p style="margin:8px 0;"><strong>Product:</strong> ${variant.product.title}</p>
            <p style="margin:8px 0;"><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku    ? `<p style="margin:8px 0;"><strong>SKU:</strong> ${inv.sku || 'N/A'}</p>` : ''}
            ${settings.includeVendor ? `<p style="margin:8px 0;"><strong>Vendor:</strong> ${variant.product.vendor || 'N/A'}</p>` : ''}
            ${settings.includePrice  ? `<p style="margin:8px 0;"><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
          </div>
          <div style="margin-top:25px;text-align:center;">
            <a href="https://${shop}/admin/products" style="background:#111827;color:#fff;padding:12px 25px;border-radius:10px;text-decoration:none;font-weight:bold;">
              Manage Inventory
            </a>
          </div>
        </div>`;

      const sent = await sendEmail({
        from:    'Inventory Manager <onboarding@resend.dev>',
        to:      settings.adminEmail,
        subject: `🚨 Stock Out: ${variant.product.title}`,
        html:    adminHtml
      });

      console.log(sent ? "✅ Admin alert sent" : "❌ Admin alert failed");
    }

    console.log("✅ Webhook processed successfully");
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    console.error(err.stack);
    return new Response("Error", { status: 500 });
  }
}