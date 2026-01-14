import prisma from "../db.server";

export async function action({ request }) {
  try {
    const payload = await request.json();
    const inventoryItemId = String(payload.inventory_item_id);
    const available = payload.available;

    console.log(`📦 Inventory Update: Item ${inventoryItemId}, Qty: ${available}`);

    if (available <= 0) {
      return new Response("Ignored", { status: 200 });
    }

    const subscribers = await prisma.backInStock.findMany({
      where: { 
        inventoryItemId: inventoryItemId,
        notified: false 
      },
    });

    if (subscribers.length === 0) {
      return new Response("No subscribers", { status: 200 });
    }

    // 📤 Send emails via Resend API
    for (const sub of subscribers) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Restock Alert <onboarding@resend.dev>',
            to: sub.email,
            subject: '🎉 Product is back in stock!',
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Good news!</h2>
                <p>The product you were waiting for is now back in stock at <strong>${sub.shop}</strong>.</p>
                <a href="https://${sub.shop}" style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none;">Shop Now</a>
              </div>
            `
          })
        });

        if (res.ok) {
          await prisma.backInStock.update({
            where: { id: sub.id },
            data: { notified: true }
          });
          console.log(`✅ Email sent via Resend to: ${sub.email}`);
        } else {
          const errorData = await res.json();
          console.error("❌ Resend API Error:", errorData);
        }
      } catch (err) {
        console.error("❌ Fetch Error:", err.message);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Error", { status: 500 });
  }
}