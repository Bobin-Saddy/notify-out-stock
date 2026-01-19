import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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
    const data = await res.json();
    if (!res.ok) console.error("Resend specific error:", data);
    return res.ok;
  } catch (err) {
    console.error("Fetch failed:", err.message);
    return false;
  }
}

export async function action({ request }) {
  const { payload, shop, admin } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);
  
  // App URL setup for tracking
  const APP_URL = process.env.SHOPIFY_APP_URL || "https://notify-out-stock-production.up.railway.app/";

  try {
    console.log(`Checking stock for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            price
            product {
              title
              handle
              featuredImage { url }
            }
          }
        }
        shop { currencyCode }
      }
    `);

    const json = await response.json();
    const variant = json.data?.inventoryItem?.variant;
    const currency = json.data?.shop?.currencyCode || "USD";

    if (!variant) {
      console.log("No variant found for this inventory item.");
      return new Response("Variant not found", { status: 200 });
    }

    const productTitle = variant.product.title;
    const variantTitle = variant.displayName;
    const price = variant.price;
    const imageUrl = variant.product.featuredImage?.url || "";
    const productHandle = variant.product.handle;

    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId, 
        notified: false 
      },
    });

    console.log(`Found ${subscribers.length} pending subscribers for this item.`);

    if (available > 0 && subscribers.length > 0) {
      console.log("Sending Back in Stock emails to subscribers...");
      
      for (const sub of subscribers) {
        
        // --- TRACKING LINKS LOGIC ---
        const openTrackingUrl = `${APP_URL}api/track-open?id=${sub.id}`;
        const targetStoreUrl = `https://${shop}/products/${productHandle}`;
        const clickTrackingUrl = `${APP_URL}api/track-click?id=${sub.id}&target=${encodeURIComponent(targetStoreUrl)}`;

        const backInStockEmailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px;">
            <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">🎉 Great News!</h1>
                <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your item is back in stock</p>
              </div>
              
              ${imageUrl ? `
                <div style="text-align: center; padding: 20px; background-color: #ffffff;">
                  <img src="${imageUrl}" alt="${productTitle}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>
              ` : ''}
              
              <div style="padding: 30px; background-color: #ffffff;">
                <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 24px;">${productTitle}</h2>
                <p style="color: #777777; margin: 0 0 20px 0; font-size: 16px;">${variantTitle}</p>
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px 0; color: #666666; font-size: 14px;">Price:</td>
                      <td style="padding: 10px 0; text-align: right; font-size: 20px; font-weight: bold; color: #000000;">${currency} ${price}</td>
                    </tr>
                  </table>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${clickTrackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">Shop Now →</a>
                </div>
              </div>
            </div>
            
            <img src="${openTrackingUrl}" width="1" height="1" style="display:none !important;" />
            
            <div style="text-align: center; padding: 20px; color: #999999; font-size: 12px;">
              <p>You're receiving this because you signed up for restock notifications</p>
            </div>
          </div>
        `;
        
        const sent = await sendEmail({
          from: 'Restock Alert <onboarding@resend.dev>',
          to: sub.email,
          subject: `🎉 Back in Stock: ${productTitle}`,
          html: backInStockEmailHtml
        });

        if (sent) {
          await prisma.backInStock.update({ 
            where: { id: sub.id }, 
            data: { notified: true } 
          });
          console.log(`✅ Success: Mail sent to ${sub.email}`);
        }
        
        await new Promise(r => setTimeout(r, 500));
      }
    } 
    else if (available <= 0) {
      // Admin Out of Stock Email (No change needed here)
      console.log("Sending Out of Stock alert to Admin...");
      // ... (Your existing admin email logic)
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}