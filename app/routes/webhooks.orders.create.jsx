import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { payload } = await authenticate.webhook(request);
    
    // Get line items from order
    const lineItems = payload.line_items || [];
    
    for (const item of lineItems) {
      const variantId = String(item.variant_id);
      
      // Find all subscribers who were notified about this variant
      const subscribers = await prisma.backInStock.findMany({
        where: {
          variantId: variantId,
          notified: true,
          purchased: false  // Not already marked as purchased
        }
      });

      // Check if order email matches any subscriber
      const orderEmail = payload.email?.toLowerCase();
      
      for (const sub of subscribers) {
        if (sub.email.toLowerCase() === orderEmail) {
          // Mark as purchased
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { 
              purchased: true,
              opened: true,  // Auto-mark as opened
              clicked: true  // Auto-mark as clicked
            }
          });
          
          console.log(`✅ Purchase tracked: ${orderEmail} bought variant ${variantId}`);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error tracking purchase:", error);
    return new Response("Error", { status: 500 });
  }
}
