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
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  try {
    const { admin } = await unauthenticated.admin(shop);
    
    // 1. Fetch Detailed Product Info
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

    if (!variant) return new Response("Variant not found", { status: 200 });

    const productTitle = variant.product.title;
    const variantTitle = variant.displayName;
    const price = variant.price;
    const imageUrl = variant.product.featuredImage?.url || "";

    // Professional HTML Card for Email
    const productCardHtml = `
      <div style="font-family: Arial, sans-serif; border: 1px solid #eeeeee; padding: 20px; border-radius: 12px; max-width: 450px; background-color: #ffffff;">
        ${imageUrl ? `<img src="${imageUrl}" alt="${productTitle}" style="width: 100%; border-radius: 8px; margin-bottom: 15px;" />` : ''}
        <h2 style="margin: 0; color: #333333; font-size: 22px;">${productTitle}</h2>
        <p style="color: #777777; margin: 5px 0 15px 0; font-size: 16px;">${variantTitle}</p>
        <div style="font-size: 20px; font-weight: bold; color: #000000; margin-bottom: 20px;">
          Price: ${currency} ${price}
        </div>
      </div>
    `;

    // --- CASE A: OUT OF STOCK (Admin Notification) ---
    if (available <= 0) {
      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productTitle}`,
        html: `
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h1 style="color: #d9534f; margin-top: 0;">Inventory Alert</h1>
            <p>This item is now <strong>Out of Stock</strong> at <b>${shop}</b>.</p>
            ${productCardHtml}
            <br />
            <a href="https://admin.shopify.com/store/${shop.split('.')[0]}/products" style="background-color: #d9534f; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Manage Stock</a>
          </div>
        `
      });
      return new Response("OK", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Notifications) ---
    if (available > 0) {
      const subscribers = await prisma.backInStock.findMany({
        where: { inventoryItemId, notified: false },
      });

      if (subscribers.length > 0) {
        // Parallel execution for speed
        await Promise.all(subscribers.map(async (sub) => {
          const sent = await sendEmail({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: `🎉 Back in Stock: ${productTitle}`,
            html: `
              <div style="padding: 20px; background-color: #f4fdf4;">
                <h1 style="color: #28a745; margin-top: 0;">It's Back!</h1>
                <p>Good news! The product you were waiting for is back in stock at <b>${shop}</b>.</p>
                ${productCardHtml}
                <br />
                <a href="https://${shop}" style="background-color: #000000; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Shop Now →</a>
              </div>
            `
          });

          if (sent) {
            await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
          }
        }));
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Critical Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}