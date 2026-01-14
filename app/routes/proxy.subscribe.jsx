import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("PROXY LOADER HIT:", request.method, request.url);
  
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
  console.log("PROXY ACTION HIT:", request.method, request.url);

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

    // ✅ Get inventory item ID from Shopify API
    const variantId = body.variantId;
    let inventoryItemId = null;

    try {
      // Fetch variant details to get inventory_item_id
      const shopDomain = body.shop;
      const apiUrl = `https://${shopDomain}/admin/api/2025-01/variants/${variantId}.json`;
      
      // Note: This requires API access - we'll need to store it differently
      // For now, just store variantId and we'll map it later
      console.log("Storing variant:", variantId);
    } catch (err) {
      console.log("Could not fetch inventory item ID:", err.message);
    }

    const subscription = await prisma.backInStock.create({
      data: {
        email: body.email,
        variantId: String(body.variantId),
        inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
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