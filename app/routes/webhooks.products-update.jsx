import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

function getPriceDropBadge(oldPrice, newPrice, currency, percentageOff) {
  return `
    <div style="background: linear-gradient(135deg, #10b98122 0%, #10b98144 100%); 
                border: 2px solid #10b981; 
                border-radius: 12px; 
                padding: 16px 20px; 
                margin: 20px 0;
                text-align: center;">
      <p style="margin: 0; color: #10b981; font-weight: 800; font-size: 20px;">
        💰 Price Drop Alert!
      </p>
      <div style="margin-top: 10px;">
        <span style="color: #9ca3af; font-size: 16px; text-decoration: line-through;">${currency} ${oldPrice}</span>
        <span style="color: #111827; font-size: 28px; font-weight: 900; margin-left: 10px;">${currency} ${newPrice}</span>
      </div>
      <p style="margin: 10px 0 0 0; color: #10b981; font-size: 16px; font-weight: bold;">
        Save ${percentageOff}% - Limited Time!
      </p>
    </div>
  `;
}

export async function action({ request }) {
  try {
    const { payload, shop, admin } = await authenticate.webhook(request);
    
    console.log("💰 Product Update Webhook received for shop:", shop);
    
    const settings = await prisma.appSettings.findUnique({ where: { shop } }) || {
      enablePriceDropAlerts: true,
      priceDropThreshold: 5
    };

    if (!settings.enablePriceDropAlerts) {
      console.log("⚠️ Price drop alerts disabled");
      return new Response("Price drop alerts disabled", { status: 200 });
    }

    let APP_URL = process.env.SHOPIFY_APP_URL || "";
    if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

    const product = payload;
    const variants = product.variants || [];

    console.log(`📦 Product: ${product.title}, Variants: ${variants.length}`);

    for (const variant of variants) {
      const variantId = String(variant.id);
      const inventoryItemId = String(variant.inventory_item_id);
      const currentPrice = parseFloat(variant.price);

      console.log(`🔍 Variant ${variantId}, Price: ${currentPrice}`);

      // Find ALL subscribers for this variant (both notified and not notified)
      // This ensures price drop emails work even for out-of-stock products
      const subscribers = await prisma.backInStock.findMany({
        where: {
          shop: shop,
          OR: [
            { inventoryItemId: inventoryItemId },
            { variantId: variantId }
          ]
        }
      });

      console.log(`👥 ${subscribers.length} subscribers found for this variant`);

   for (const sub of subscribers) {
  const subscribedPrice = sub.subscribedPrice;

  if (!subscribedPrice || subscribedPrice === 0) {
    await prisma.backInStock.update({
      where: { id: sub.id },
      data: { subscribedPrice: currentPrice }
    });
    continue;
  }

  if (currentPrice < subscribedPrice) {
    const percentageOff = Math.round(((subscribedPrice - currentPrice) / subscribedPrice) * 100);

    if (percentageOff >= (settings.priceDropThreshold || 5)) {
      try {
        // ✅ Subscriber ki language resolve karo
        const SUPPORTED_LANGS = ['en', 'hi', 'fr', 'de', 'es', 'ar', 'zh', 'ja'];
        const rawLang = typeof sub.language === 'string' ? sub.language.trim().toLowerCase() : '';
        const lang = SUPPORTED_LANGS.includes(rawLang) ? rawLang : 'en';
        const t = getT(lang);

        console.log(`💰 [${lang.toUpperCase()}] Price drop ${percentageOff}% → ${sub.email}`);

        const query = `
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              displayName price inventoryQuantity
              product { title handle featuredImage { url } }
            }
            shop { currencyCode name }
          }
        `;

        const response = await admin.graphql(query, {
          variables: { id: `gid://shopify/ProductVariant/${variantId}` }
        });

        const json = await response.json();
        if (json.errors) { console.error("❌ GraphQL Error:", json.errors); continue; }

        const variantData = json.data?.productVariant;
        if (!variantData) continue;

        const currency  = json.data?.shop?.currencyCode || "USD";
        const shopName  = json.data?.shop?.name || shop;
        const productImg = variantData.product.featuredImage?.url
          || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
        const productUrl = `https://${shop}/products/${variantData.product.handle}`;
        const inventoryQty = variantData.inventoryQuantity || 0;

        const openUrl  = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;

        // ✅ Language-aware badge
        const priceDropBadge = `
          <div style="background:linear-gradient(135deg,#10b98122,#10b98144);border:2px solid #10b981;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
            <p style="margin:0;color:#10b981;font-weight:800;font-size:20px;">${t.priceDropHead}</p>
            <div style="margin-top:10px;">
              <span style="color:#9ca3af;font-size:16px;text-decoration:line-through;">${currency} ${subscribedPrice.toFixed(2)}</span>
              <span style="color:#111827;font-size:28px;font-weight:900;margin-left:10px;">${currency} ${currentPrice.toFixed(2)}</span>
            </div>
            <p style="margin:10px 0 0;color:#10b981;font-size:16px;font-weight:bold;">${t.priceDropSave(percentageOff)}</p>
          </div>`;

        const html = `
          <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
            <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
              <tr><td style="padding:40px;text-align:center;">
                <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">${t.priceDropHead}</h1>
                <p style="color:#6b7280;margin:10px 0 0;">The price just dropped on <strong>${shopName}</strong>.</p>
              </td></tr>
              <tr><td style="padding:0 40px 40px;text-align:center;">
                <div style="background:#f9fafb;border-radius:20px;padding:30px;">
                  <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${variantData.product.title}">
                  <h2 style="color:#111827;margin:0 0 8px;">${variantData.product.title}</h2>
                  <p style="color:#6b7280;margin:0 0 12px;">${variantData.displayName}</p>
                  ${priceDropBadge}
                  <a href="${clickUrl}" style="display:inline-block;background:${inventoryQty > 0 ? '#10b981' : '#6b7280'};color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">
                    ${inventoryQty > 0 ? t.priceDropCta : 'View Product'}
                  </a>
                </div>
              </td></tr>
              <tr><td style="padding:0 40px 30px;text-align:center;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">${t.footer}</p>
              </td></tr>
            </table>
            <img src="${openUrl}" width="1" height="1" style="display:none;" alt="">
          </div>`;

        const sent = await sendEmail({
          from:    `${shopName} <onboarding@resend.dev>`,
          to:      sub.email,
          subject: `💰 ${variantData.product.title} — ${percentageOff}% OFF`,
          html
        });

        if (sent) {
          console.log(`✅ [${lang.toUpperCase()}] Price drop email → ${sub.email}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data:  { subscribedPrice: currentPrice }
          });
        }
      } catch (err) {
        console.error(`❌ Error processing subscriber ${sub.id}:`, err);
      }
    }
  } else if (currentPrice > subscribedPrice) {
    await prisma.backInStock.update({
      where: { id: sub.id },
      data:  { subscribedPrice: currentPrice }
    });
  }
}
    }

    console.log("✅ Product update webhook processed successfully");
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("❌ Product Update Webhook Error:", err);
    console.error("Error stack:", err.stack);
    return new Response("Error", { status: 500 });
  }
}