import prisma from "../db.server";

export const loader = async () => {
  return new Response(
    JSON.stringify({ ok: true, message: "Proxy route working" }),
    { 
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      } 
    }
  );
};

export const action = async ({ request }) => {
  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { 
          status: 405, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    const body = await request.json();
    console.log("Received body:", body); // Debug log

    if (!body.email || !body.variantId || !body.shop) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing fields",
          received: { email: !!body.email, variantId: !!body.variantId, shop: !!body.shop }
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

    await prisma.backInStock.create({
      data: {
        email: body.email,
        variantId: String(body.variantId),
        shop: body.shop,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
    });
  } catch (err) {
    console.error("SUBSCRIBE ERROR:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
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