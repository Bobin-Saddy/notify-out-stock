import { authenticate } from "./shopify.server";
import prisma from "./db.server";
import { sendBackInStockEmail } from "./routes/utils/email.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload, topic } = await authenticate.webhook(request);
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PRODUCTS_UPDATE WEBHOOK RECEIVED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏪 Shop:", shop);
    console.log("📦 Product:", payload.title);

    const variants = payload.variants || [];
    console.log(`🔍 Found ${variants.length} variants to check`);

    for (const variant of variants) {
      const variantId = String(variant.id).replace('gid://shopify/ProductVariant/', '');
      
      console.log(`\n━━━ Variant ${variantId} ━━━`);
      console.log(`🏷️  Title: ${variant.title}`);
      console.log(`📊 Inventory: ${variant.inventory_quantity}`);

      if (variant.inventory_quantity > 0) {
        console.log(`✅ IN STOCK!`);
        
        const subscribers = await prisma.backInStock.findMany({
          where: {
            variantId: variantId,
            shop: shop,
            notified: false,
          },
        });

        console.log(`📧 Found ${subscribers.length} subscribers`);

        for (const subscriber of subscribers) {
          try {
            const productUrl = `https://${shop}/products/${payload.handle}?variant=${variant.id}`;
            
            console.log(`📧 Sending to: ${subscriber.email}`);
            
            await sendBackInStockEmail(
              subscriber.email,
              payload.title,
              variant.title,
              productUrl,
              shop
            );

            await prisma.backInStock.update({
              where: { id: subscriber.id },
              data: { notified: true },
            });

            console.log(`✅ Notified: ${subscriber.email}`);
          } catch (emailError) {
            console.error(`❌ Email failed:`, emailError.message);
          }
        }
      } else {
        console.log(`⚠️  Still OUT of stock`);
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};