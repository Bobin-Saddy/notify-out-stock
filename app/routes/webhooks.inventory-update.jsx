import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

// Fast Email Sender without excessive waiting
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
    console.error("Email Fetch Error:", err.message);
    return false;
  }
}

export async function action({ request }) {
  const { payload, shop } = await authenticate.webhook(request);
  const inventoryItemId = String(payload.inventory_item_id);
  const available = Number(payload.available);

  try {
    // 1. Fetch Product Details Fast
    let productData = { title: "Product", variant: "", price: "0.00", image: "", currency: "USD" };
    
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant { 
            displayName price 
            product { title featuredImage { url } }
          }
        }
        shop { currencyCode }
      }
    `);
    const json = await response.json();
    const v = json.data?.inventoryItem?.variant;
    
    if (v) {
      productData = {
        title: v.product.title,
        variant: v.displayName,
        price: v.price,
        image: v.product.featuredImage?.url || "",
        currency: json.data.shop.currencyCode
      };
    }

    // Common HTML Template
    const productCard = `
      <div style="font-family: sans-serif; border: 1px solid #eee; padding: 15px; border-radius: 10px;">
        ${productData.image ? `<img src="${productData.image}" width="200" style="border-radius:5px;"/>` : ''}
        <h3>${productData.title}</h3>
        <p>${productData.variant}</p>
        <p><b>Price:</b> ${productData.currency} ${productData.price}</p>
      </div>
    `;

    // --- CASE A: OUT OF STOCK (Admin Alert) ---
    if (available <= 0) {
      await sendEmail({
        from: 'Stock Alert <onboarding@resend.dev>',
        to: 'digittrix.savita@gmail.com',
        subject: `🚨 Out of Stock: ${productData.title}`,
        html: `<h2>Inventory Alert</h2><p>Item just hit 0 at ${shop}.</p>${productCard}`
      });
      return new Response("Admin Notified", { status: 200 });
    }

    // --- CASE B: BACK IN STOCK (Customer Alerts) ---
    const subscribers = await prisma.backInStock.findMany({
      where: { inventoryItemId, notified: false },
    });

    if (subscribers.length > 0) {
      // Send all emails in parallel (Faster)
      await Promise.all(subscribers.map(async (sub) => {
        const sent = await sendEmail({
          from: 'Restock Alert <onboarding@resend.dev>',
          to: sub.email,
          subject: `🎉 ${productData.title} is Back!`,
          html: `<h2>Good News!</h2><p>Back in stock at ${shop}.</p>${productCard}<br/><a href="https://${shop}">Shop Now</a>`
        });

        if (sent) {
          await prisma.backInStock.update({ where: { id: sub.id }, data: { notified: true } });
        }
      }));
    }

    return new Response("Success", { status: 200 });
  } catch (err) {
    console.error("Webhook Error:", err);
    return new Response("Error", { status: 500 });
  }
}