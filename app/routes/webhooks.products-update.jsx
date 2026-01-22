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

        // If no subscribed price exists, set it to current price
        if (!subscribedPrice || subscribedPrice === 0) {
          console.log(`⚠️ Setting initial price for subscriber ${sub.id}: ${currentPrice}`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { subscribedPrice: currentPrice }
          });
          continue;
        }

        // Check if price has DROPPED
        if (currentPrice < subscribedPrice) {
          const percentageOff = Math.round(((subscribedPrice - currentPrice) / subscribedPrice) * 100);
          
          console.log(`💰 Price drop detected for ${sub.email}: ${subscribedPrice} → ${currentPrice} (${percentageOff}% off)`);

          // Only send if price drop is significant enough
          if (percentageOff >= (settings.priceDropThreshold || 5)) {
            try {
              // Get full product details from Shopify
              const query = `
                query getVariant($id: ID!) {
                  productVariant(id: $id) {
                    displayName
                    price
                    inventoryQuantity
                    product {
                      title
                      handle
                      featuredImage { url }
                    }
                  }
                  shop { currencyCode name }
                }
              `;

              const response = await admin.graphql(query, {
                variables: { id: `gid://shopify/ProductVariant/${variantId}` }
              });

              const json = await response.json();
              if (json.errors) {
                console.error("❌ GraphQL Error:", JSON.stringify(json.errors, null, 2));
                continue;
              }

              const variantData = json.data?.productVariant;
              if (!variantData) {
                console.log(`⚠️ Variant data not found for ${variantId}`);
                continue;
              }

              const currency = json.data?.shop?.currencyCode || "USD";
              const shopName = json.data?.shop?.name || shop;
              const productImg = variantData.product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
              const productUrl = `https://${shop}/products/${variantData.product.handle}`;
              const inventoryQty = variantData.inventoryQuantity || 0;

              const openUrl = `${APP_URL}api/track-open?id=${sub.id}`;
              const clickUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(productUrl)}`;
              const priceDropBadge = getPriceDropBadge(
                subscribedPrice.toFixed(2), 
                currentPrice.toFixed(2), 
                currency, 
                percentageOff
              );

              // Add stock status badge if out of stock
              const stockStatusBadge = inventoryQty <= 0 ? `
                <div style="background: linear-gradient(135deg, #f59e0b22 0%, #f59e0b44 100%); 
                            border: 2px solid #f59e0b; 
                            border-radius: 12px; 
                            padding: 12px 20px; 
                            margin: 20px 0;
                            text-align: center;">
                  <p style="margin: 0; color: #f59e0b; font-weight: 700; font-size: 16px;">
                    ⚠️ Currently Out of Stock - Price Reduced for When It Returns!
                  </p>
                </div>
              ` : '';

              const priceDropHtml = `
                <div style="background-color: #f3f4f6; padding: 40px 0; font-family: sans-serif;">
                  <table align="center" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px rgba(0,0,0,0.1);">
                    <tr><td style="padding: 40px; text-align: center;">
                      <h1 style="color: #111827; font-size: 28px; font-weight: 800;">💰 Price Drop Alert!</h1>
                      <p style="color: #6b7280;">Great news! The price just dropped on <strong>${shopName}</strong>.</p>
                    </td></tr>
                    <tr><td style="padding: 0 40px; text-align: center;">
                      <div style="background-color: #f9fafb; border-radius: 20px; padding: 30px;">
                        <img src="${productImg}" style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 20px;" alt="${variantData.product.title}">
                        <h2 style="color: #111827; margin: 15px 0;">${variantData.product.title}</h2>
                        <p style="color: #6b7280; margin: 10px 0;">${variantData.displayName}</p>
                        
                        ${priceDropBadge}
                        ${stockStatusBadge}
                        
                        <a href="${clickUrl}" style="display: inline-block; background-color: ${inventoryQty > 0 ? '#10b981' : '#6b7280'}; color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: bold; margin-top: 10px;">
                          ${inventoryQty > 0 ? 'Shop Now & Save' : 'View Product'}
                        </a>
                        
                        ${inventoryQty <= 0 ? `
                          <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
                            We'll notify you when it's back in stock at this great price!
                          </p>
                        ` : ''}
                      </div>
                    </td></tr>
                    <tr><td style="padding: 30px; text-align: center;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you subscribed to alerts for this product
                      </p>
                    </td></tr>
                  </table>
                  <img src="${openUrl}" width="1" height="1" style="display:none;" alt="" />
                </div>
              `;

              const emailSubject = inventoryQty > 0 
                ? `💰 Price Drop: ${variantData.product.title} - Save ${percentageOff}%!`
                : `💰 Price Reduced: ${variantData.product.title} - Save ${percentageOff}% When Back in Stock!`;

              const sent = await sendEmail({
                from: `${shopName} <onboarding@resend.dev>`,
                to: sub.email,
                subject: emailSubject,
                html: priceDropHtml
              });

              if (sent) {
                console.log(`✅ Price drop email sent to ${sub.email} (Stock: ${inventoryQty > 0 ? 'In Stock' : 'Out of Stock'})`);
                // Update the subscribed price to current price to prevent duplicate emails
                await prisma.backInStock.update({
                  where: { id: sub.id },
                  data: { subscribedPrice: currentPrice }
                });
              } else {
                console.log(`❌ Failed to send price drop email to ${sub.email}`);
              }
            } catch (err) {
              console.error(`❌ Error processing subscriber ${sub.id}:`, err);
            }
          } else {
            console.log(`⚠️ Price drop ${percentageOff}% is below threshold ${settings.priceDropThreshold}%`);
          }
        } 
        // If price INCREASED, update the subscribed price
        else if (currentPrice > subscribedPrice) {
          console.log(`📈 Price increased from ${subscribedPrice} to ${currentPrice} for ${sub.email}, updating reference price`);
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { subscribedPrice: currentPrice }
          });
        } 
        // Price unchanged
        else {
          console.log(`➡️ Price unchanged at ${currentPrice} for ${sub.email}`);
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