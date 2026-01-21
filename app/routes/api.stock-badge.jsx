import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  // Error case: Missing data (Returns a black badge so you know it failed)
  if (!inventoryItemId || !shop) {
    return new Response(generateSvg("#000000", "ID ERROR"), { headers: { "Content-Type": "image/svg+xml" } });
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

    const bgColor = stock <= 0 ? "#6b7280" : stock < 10 ? "#ef4444" : "#22c55e";
    const text = stock <= 0 ? "SOLD OUT" : `ONLY ${stock} LEFT!`;

    return new Response(generateSvg(bgColor, text), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(generateSvg("#374151", "STOCK ERROR"), { headers: { "Content-Type": "image/svg+xml" } });
  }
}

function generateSvg(color, text) {
  return `
    <svg width="200" height="40" viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="40" rx="20" fill="${color}"/>
      <text x="100" y="25" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${text}
      </text>
    </svg>
  `.trim();
}