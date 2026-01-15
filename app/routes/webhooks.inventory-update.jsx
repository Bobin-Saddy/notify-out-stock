import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendEmailWithRetry(emailData, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });
      if (res.ok) return true;
      if (res.status === 429) {
        await sleep(1000 * (i + 1));
        continue;
      }
      return false;
    } catch (err) {
      await sleep(1000);
    }
  }
  return false;
}

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);

  try {
    const inventoryItemId = String(payload.inventory_item_id);
    const available = Number(payload.available); // Ensure it's a number

    let productData = {
      title: "Product",
      variantTitle: "",
      price: "0.00",
      image: "",
      currency: "USD"
    };

    // --- 1. Fetch Full Product Details ---
    try {
      const { admin } = await unauthenticated.admin(shop);
      if (admin && typeof admin.graphql === 'function') {
        const response = await admin.graphql(`
          query getFullProductInfo {
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
        if (variant) {
          productData = {
            title: variant.product.title,
            variantTitle: variant.displayName,
            price: variant.price,
            image: variant.product.featuredImage?.url || "",
            currency: json.data.shop.currencyCode
          };
        }
      }
    } catch (e) { 
      console.error("❌ GraphQL Fetch Error:", e.message); 
    }

    const productHtml = `
      <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 15px; border-radius: 8px; max-width: 400px; background-color: #fff;">
        ${productData.image ? `<img src="${productData.image}" style="width: 100%; border-radius: 5px; margin-bottom: 10px;" />` : ''}
        <h2 style="margin: 0 0 10px 0; font-size: 20px;">${productData.title}</h2>
        <p style="color: #666; margin: 0 0 10px 0;">${productData.variantTitle}</p>
        <p style="font-size: 18px; font-weight: bold; color: #000;">Price: ${productData.currency} ${productData.price}</p>
      </div>
    `;

    // --- LOGIC START ---

    // CASE 1: AGAR STOCK KHATAM HO GAYA (Admin Notification)
    if (available <= 0) {
      console.log(`🚨 Stock is 0 or less (${available}). Notifying Admin...`);
      await sleep(600);
      await sendEmailWithRetry({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock Alert: ${productData.title}`,
        html: `
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h1 style="color: #d9534f;">Out of Stock Alert</h1>
            <p>The following product just hit <strong>0</strong> stock on <strong>${shop}</strong>.</p>
            ${productHtml}
            <br />
            <a href="https://admin.shopify.com/store/${shop.split('.')[0]}/products" style="display: inline-block; background:#d9534f; color:#fff; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight: bold;">Update Stock Now</a>
          </div>
        `
      });
    } 
    
    // CASE 2: AGAR STOCK WAPAS AA GAYA (Customer Notification)
    else if (available > 0) {
      console.log(`🎉 Stock is back (${available}). Checking for subscribers...`);
      
      const subscribers = await prisma.backInStock.findMany({
        where: { 
          inventoryItemId: inventoryItemId, 
          notified: false 
        },
      });

      if (subscribers.length > 0) {
        for (const sub of subscribers) {
          await sleep(600); // Rate limit fix
          const success = await sendEmailWithRetry({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🎉 Back in Stock: ${productData.title}`,
            html: `
              <div style="padding: 20px; background-color: #f4fdf4;">
                <h1 style="color: #28a745;">It's Back!</h1>
                <p>Hi! Good news, the product you were waiting for is back in stock at <strong>${shop}</strong>.</p>
                ${productHtml}
                <br />
                <a href="https://${shop}" style="display: inline-block; background:#000; color:#fff; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight: bold;">Shop Now →</a>
              </div>
            `
          });

          if (success) {
            await prisma.backInStock.update({
              where: { id: sub.id },
              data: { notified: true }
            });
            console.log(`✅ Customer Notified: ${sub.email}`);
          }
        }
      } else {
        console.log("ℹ️ No pending subscribers for this item.");
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}