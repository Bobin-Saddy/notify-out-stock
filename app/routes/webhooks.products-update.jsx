import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendBackInStockEmail } from "./utils/email.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload, topic } = await authenticate.webhook(request);
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📦 WEBHOOK RECEIVED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏪 Shop:", shop);
    console.log("📋 Topic:", topic);
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));
    
    // Check what inventory item IDs are in the payload
    if (payload.inventory_item_id) {
      console.log("🔢 Inventory Item ID:", payload.inventory_item_id);
    }
    
    if (payload.id) {
      console.log("🔢 Inventory Level ID:", payload.id);
    }

    // Get the inventory item ID from webhook
    const inventoryItemId = String(payload.inventory_item_id || payload.id);
    console.log(shop, inventoryItemId)
    
    console.log("\n🔍 SEARCHING FOR SUBSCRIBERS:");
    console.log("Looking for inventoryItemId:", inventoryItemId);

    // First, let's see ALL subscribers in database
    const allSubscribers = await prisma.backInStock.findMany({
      where: {
        shop: shop,
        notified: false,
      },
    });
    
    console.log("\n📊 ALL UNNOTIFIED SUBSCRIBERS:", allSubscribers);

    // Now try to find by inventory item ID
    const subscribersByInventory = await prisma.backInStock.findMany({
      where: {
        inventoryItemId: inventoryItemId,
        shop: shop,
        notified: false,
      },
    });

    console.log(`\n📧 Subscribers found: ${subscribersByInventory.length}`);

    if (subscribersByInventory.length === 0) {
      console.log("⚠️ No subscribers found for this inventory item");
      console.log("💡 TIP: Check if variantId is being stored instead of inventoryItemId");
    }

    // Check if inventory is now available
    const available = payload.available || 0;
    console.log(`\n📊 Available quantity: ${available}`);

    if (available > 0) {
      console.log("✅ Product is IN STOCK!");
      
      for (const subscriber of subscribersByInventory) {
        try {
          console.log(`\n📧 Sending email to: ${subscriber.email}`);
          
          // We need to get product details - for now using generic message
          await sendBackInStockEmail(
            subscriber.email,
            "Product", // We'll need to fetch this
            "Default",
            `https://${shop}`,
            shop
          );

          await prisma.backInStock.update({
            where: { id: subscriber.id },
            data: { notified: true },
          });

          console.log(`✅ Successfully notified: ${subscriber.email}`);
        } catch (emailError) {
          console.error(`❌ Email failed:`, emailError.message);
        }
      }
    } else {
      console.log("⚠️ Product is still OUT of stock");
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