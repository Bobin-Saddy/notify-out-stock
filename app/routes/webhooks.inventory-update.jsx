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
    const available = payload.available;

    // --- 1. Fetch Full Product Details via GraphQL ---
    let productData = {
      title: "Product",
      variantTitle: "",
      price: "0.00",
      image: "",
      currency: "USD"
    };

    try {
      const { graphql } = await unauthenticated.admin(shop);
      const response = await graphql(`
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
    } catch (e) { console.error("GraphQL Error:", e.message); }

    const productHtml = `
      <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 15px; border-radius: 8px; max-width: 400px;">
        ${productData.image ? `<img src="${productData.image}" style="width: 100%; border-radius: 5px;" />` : ''}
        <h2 style="margin-top: 10px;">${productData.title}</h2>
        <p style="color: #666;">${productData.variantTitle}</p>
        <p style="font-size: 18px; font-weight: bold;">Price: ${productData.currency} ${productData.price}</p>
      </div>
    `;

    // --- CASE A: OUT OF STOCK (Admin Alert) ---
    if (available <= 0) {
      await sleep(600);
      await sendEmailWithRetry({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productData.title}`,
        html: `
          <h1 style="color: #d9534f;">🚨 Out of Stock Alert</h1>
          ${productHtml}
          <p>This product just went out of stock on <strong>${shop}</strong>.</p>
          <a href="https://admin.shopify.com/store/${shop.split('.')[0]}/products" style="background:#d9534f; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Check Inventory</a>
        `
      });
      return new Response("OK", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Alert) ---
    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId, notified: false },
    });

    for (const sub of subscribers) {
      await sleep(600);
      const success = await sendEmailWithRetry({
        from: 'Restock Alert <onboarding@resend.dev>',
        to: sub.email,
        subject: `🎉 ${productData.title} is Back in Stock!`,
        html: `
          <h1 style="color: #28a745;">🎉 It's Back!</h1>
          ${productHtml}
          <p>Good news! The product you were waiting for is back in stock at <strong>${shop}</strong>.</p>
          <a href="https://${shop}" style="background:#000; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Buy Now</a>
        `
      });

      if (success) {
        await prisma.backInStock.update({
          where: { id: sub.id },
          data: { notified: true }
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}