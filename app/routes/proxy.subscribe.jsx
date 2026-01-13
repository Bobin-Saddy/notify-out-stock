import prisma from "../db.server";

export async function action({ request }) {
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
    const body = await request.json();

    if (!body.email || !body.variantId || !body.shop) {
      return Response.json(
        { success: false, error: "Missing fields" },
        { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
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

    return Response.json(
      { success: true },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return Response.json(
      { success: false, error: err.message },
      { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      }
    );
  }
}

export async function loader() {
  return Response.json(
    { ok: true, message: "Subscribe endpoint" },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}