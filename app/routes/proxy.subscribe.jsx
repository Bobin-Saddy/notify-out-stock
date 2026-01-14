import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const action = async ({ request }) => {
  console.log("PROXY ACTION HIT");

  // Handle CORS for local testing if necessary
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    // 1. Authenticate the App Proxy request
    // This gives us the 'admin' object to make GraphQL calls
    const { admin } = await authenticate.public.appProxy(request);
    
    const body = await request.json();
    const { email, variantId, shop } = body;

    if (!email || !variantId || !shop) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    // 2. Fetch the Inventory Item ID using GraphQL
    // This is much faster than the REST variants.json endpoint
    const response = await admin.graphql(`
      query {
        productVariant(id: "gid://shopify/ProductVariant/${variantId}") {
          inventoryItem {
            id
          }
        }
      }
    `);

    const variantData = await response.json();
    
    // Extract the clean numeric ID from the GID (e.g., gid://shopify/InventoryItem/12345 -> 12345)
    const rawInventoryId = variantData.data?.productVariant?.inventoryItem?.id;
    const inventoryItemId = rawInventoryId ? rawInventoryId.split('/').pop() : null;

    console.log(`🔍 Mapping Variant ${variantId} to Inventory Item ${inventoryItemId}`);

    // 3. Save to Prisma with the Inventory ID
    const subscription = await prisma.backInStock.create({
      data: {
        email,
        variantId: String(variantId),
        inventoryItemId: String(inventoryItemId), // Now this will NOT be null
        shop,
      },
    });

    return new Response(
      JSON.stringify({ success: true, data: subscription }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("SUBSCRIBE ERROR:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};