import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("PROXY LOADER HIT:", request.method, request.url);
  
  return new Response(
    JSON.stringify({ ok: true, message: "Proxy routes working" }),
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
  console.log("PROXY ACTION HIT:", request.method, request.url);

  // Handle preflight
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
    const body = await request.json();
    console.log("Received body:", body);

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

    const subscription = await prisma.backInStock.create({
      data: {
        email: body.email,
        variantId: String(body.variantId),
        shop: body.shop,
      },
    });

    console.log("Created subscription:", subscription);

    return new Response(
      JSON.stringify({ success: true, data: subscription }), 
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (err) {
    console.error("SUBSCRIBE ERROR:", err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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