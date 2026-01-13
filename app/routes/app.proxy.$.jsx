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

  // Handle preflight OPTIONS request
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
      console.log("Missing fields:", { 
        email: !!body.email, 
        variantId: !!body.variantId, 
        shop: !!body.shop 
      });
      
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

    const subscription = await prisma.backInStock.create({
      data: {
        email: body.email,
        variantId: String(body.variantId),
        shop: body.shop,
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