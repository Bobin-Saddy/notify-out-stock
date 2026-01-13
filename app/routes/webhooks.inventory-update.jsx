import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendBackInStockEmail } from "./utils/email.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, admin } = await authenticate.webhook(request);

    if (!admin) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const payload = await request.json();
    console.log("📦 Inventory Update Webhook:", JSON.stringify(payload, null, 2));

    // Get inventory item ID
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available || 0;

    console.log(`Inventory Item: ${inventoryItemId}, Available: ${available}`);

    // Only process if product is in stock
    if (available > 0) {
      console.log(`✓ Product is in stock (${available} units)`);

      // First, get the variant ID from inventory item ID
      const variantResponse = await admin.graphql(
        `#graphql
        query getVariantFromInventory($inventoryItemId: ID!) {
          inventoryItem(id: $inventoryItemId) {
            id
            variant {
              id
              title
              displayName
              product {
                id
                title
                onlineStoreUrl
              }
            }
          }
        }`,
        {
          variables: {
            id: `gid://shopify/InventoryItem/${inventoryItemId}`,
          },
        }
      );

      const variantData = await variantResponse.json();
      console.log("Variant data:", JSON.stringify(variantData, null, 2));

      const variant = variantData.data?.inventoryItem?.variant;

      if (!variant) {
        console.log("❌ Variant not found for inventory item");
        return new Response("Variant not found", { status: 200 });
      }

      // Extract variant ID (remove gid prefix)
      const variantId = variant.id.split('/').pop();
      console.log(`Found variant ID: ${variantId}`);

      // Find all pending subscriptions for this variant
      const subscribers = await prisma.subscription.findMany({
        where: {
          variantId: variantId,
          shopDomain: shop,
          status: "pending",
        },
      });

      console.log(`📧 Found ${subscribers.length} pending subscribers`);

      if (subscribers.length > 0) {
        const productTitle = variant.product.title;
        const variantTitle = variant.title;
        const productUrl = variant.product.onlineStoreUrl || `https://${shop}/products/${variant.product.id.split('/').pop()}`;

        console.log(`Product: ${productTitle}, Variant: ${variantTitle}`);
        console.log(`URL: ${productUrl}`);

        // Send emails to all subscribers
        let successCount = 0;
        let failCount = 0;

        for (const subscriber of subscribers) {
          console.log(`📧 Sending email to ${subscriber.customerEmail}`);
          
          const emailResult = await sendBackInStockEmail(
            subscriber.customerEmail,
            productTitle,
            productUrl,
            variantTitle
          );

          if (emailResult.success) {
            // Mark as sent
            await prisma.subscription.update({
              where: { id: subscriber.id },
              data: { 
                status: "sent",
              },
            });
            successCount++;
            console.log(`✓ Email sent and marked as sent for ${subscriber.customerEmail}`);
          } else {
            failCount++;
            console.log(`❌ Failed to send email to ${subscriber.customerEmail}: ${emailResult.error}`);
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`✅ Email summary: ${successCount} sent, ${failCount} failed`);
      }
    } else {
      console.log(`Product is out of stock (${available} units)`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    console.error("Error stack:", error.stack);
    return new Response("Error: " + error.message, { status: 500 });
  }
};