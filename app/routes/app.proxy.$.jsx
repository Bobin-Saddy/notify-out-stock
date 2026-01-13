import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("GET Request to proxy:", request.url);
  
  return new Response(
    JSON.stringify({ ok: true, message: "Proxy route working" }),
    { 
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      } 
    }
  );
};

export const action = async ({ request }) => {
  console.log("POST Request to proxy:", request.url, request.method);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  try {
    const text = await request.text();
    console.log("Raw body:", text);
    
    const body = JSON.parse(text);
    console.log("Parsed body:", body);

    if (!body.email || !body.variantId || !body.shop) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required fields",
          received: body
        }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    // Check if already subscribed
    const existing = await prisma.subscription.findFirst({
      where: {
        customerEmail: body.email,
        variantId: String(body.variantId),
        shopDomain: body.shop,
        status: "pending"
      }
    });

    if (existing) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Already subscribed",
          alreadyExists: true 
        }), 
        {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const subscription = await prisma.subscription.create({
      data: {
        customerEmail: body.email,
        variantId: String(body.variantId),
        shopDomain: body.shop,
        productName: body.productName || null,
        status: "pending"
      },
    });

    console.log("✓ Created subscription:", subscription.id);

    return new Response(
      JSON.stringify({ success: true, id: subscription.id }), 
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (err) {
    console.error("❌ SUBSCRIBE ERROR:", err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message
      }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );
  }
};