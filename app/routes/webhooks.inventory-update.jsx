import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

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
  const { payload, shop } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  try {
    console.log(`Checking stock for ${shop}: Item ${inventoryItemId}, Qty: ${available}`);

    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            displayName
            price
            product {
              title
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

    // --- IMPROVED LOGIC ---
    
    // Pehle check karo ki koi pending subscribers hain ya nahi
    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId, 
        notified: false 
      },
    });

    console.log(`Found ${subscribers.length} pending subscribers for this item.`);

    if (available > 0 && subscribers.length > 0) {
      // Stock available hai AUR subscribers bhi hain - BACK IN STOCK emails bhejo
      console.log("Sending Back in Stock emails to subscribers...");
      
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
              
              <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #155724; font-weight: bold;">✅ Now Available - Limited Stock!</p>
              </div>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666666; font-size: 14px;">Price:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 20px; font-weight: bold; color: #000000;">${currency} ${price}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666666; font-size: 14px; border-top: 1px solid #dee2e6;">Status:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 16px; font-weight: bold; color: #28a745; border-top: 1px solid #dee2e6;">In Stock ✓</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="https://${shop}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">Shop Now →</a>
              </div>
              
              <p style="text-align: center; color: #999999; font-size: 13px; margin-top: 20px;">Hurry! Items may sell out quickly.</p>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #999999; font-size: 12px;">
            <p>You're receiving this because you signed up for restock notifications</p>
          </div>
        </div>
      `;
      
      for (const sub of subscribers) {
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
      // Stock 0 hai - Admin ko OUT OF STOCK alert bhejo
      console.log("Sending Out of Stock alert to Admin...");
      
      const outOfStockEmailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px;">
          <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">🚨 Out of Stock Alert</h1>
            </div>
            
            ${imageUrl ? `
              <div style="text-align: center; padding: 20px; background-color: #ffffff;">
                <img src="${imageUrl}" alt="${productTitle}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
              </div>
            ` : ''}
            
            <div style="padding: 30px; background-color: #ffffff;">
              <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 24px;">${productTitle}</h2>
              <p style="color: #777777; margin: 0 0 20px 0; font-size: 16px;">${variantTitle}</p>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-weight: bold;">⚠️ This item is now out of stock</p>
              </div>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666666; font-size: 14px;">Price:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 20px; font-weight: bold; color: #000000;">${currency} ${price}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666666; font-size: 14px; border-top: 1px solid #dee2e6;">Available:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: bold; color: #ff6b6b; border-top: 1px solid #dee2e6;">0</td>
                  </tr>
                  ${subscribers.length > 0 ? `
                  <tr>
                    <td style="padding: 10px 0; color: #666666; font-size: 14px; border-top: 1px solid #dee2e6;">Waiting Customers:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: bold; color: #ff6b6b; border-top: 1px solid #dee2e6;">${subscribers.length}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="https://${shop}/admin" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">Go to Admin Dashboard →</a>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #999999; font-size: 12px;">
            <p>This is an automated alert from your Shopify store</p>
          </div>
        </div>
      `;
      
      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productTitle}`,
        html: outOfStockEmailHtml
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}