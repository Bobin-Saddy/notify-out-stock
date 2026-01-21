// app/routes/api.stock-badge.jsx
import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  // 1. Get current stock directly from Shopify
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(`
    query getStock($id: ID!) {
      inventoryItem(id: $id) {
        inventoryLevel(locationId: "YOUR_LOCATION_ID") { // Or fetch all levels
          quantities(names: ["available"]) { quantity }
        }
      }
    }
  `, { variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` } });

  const data = await response.json();
  const stock = data?.data?.inventoryItem?.inventoryLevel?.quantities[0]?.quantity || 0;

  // 2. Return an SVG image
  const color = stock < 5 ? "#ef4444" : "#22c55e"; // Red if low, Green if high
  const text = stock > 0 ? `ONLY ${stock} LEFT IN STOCK!` : "OUT OF STOCK";

  const svg = `
    <svg width="250" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="10" fill="${color}" />
      <text x="50%" y="50%" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
        ${text}
      </text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}