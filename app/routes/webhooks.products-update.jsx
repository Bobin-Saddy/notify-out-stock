import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendBackInStockEmail } from "./utils/email.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload, topic } = await authenticate.webhook(request);
    
    console.log("📦 Webhook received:", topic);
    console.log("🏪 Shop:", shop);
    console.log("📦 Product:", payload.title);

    // Get all variants from the product
    const variants = payload.variants || [];

    for (const variant of variants) {
      // ✅ Clean variant ID - ye wahi ID hai jo form submit karte waqt save hoti hai
      const variantId = String(variant.id).replace('gid://shopify/ProductVariant/', '');
      
      console.log(`\n🔍 Checking Variant ID: ${variantId}`);
      console.log(`📊 Inventory: ${variant.inventory_quantity}`);
      console.log(`🏷️ Title: ${variant.title}`);

      // ✅ Check if variant is NOW in stock
      if (variant.inventory_quantity > 0) {
        console.log(`✅ Variant ${variantId} is IN STOCK!`);
        
        // ✅ Find unnotified subscribers using variantId (NOT inventoryItemId)
        const subscribers = await prisma.backInStock.findMany({
          where: {
            variantId: variantId,  // ✅ Correct field name
            shop: shop,
            notified: false,
          },
        });
        console.log("Subscribers:", subscribers);

        console.log(`📧 Found ${subscribers.length} subscribers for variant ${variantId}`);

        if (subscribers.length === 0) {
          console.log(`ℹ️ No subscribers found for variant ${variantId}`);
          continue;
        }

        // Send emails to all subscribers
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
        console.log(`⚠️ Variant ${variantId} is still OUT of stock (Qty: ${variant.inventory_quantity})`);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Webhook processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};