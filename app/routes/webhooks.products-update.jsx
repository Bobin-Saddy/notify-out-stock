import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendBackInStockEmail } from "./utils/email.server";

export const action = async ({ request }) => {
  try {
    // 1. Authenticate the webhook
    const { shop, payload, topic } = await authenticate.webhook(request);
    
    // 2. Log receipt
    console.log(`\n📦 Webhook Received: ${topic} for ${shop}`);

    // Optional: Filter for specific topic if needed
    if (topic !== "PRODUCTS_UPDATE") {
      return new Response("Topic not handled", { status: 200 });
    }

    const variants = payload.variants || [];

    for (const variant of variants) {
      // Standardize the ID: Remove GID prefix if present and convert to string
      const variantId = String(variant.id).replace('gid://shopify/ProductVariant/', '');
      
      // Construct the clean Product URL
      const productUrl = `https://${shop}/products/${payload.handle}?variant=${variantId}`;

      // 3. Only trigger if inventory is back in stock
      if (variant.inventory_quantity > 0) {
        
        const subscribers = await prisma.backInStock.findMany({
          where: {
            variantId: variantId,
            shop: shop,
            notified: false,
          },
        });

        if (subscribers.length > 0) {
          console.log(`📧 Found ${subscribers.length} subscribers for ${variant.title}`);

          for (const subscriber of subscribers) {
            try {
              await sendBackInStockEmail(
                subscriber.email,
                payload.title,
                variant.title,
                productUrl,
                shop
              );

              // 4. Mark as notified immediately to prevent double emails
              await prisma.backInStock.update({
                where: { id: subscriber.id },
                data: { notified: true },
              });

              console.log(`✅ Notified: ${subscriber.email}`);
            } catch (emailError) {
              console.error(`❌ Email failed for ${subscriber.email}:`, emailError.message);
            }
          }
        }
      }
    }

    return new Response(null, { status: 200 });
    
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    // Always return a 200 if the webhook was received but the logic failed 
    // to prevent Shopify from retrying indefinitely, OR return 500 if you want a retry.
    return new Response(null, { status: 500 });
  }
};