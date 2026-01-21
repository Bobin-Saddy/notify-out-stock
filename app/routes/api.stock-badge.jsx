import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  if (!inventoryItemId || !shop) {
    return new Response("Missing params", { status: 400 });
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      query getStock($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 1) {
            nodes {
              quantities(names: ["available"]) {
                quantity
              }
            }
          }
        }
      }
    `, { variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` } });

    const resJson = await response.json();
    const stock = resJson.data?.inventoryItem?.inventoryLevels?.nodes?.[0]?.quantities?.[0]?.quantity ?? 0;

    const color = stock < 5 ? "#ef4444" : "#22c55e";
    const text = stock > 0 ? `ONLY ${stock} LEFT IN STOCK!` : "OUT OF STOCK";

    // SVG code
    const svg = `
      <svg width="200" height="40" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="40" rx="20" fill="${color}" />
        <text x="100" y="25" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">
          ${text}
        </text>
      </svg>
    `.trim();

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("Badge Error:", e);
    return new Response("Error", { status: 500 });
  }
}