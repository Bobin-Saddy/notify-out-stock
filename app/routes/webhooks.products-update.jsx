// File: app/routes/webhooks.product-update.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Supported languages ──────────────────────────────────────
const SUPPORTED_LANGS = ['en', 'hi', 'fr', 'de', 'es', 'ar', 'zh', 'ja'];

function resolveLang(raw) {
  const cleaned = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return SUPPORTED_LANGS.includes(cleaned) ? cleaned : 'en';
}

// ─── Email translations ───────────────────────────────────────
const EMAIL_TRANSLATIONS = {
  en: {
    footer:         "You're receiving this because you subscribed to alerts for this product.",
    priceDropHead:  '💰 Price Drop Alert!',
    priceDropSave:  (pct) => `Save ${pct}% - Limited Time!`,
    priceDropCta:   'Shop Now & Save',
    viewProduct:    'View Product',
    priceDropIntro: (shop) => `Great news! The price just dropped on ${shop}.`,
    outOfStockNote: "We'll notify you when it's back in stock at this great price!",
  },
  hi: {
    footer:         'आपको यह इसलिए मिल रहा है क्योंकि आपने इस उत्पाद के लिए अलर्ट की सदस्यता ली थी।',
    priceDropHead:  '💰 मूल्य में गिरावट!',
    priceDropSave:  (pct) => `${pct}% बचाएं - सीमित समय!`,
    priceDropCta:   'अभी खरीदें और बचाएं',
    viewProduct:    'उत्पाद देखें',
    priceDropIntro: (shop) => `अच्छी खबर! ${shop} पर कीमत गिर गई है।`,
    outOfStockNote: "जब यह वापस स्टॉक में आएगा तो हम आपको सूचित करेंगे!",
  },
  fr: {
    footer:         "Vous recevez ceci parce que vous vous êtes abonné aux alertes pour ce produit.",
    priceDropHead:  '💰 Alerte Baisse de Prix !',
    priceDropSave:  (pct) => `Économisez ${pct}% - Temps limité !`,
    priceDropCta:   'Achetez et Économisez',
    viewProduct:    'Voir le Produit',
    priceDropIntro: (shop) => `Bonne nouvelle ! Le prix vient de baisser sur ${shop}.`,
    outOfStockNote: "Nous vous notifierons quand il sera de retour en stock !",
  },
  de: {
    footer:         "Sie erhalten dies, weil Sie Benachrichtigungen für dieses Produkt abonniert haben.",
    priceDropHead:  '💰 Preissenkung!',
    priceDropSave:  (pct) => `${pct}% sparen - Begrenzte Zeit!`,
    priceDropCta:   'Jetzt kaufen & sparen',
    viewProduct:    'Produkt ansehen',
    priceDropIntro: (shop) => `Gute Neuigkeiten! Der Preis ist bei ${shop} gesunken.`,
    outOfStockNote: "Wir benachrichtigen Sie, wenn es wieder vorrätig ist!",
  },
  es: {
    footer:         "Recibes esto porque te suscribiste a las alertas de este producto.",
    priceDropHead:  '💰 ¡Alerta de Bajada de Precio!',
    priceDropSave:  (pct) => `¡Ahorra ${pct}% - Tiempo limitado!`,
    priceDropCta:   'Compra y Ahorra',
    viewProduct:    'Ver Producto',
    priceDropIntro: (shop) => `¡Buenas noticias! El precio acaba de bajar en ${shop}.`,
    outOfStockNote: "¡Te notificaremos cuando vuelva a estar en stock!",
  },
  ar: {
    footer:         "تلقيت هذا لأنك اشتركت في تنبيهات هذا المنتج.",
    priceDropHead:  '💰 تنبيه انخفاض السعر!',
    priceDropSave:  (pct) => `وفر ${pct}% - لفترة محدودة!`,
    priceDropCta:   'تسوق الآن ووفّر',
    viewProduct:    'عرض المنتج',
    priceDropIntro: (shop) => `أخبار رائعة! انخفض السعر في ${shop}.`,
    outOfStockNote: "سنخطرك عندما يعود إلى المخزون!",
  },
  zh: {
    footer:         "您收到此邮件是因为您订阅了此产品的提醒。",
    priceDropHead:  '💰 降价提醒！',
    priceDropSave:  (pct) => `节省 ${pct}% — 限时优惠！`,
    priceDropCta:   '立即抢购省钱',
    viewProduct:    '查看产品',
    priceDropIntro: (shop) => `好消息！${shop} 的价格刚刚下降了。`,
    outOfStockNote: "补货后我们将立即通知您！",
  },
  ja: {
    footer:         "このメールは商品アラートにご登録いただいたためお送りしています。",
    priceDropHead:  '💰 値下げのお知らせ！',
    priceDropSave:  (pct) => `${pct}% OFF — 期間限定！`,
    priceDropCta:   '今すぐお得に購入',
    viewProduct:    '商品を見る',
    priceDropIntro: (shop) => `嬉しいお知らせです！${shop} で価格が下がりました。`,
    outOfStockNote: "在庫が戻り次第お知らせします！",
  },
};

function getT(lang) {
  return EMAIL_TRANSLATIONS[resolveLang(lang)];
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
    console.error("❌ Email failed:", err.message);
    return false;
  }
}

// ─── Shopify se variant details fetch karo ────────────────────
async function fetchVariantDetails(admin, variantId) {
  const res  = await admin.graphql(`
    query getVariant($id: ID!) {
      productVariant(id: $id) {
        displayName price inventoryQuantity
        product { title handle featuredImage { url } }
      }
      shop { currencyCode name }
    }
  `, { variables: { id: `gid://shopify/ProductVariant/${variantId}` } });

  const json = await res.json();
  if (json.errors) {
    console.error("❌ GraphQL Error:", JSON.stringify(json.errors));
    return null;
  }
  return json.data;
}

// ─── Price drop email HTML ────────────────────────────────────
function buildPriceDropHtml({ t, shopName, productTitle, displayName, productImg, currency, subscribedPrice, currentPrice, percentageOff, inventoryQty, clickUrl, openUrl }) {
  const priceDropBadge = `
    <div style="background:linear-gradient(135deg,#10b98122,#10b98144);border:2px solid #10b981;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0;color:#10b981;font-weight:800;font-size:20px;">${t.priceDropHead}</p>
      <div style="margin-top:10px;">
        <span style="color:#9ca3af;font-size:16px;text-decoration:line-through;">${currency} ${subscribedPrice.toFixed(2)}</span>
        <span style="color:#111827;font-size:28px;font-weight:900;margin-left:10px;">${currency} ${currentPrice.toFixed(2)}</span>
      </div>
      <p style="margin:10px 0 0;color:#10b981;font-size:16px;font-weight:bold;">${t.priceDropSave(percentageOff)}</p>
    </div>`;

  return `
    <div style="background-color:#f3f4f6;padding:40px 0;font-family:sans-serif;">
      <table align="center" width="100%" style="max-width:550px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px rgba(0,0,0,0.1);">
        <tr><td style="padding:40px;text-align:center;">
          <h1 style="color:#111827;font-size:28px;font-weight:800;margin:0;">${t.priceDropHead}</h1>
          <p style="color:#6b7280;margin:10px 0 0;">${t.priceDropIntro(shopName)}</p>
        </td></tr>
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <div style="background:#f9fafb;border-radius:20px;padding:30px;">
            <img src="${productImg}" style="width:100%;max-width:250px;border-radius:12px;margin-bottom:20px;" alt="${productTitle}">
            <h2 style="color:#111827;margin:0 0 8px;">${productTitle}</h2>
            <p style="color:#6b7280;margin:0 0 12px;">${displayName}</p>
            ${priceDropBadge}
            <a href="${clickUrl}" style="display:inline-block;background:${inventoryQty > 0 ? '#10b981' : '#6b7280'};color:white;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:bold;margin-top:10px;">
              ${inventoryQty > 0 ? t.priceDropCta : t.viewProduct}
            </a>
            ${inventoryQty <= 0 ? `<p style="color:#6b7280;font-size:14px;margin-top:15px;">${t.outOfStockNote}</p>` : ''}
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

    console.log("💰 Product Update Webhook received for shop:", shop);

    const settings = await prisma.appSettings.findUnique({ where: { shop } }) || {
      enablePriceDropAlerts: true,
      priceDropThreshold:    5,
      adminLanguage:         'en',
    };

    if (!settings.enablePriceDropAlerts) {
      console.log("⚠️ Price drop alerts disabled");
      return new Response("Price drop alerts disabled", { status: 200 });
    }

    let APP_URL = process.env.SHOPIFY_APP_URL || "";
    if (APP_URL && !APP_URL.endsWith('/')) APP_URL += '/';

    const product  = payload;
    const variants = product.variants || [];

    console.log(`📦 Product: ${product.title}, Variants: ${variants.length}`);

    for (const variant of variants) {
      const variantId       = String(variant.id);
      const inventoryItemId = String(variant.inventory_item_id);
      const currentPrice    = parseFloat(variant.price);

      console.log(`🔍 Variant ${variantId}, Price: ${currentPrice}`);

      // ✅ Saare subscribers fetch karo — notified aur pending dono
      const subscribers = await prisma.backInStock.findMany({
        where: {
          shop,
          OR: [
            { inventoryItemId },
            { variantId }
          ]
        }
      });

      console.log(`👥 ${subscribers.length} subscribers found`);

      // ✅ Variant details ek baar fetch karo — sab ke liye reuse hoga
      let variantDetails = null;

      for (const sub of subscribers) {
        const subscribedPrice = sub.subscribedPrice;

        // ── No price yet — initialize ─────────────────────────
        if (!subscribedPrice || subscribedPrice === 0) {
          console.log(`⚙️ Initializing price for ${sub.email}: ${currentPrice}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data:  { subscribedPrice: currentPrice }
          });
          continue;
        }

        // ── PRICE DROPPED ─────────────────────────────────────
        if (currentPrice < subscribedPrice) {
          const percentageOff = Math.round(((subscribedPrice - currentPrice) / subscribedPrice) * 100);

          console.log(`💰 Price drop for ${sub.email}: ${subscribedPrice} → ${currentPrice} (${percentageOff}%)`);

          if (percentageOff < (settings.priceDropThreshold || 5)) {
            console.log(`⚠️ Below threshold — skipping`);
            continue;
          }

          try {
            // ✅ Subscriber ki language resolve karo
            const lang = resolveLang(sub.language);
            const t    = getT(lang);

            console.log(`🌐 [${lang.toUpperCase()}] DB language="${sub.language}" → Price drop email → ${sub.email}`);

            // Variant details cache karos
            if (!variantDetails) {
              variantDetails = await fetchVariantDetails(admin, variantId);
            }
            if (!variantDetails) continue;

            const variantData  = variantDetails.productVariant;
            const currency     = variantDetails.shop?.currencyCode || "USD";
            const shopName     = variantDetails.shop?.name || shop;
            const productImg   = variantData.product.featuredImage?.url
              || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
            const productUrl   = `https://${shop}/products/${variantData.product.handle}`;
            const inventoryQty = variantData.inventoryQuantity || 0;
            const openUrl      = `${APP_URL}api/track-open?id=${sub.id}`;
            const clickUrl     = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;

            const html = buildPriceDropHtml({
              t, shopName,
              productTitle:   variantData.product.title,
              displayName:    variantData.displayName,
              productImg,
              currency,
              subscribedPrice,
              currentPrice,
              percentageOff,
              inventoryQty,
              clickUrl,
              openUrl
            });

            const sent = await sendEmail({
              from:    `${shopName} <onboarding@resend.dev>`,
              to:      sub.email,
              subject: `💰 ${variantData.product.title} — ${percentageOff}% OFF`,
              html
            });

            if (sent) {
              console.log(`✅ [${lang.toUpperCase()}] Price drop email sent → ${sub.email}`);
              await prisma.backInStock.update({
                where: { id: sub.id },
                data:  {
                  subscribedPrice: currentPrice,
                  language:        lang   // ✅ DB mein language update karo
                }
              });
            } else {
              console.log(`❌ Failed → ${sub.email}`);
            }

          } catch (err) {
            console.error(`❌ Error for subscriber ${sub.id}:`, err.message);
          }

        // ── PRICE INCREASED ───────────────────────────────────
        } else if (currentPrice > subscribedPrice) {
          console.log(`📈 Price increased ${subscribedPrice} → ${currentPrice} for ${sub.email}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data:  { subscribedPrice: currentPrice }
          });

        // ── PRICE UNCHANGED ───────────────────────────────────
        } else {
          console.log(`➡️ Price unchanged at ${currentPrice} for ${sub.email}`);
        }
      }
    }

    console.log("✅ Product update webhook processed");
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("❌ Product Update Webhook Error:", err.message);
    console.error(err.stack);
    return new Response("Error", { status: 500 });
  }
}