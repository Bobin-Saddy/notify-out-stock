// File: app/routes/webhooks.inventory-update.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// ─── Email translations ───────────────────────────────────────
const EMAIL_TRANSLATIONS = {
  en: {
    subject:       (title, limited) => `🎉 Back in Stock: ${title}${limited ? ' — Limited Quantity!' : ''}`,
    heading:       '🎉 Back In Stock!',
    intro:         (title, shop) => `Good news! <strong>${title}</strong> is now available at <strong>${shop}</strong>.`,
    cta:           'Buy Now',
    footer:        "You're receiving this because you subscribed to back-in-stock alerts.",
    urgencyOnly:   'Only', urgencyJust: 'Just', urgencyLeft: 'Left in Stock!',
    urgencyHurry:  'Hurry before it sells out again',
    priceDropHead: '💰 Price Drop Alert!',
    priceDropSave: (pct) => `Save ${pct}% - Limited Time!`,
    priceDropCta:  'Shop Now & Save',
  },
  hi: {
    subject:       (title, limited) => `🎉 वापस स्टॉक में: ${title}${limited ? ' — सीमित मात्रा!' : ''}`,
    heading:       '🎉 वापस स्टॉक में!',
    intro:         (title, shop) => `अच्छी खबर! <strong>${title}</strong> अब <strong>${shop}</strong> पर उपलब्ध है।`,
    cta:           'अभी खरीदें',
    footer:        'आपको यह इसलिए मिल रहा है क्योंकि आपने स्टॉक अलर्ट के लिए सदस्यता ली थी।',
    urgencyOnly:   'केवल', urgencyJust: 'सिर्फ', urgencyLeft: 'बचे हैं!',
    urgencyHurry:  'जल्दी करें, फिर से बिकने से पहले!',
    priceDropHead: '💰 मूल्य में गिरावट!',
    priceDropSave: (pct) => `${pct}% बचाएं - सीमित समय!`,
    priceDropCta:  'अभी खरीदें और बचाएं',
  },
  fr: {
    subject:       (title, limited) => `🎉 De retour en stock : ${title}${limited ? ' — Quantité limitée !' : ''}`,
    heading:       '🎉 De Retour en Stock !',
    intro:         (title, shop) => `Bonne nouvelle ! <strong>${title}</strong> est maintenant disponible sur <strong>${shop}</strong>.`,
    cta:           'Acheter Maintenant',
    footer:        "Vous recevez ceci parce que vous vous êtes abonné aux alertes de réapprovisionnement.",
    urgencyOnly:   'Seulement', urgencyJust: 'Plus que', urgencyLeft: 'en stock !',
    urgencyHurry:  'Dépêchez-vous avant la rupture !',
    priceDropHead: '💰 Alerte Baisse de Prix !',
    priceDropSave: (pct) => `Économisez ${pct}% - Temps limité !`,
    priceDropCta:  'Achetez et Économisez',
  },
  de: {
    subject:       (title, limited) => `🎉 Wieder verfügbar: ${title}${limited ? ' — Begrenzte Menge!' : ''}`,
    heading:       '🎉 Wieder Verfügbar!',
    intro:         (title, shop) => `Gute Neuigkeiten! <strong>${title}</strong> ist jetzt bei <strong>${shop}</strong> verfügbar.`,
    cta:           'Jetzt Kaufen',
    footer:        "Sie erhalten dies, weil Sie Benachrichtigungen abonniert haben.",
    urgencyOnly:   'Nur noch', urgencyJust: 'Nur', urgencyLeft: 'auf Lager!',
    urgencyHurry:  'Beeilen Sie sich, bevor es ausverkauft ist!',
    priceDropHead: '💰 Preissenkung!',
    priceDropSave: (pct) => `${pct}% sparen - Begrenzte Zeit!`,
    priceDropCta:  'Jetzt kaufen & sparen',
  },
  es: {
    subject:       (title, limited) => `🎉 De vuelta en stock: ${title}${limited ? ' — ¡Cantidad limitada!' : ''}`,
    heading:       '🎉 ¡De Vuelta en Stock!',
    intro:         (title, shop) => `¡Buenas noticias! <strong>${title}</strong> ya está disponible en <strong>${shop}</strong>.`,
    cta:           'Comprar Ahora',
    footer:        "Recibes esto porque te suscribiste a las alertas de reposición.",
    urgencyOnly:   'Solo', urgencyJust: 'Solo', urgencyLeft: '¡en stock!',
    urgencyHurry:  '¡Date prisa antes de que se agote!',
    priceDropHead: '💰 ¡Alerta de Bajada de Precio!',
    priceDropSave: (pct) => `¡Ahorra ${pct}% - Tiempo limitado!`,
    priceDropCta:  'Compra y Ahorra',
  },
  ar: {
    subject:       (title, limited) => `🎉 عاد إلى المخزون: ${title}${limited ? ' — كمية محدودة!' : ''}`,
    heading:       '🎉 عاد إلى المخزون!',
    intro:         (title, shop) => `أخبار رائعة! <strong>${title}</strong> متاح الآن في <strong>${shop}</strong>.`,
    cta:           'اشترِ الآن',
    footer:        "تلقيت هذا لأنك اشتركت في تنبيهات إعادة التخزين.",
    urgencyOnly:   'فقط', urgencyJust: 'فقط', urgencyLeft: 'في المخزون!',
    urgencyHurry:  'أسرع قبل نفاد المخزون!',
    priceDropHead: '💰 تنبيه انخفاض السعر!',
    priceDropSave: (pct) => `وفر ${pct}% - لفترة محدودة!`,
    priceDropCta:  'تسوق الآن ووفّر',
  },
  zh: {
    subject:       (title, limited) => `🎉 已补货：${title}${limited ? ' — 数量有限！' : ''}`,
    heading:       '🎉 已补货！',
    intro:         (title, shop) => `好消息！<strong>${title}</strong> 现在已在 <strong>${shop}</strong> 上架。`,
    cta:           '立即购买',
    footer:        "您收到此邮件是因为您订阅了补货提醒。",
    urgencyOnly:   '仅剩', urgencyJust: '仅剩', urgencyLeft: '件！',
    urgencyHurry:  '快抢，售完为止！',
    priceDropHead: '💰 降价提醒！',
    priceDropSave: (pct) => `节省 ${pct}% — 限时优惠！`,
    priceDropCta:  '立即抢购省钱',
  },
  ja: {
    subject:       (title, limited) => `🎉 在庫復活：${title}${limited ? ' — 数量限定！' : ''}`,
    heading:       '🎉 在庫が復活しました！',
    intro:         (title, shop) => `嬉しいお知らせです！<strong>${title}</strong> が <strong>${shop}</strong> で再入荷しました。`,
    cta:           '今すぐ購入',
    footer:        "このメールは在庫復活通知にご登録いただいたためお送りしています。",
    urgencyOnly:   'あと', urgencyJust: 'あと', urgencyLeft: '点のみ！',
    urgencyHurry:  'お早めに！売り切れる前に！',
    priceDropHead: '💰 値下げのお知らせ！',
    priceDropSave: (pct) => `${pct}% OFF — 期間限定！`,
    priceDropCta:  '今すぐお得に購入',
  }
};

function getT(lang) {
  return EMAIL_TRANSLATIONS[lang] || EMAIL_TRANSLATIONS['en'];
}

// ─── Email sender ─────────────────────────────────────────────
async function sendEmail(emailData) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(emailData)
    });
    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) console.error("❌ Resend Error:", JSON.stringify(resBody));
    else         console.log("✅ Resend accepted:", resBody.id);
    return res.ok;
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return false;
  }
}

// ─── getLiveInventory — uses quantities(names:["available"]) ──
async function getLiveInventory(admin, inventoryItemId) {
  try {
    const response = await admin.graphql(`
      query getLiveStock($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 5) {
            edges {
              node {
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    `, {
      variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` }
    });

    const json = await response.json();

    if (json.errors) {
      console.error("❌ getLiveInventory GraphQL error:", JSON.stringify(json.errors));
      return null;
    }

    const levels = json.data?.inventoryItem?.inventoryLevels?.edges || [];
    let totalAvailable = 0;

    for (const edge of levels) {
      const quantities = edge.node?.quantities || [];
      for (const q of quantities) {
        if (q.name === 'available') {
          totalAvailable += q.quantity || 0;
        }
      }
    }

    console.log(`📦 Live inventory total available: ${totalAvailable}`);
    return totalAvailable;

  } catch (err) {
    console.error("❌ getLiveInventory error:", err.message);
    return null;
  }
}

// ─── Countdown badge ──────────────────────────────────────────
function getCountdownBadge(quantity, t, threshold = 200) {
  if (quantity === null || quantity > threshold) return '';
  const color   = quantity <= 3 ? '#dc2626' : quantity <= 7 ? '#f59e0b' : '#10b981';
  const urgency = quantity <= 3 ? t.urgencyOnly : t.urgencyJust;
  return `
    <div style="background:linear-gradient(135deg,${color}22,${color}44);border:2px solid ${color};border-radius:12px;padding:12px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0;color:${color};font-weight:800;font-size:18px;">⚡ ${urgency} <span style="font-size:24px;">${quantity}</span> ${t.urgencyLeft}</p>
      <p style="margin:5px 0 0;color:#6b7280;font-size:14px;">${t.urgencyHurry}</p>
    </div>`;
}

// ─── Price drop badge ─────────────────────────────────────────
function getPriceDropBadge(oldPrice, newPrice, currency, pct, t) {
  return `
    <div style="background:linear-gradient(135deg,#10b98122,#10b98144);border:2px solid #10b981;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0;color:#10b981;font-weight:800;font-size:20px;">${t.priceDropHead}</p>
      <div style="margin-top:10px;">
        <span style="color:#9ca3af;font-size:16px;text-decoration:line-through;">${currency} ${oldPrice}</span>
        <span style="color:#111827;font-size:28px;font-weight:900;margin-left:10px;">${currency} ${newPrice}</span>
      </div>
      <p style="margin:10px 0 0;color:#10b981;font-size:16px;font-weight:bold;">${t.priceDropSave(pct)}</p>
    </div>`;
}

// ─── Build back-in-stock email ────────────────────────────────
function buildBackInStockHtml({ productTitle, displayName, productImg, currency, price, clickUrl, openUrl, countdownBadge, shopName, includePrice, t }) {
  return `
    <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
      <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
        <tr><td style="padding:40px;text-align:center;">
          <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">${t.heading}</h1>
          <p style="color:#6b7280;margin:10px 0 0;">${t.intro(productTitle, shopName)}</p>
        </td></tr>
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <div style="background:#f9fafb;border-radius:20px;padding:30px;">
            <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${productTitle}">
            <h2 style="color:#111827;margin:0 0 8px;">${productTitle}</h2>
            <p style="color:#6b7280;margin:0 0 12px;">${displayName}</p>
            ${includePrice ? `<p style="font-size:24px;font-weight:900;color:#4f46e5;margin:0 0 16px;">${currency} ${price}</p>` : ''}
            ${countdownBadge}
            <a href="${clickUrl}" style="display:inline-block;background:#111827;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">${t.cta}</a>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 30px;text-align:center;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">${t.footer}</p>
        </td></tr>
      </table>
      <img src="${openUrl}" width="1" height="1" style="display:none;" alt="">
    </div>`;
}

// ─── Build price drop email ───────────────────────────────────
function buildPriceDropHtml({ productTitle, displayName, productImg, clickUrl, openUrl, priceDropBadge, shopName, t }) {
  return `
    <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
      <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
        <tr><td style="padding:40px;text-align:center;">
          <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">${t.priceDropHead}</h1>
          <p style="color:#6b7280;margin:10px 0 0;">The price just dropped on <strong>${shopName}</strong>.</p>
        </td></tr>
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <div style="background:#f9fafb;border-radius:20px;padding:30px;">
            <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${productTitle}">
            <h2 style="color:#111827;margin:0 0 8px;">${productTitle}</h2>
            <p style="color:#6b7280;margin:0 0 12px;">${displayName}</p>
            ${priceDropBadge}
            <a href="${clickUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">${t.priceDropCta}</a>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 30px;text-align:center;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">${t.footer}</p>
        </td></tr>
      </table>
      <img src="${openUrl}" width="1" height="1" style="display:none;" alt="">
    </div>`;
}

// ─── Main webhook action ──────────────────────────────────────
export async function action({ request }) {
  try {
    const { payload, shop, admin } = await authenticate.webhook(request);
    const inventoryItemId = String(payload.inventory_item_id);

    console.log("📦 Inventory Webhook:", { inventoryItemId, available: payload.available, shop });

    const available = payload.available !== undefined
      ? Number(payload.available)
      : (payload.available_adjustment !== undefined ? Number(payload.available_adjustment) : null);

    if (available === null) {
      console.log("⚠️ No quantity data — skipping");
      return new Response("No quantity data", { status: 200 });
    }

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

    // Fetch variant + product info
    const gqlResponse = await admin.graphql(`
      query getInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          sku
          variant {
            id displayName price
            product { id title handle vendor featuredImage { url } tags }
          }
        }
        shop { currencyCode name }
      }
    `, { variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` } });

    const gqlJson = await gqlResponse.json();

    if (gqlJson.errors) {
      console.error("❌ GraphQL Errors:", JSON.stringify(gqlJson.errors));
      return new Response("GraphQL Error", { status: 200 });
    }

    const inv     = gqlJson.data?.inventoryItem;
    const variant = inv?.variant;

    if (!variant) {
      console.log("⚠️ Variant not found:", inventoryItemId);
      return new Response("Variant not found", { status: 200 });
    }

    const variantIdClean = variant.id?.split('/').pop();
    const currency       = gqlJson.data?.shop?.currencyCode || "USD";
    const shopName       = gqlJson.data?.shop?.name || shop;
    const productImg     = variant.product.featuredImage?.url
      || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
    const productUrl     = `https://${shop}/products/${variant.product.handle}`;
    const currentPrice   = parseFloat(variant.price);

    console.log(`✅ Product: ${variant.product.title} | variantId: ${variantIdClean} | available: ${available}`);

const subscriberWhere = {
  shop,
  OR: [
    { inventoryItemId: String(inventoryItemId) },
    { inventoryItemId: inventoryItemId },  // number match ke liye
    ...(variantIdClean ? [{ variantId: String(variantIdClean) }] : [])
  ]
};

    // ── CASE 1: BACK IN STOCK ──────────────────────────────────
    if (available > 0) {
      console.log(`🟢 Product restocked (qty: ${available})`);

      const allSubscribers = await prisma.backInStock.findMany({ where: subscriberWhere });
      const pending        = allSubscribers.filter(s => !s.notified);

      console.log(`👥 Total: ${allSubscribers.length} | Pending: ${pending.length}`);

      // ─── DEBUG: Log language for every subscriber ────────────
      console.log("🔍 ALL SUBSCRIBER LANGUAGES:");
      allSubscribers.forEach(s => {
        console.log(`   → id=${s.id} | email=${s.email} | language="${s.language}" (type: ${typeof s.language})`);
      });
      // ────────────────────────────────────────────────────────

      // getLiveInventory
      const liveStock    = await getLiveInventory(admin, inventoryItemId);
      const stockDisplay = liveStock !== null ? liveStock : available;

      console.log(`📊 Stock for countdown badge: ${stockDisplay}`);

      // Send back-in-stock emails to pending subscribers
      for (const sub of pending) {

        // ─── DEBUG: Exactly what language is being used ──────
        console.log(`🌐 Processing subscriber id=${sub.id} | DB language="${sub.language}" | typeof="${typeof sub.language}"`);
        const lang = sub.language || 'en';
        console.log(`🌐 Final lang used for email: "${lang}"`);
        // ────────────────────────────────────────────────────

        const t        = getT(lang);
        const openUrl  = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        const countdown = getCountdownBadge(stockDisplay, t, settings.countdownThreshold || 200);

        console.log(`📧 Sending [${lang.toUpperCase()}] back-in-stock email to ${sub.email}`);

        const html = buildBackInStockHtml({
          productTitle:   variant.product.title,
          displayName:    variant.displayName,
          productImg,
          currency,
          price:          variant.price,
          clickUrl,
          openUrl,
          countdownBadge: countdown,
          shopName,
          includePrice:   settings.includePrice !== false,
          t
        });

        const sent = await sendEmail({
          from:    `${shopName} <onboarding@resend.dev>`,
          to:      sub.email,
          subject: t.subject(variant.product.title, stockDisplay <= 5),
          html
        });

        if (sent) {
          console.log(`✅ [${lang.toUpperCase()}] Email sent → ${sub.email}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data:  { notified: true, subscribedPrice: sub.subscribedPrice ?? currentPrice }
          });
        } else {
          console.log(`❌ Failed → ${sub.email}`);
        }
      }

      // Price drop check for already-notified subscribers
      const notified = allSubscribers.filter(s => s.notified);
      for (const sub of notified) {
        if (!sub.subscribedPrice || currentPrice >= sub.subscribedPrice) continue;
        const pctOff = Math.round(((sub.subscribedPrice - currentPrice) / sub.subscribedPrice) * 100);
        if (pctOff < 5) continue;

        const lang     = sub.language || 'en';
        const t        = getT(lang);
        const openUrl  = `${APP_URL}api/track-open?id=${sub.id}`;
        const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
        const badge    = getPriceDropBadge(
          sub.subscribedPrice.toFixed(2), currentPrice.toFixed(2), currency, pctOff, t
        );

        console.log(`💰 [${lang.toUpperCase()}] Price drop ${pctOff}% → ${sub.email}`);

        const html = buildPriceDropHtml({
          productTitle: variant.product.title,
          displayName:  variant.displayName,
          productImg, clickUrl, openUrl,
          priceDropBadge: badge,
          shopName, t
        });

        const sent = await sendEmail({
          from:    `${shopName} <onboarding@resend.dev>`,
          to:      sub.email,
          subject: `💰 ${variant.product.title} — ${pctOff}% OFF`,
          html
        });

        if (sent) {
          console.log(`✅ [${lang.toUpperCase()}] Price drop email → ${sub.email}`);
          await prisma.backInStock.update({ where: { id: sub.id }, data: { subscribedPrice: currentPrice } });
        }
      }
    }

    // ── CASE 2: OUT OF STOCK ───────────────────────────────────
    else {
      console.log("🔴 Product went out of stock");

      const reset = await prisma.backInStock.updateMany({
        where: subscriberWhere,
        data:  { notified: false }
      });
      console.log(`🔄 Reset notified=false for ${reset.count} subscribers`);

      // Admin alert
      const adminHtml = `
        <div style="font-family:sans-serif;padding:30px;background:#fffafb;border:1px solid #fee2e2;border-radius:16px;max-width:500px;margin:20px auto;">
          <h2 style="color:#991b1b;">🚨 ${settings.subjectLine || 'Inventory Alert'}</h2>
          <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #fecaca;margin-top:15px;">
            <p><strong>Product:</strong> ${variant.product.title}</p>
            <p><strong>Variant:</strong> ${variant.displayName}</p>
            ${settings.includeSku    ? `<p><strong>SKU:</strong> ${inv.sku || 'N/A'}</p>` : ''}
            ${settings.includeVendor ? `<p><strong>Vendor:</strong> ${variant.product.vendor || 'N/A'}</p>` : ''}
            ${settings.includePrice  ? `<p><strong>Price:</strong> ${currency} ${variant.price}</p>` : ''}
          </div>
          <div style="margin-top:25px;text-align:center;">
            <a href="https://${shop}/admin/products" style="background:#111827;color:#fff;padding:12px 25px;border-radius:10px;text-decoration:none;font-weight:bold;">Manage Inventory</a>
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