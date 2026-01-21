import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  if (!inventoryItemId || !shop) return new Response("Params Error", { status: 400 });

  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      query getStock($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 1) {
            nodes { quantities(names: ["available"]) { quantity } }
          }
        }
      }
    `, { variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` } });

    const resJson = await response.json();
    const stock = resJson.data?.inventoryItem?.inventoryLevels?.nodes?.[0]?.quantities?.[0]?.quantity ?? 0;

    const color = stock < 10 ? "#ef4444" : "#22c55e"; // Red if low, Green if okay
    const text = stock > 0 ? `ONLY ${stock} LEFT!` : "OUT OF STOCK";

    const svg = `
      <svg width="180" height="35" viewBox="0 0 180 35" xmlns="http://www.w3.org/2000/svg">
        <rect width="180" height="35" rx="17.5" fill="${color}" />
        <text x="90" y="22" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">
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
    return new Response("Error", { status: 500 });
  }
}