import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  if (!inventoryItemId || !shop) return new Response("Error", { status: 400 });

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

    // Design logic for the badge
    const bgColor = stock <= 0 ? "#6b7280" : stock < 10 ? "#ef4444" : "#22c55e";
    const text = stock <= 0 ? "SOLD OUT" : `ONLY ${stock} LEFT IN STOCK!`;

    // SVG must have exact dimensions and namespaces for email clients
    const svg = `
    <svg width="200" height="40" viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="40" rx="20" fill="${bgColor}"/>
      <text x="100" y="25" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${text}
      </text>
    </svg>`.trim();

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Badge Loader Error:", err);
    return new Response("Error", { status: 500 });
  }
}