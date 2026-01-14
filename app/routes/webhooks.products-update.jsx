import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendBackInStockEmail } from "./utils/email.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload, topic } = await authenticate.webhook(request);
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 PRODUCTS_UPDATE WEBHOOK RECEIVED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏪 Shop:", shop);
    console.log("📦 Product:", payload.title);
    console.log("🔗 Handle:", payload.handle);

    // Get all variants from the product
    const variants = payload.variants || [];
    console.log(`\n🔍 Found ${variants.length} variants to check`);

    for (const variant of variants) {
      // Clean variant ID (remove gid:// if present)
      const variantId = String(variant.id).replace('gid://shopify/ProductVariant/', '');
      
      console.log(`\n━━━ Checking Variant ━━━`);
      console.log(`🆔 Variant ID: ${variantId}`);
      console.log(`🏷️  Title: ${variant.title}`);
      console.log(`📊 Inventory: ${variant.inventory_quantity}`);
      console.log(`📦 SKU: ${variant.sku || 'N/A'}`);

      // Check if variant is NOW in stock
      if (variant.inventory_quantity > 0) {
        console.log(`✅ Variant ${variantId} is IN STOCK!`);
        
        // Find unnotified subscribers for THIS variant
        const subscribers = await prisma.backInStock.findMany({
          where: {
            variantId: variantId,
            shop: shop,
            notified: false,
          },
        });

        console.log(`📧 Found ${subscribers.length} subscribers to notify`);

        if (subscribers.length === 0) {
          console.log(`ℹ️  No subscribers for variant ${variantId}`);
          continue;
        }

        // Send email to each subscriber
        for (const subscriber of subscribers) {
          try {
            const productUrl = `https://${shop}/products/${payload.handle}?variant=${variant.id}`;
            
            console.log(`📧 Sending email to: ${subscriber.email}`);
            
            await sendBackInStockEmail(
              subscriber.email,
              payload.title,
              variant.title,
              productUrl,
              shop
            );

            // Mark as notified
            await prisma.backInStock.update({
              where: { id: subscriber.id },
              data: { notified: true },
            });

            console.log(`✅ Successfully notified: ${subscriber.email}`);
          } catch (emailError) {
            console.error(`❌ Email failed for ${subscriber.email}:`, emailError.message);
          }
        }
      } else {
        console.log(`⚠️  Variant ${variantId} is still OUT of stock (Qty: ${variant.inventory_quantity})`);
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