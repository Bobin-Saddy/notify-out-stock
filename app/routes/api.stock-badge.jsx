import { unauthenticated } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const inventoryItemId = url.searchParams.get("inventoryItemId");
  const shop = url.searchParams.get("shop");

  if (!inventoryItemId || !shop) {
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    
    // Using GraphQL variables ($id) to avoid "/" syntax errors
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
    `, { 
      variables: { 
        id: `gid://shopify/InventoryItem/${inventoryItemId}` 
      } 
    });

    const resJson = await response.json();
    
    // Safely extract the quantity
    const levels = resJson.data?.inventoryItem?.inventoryLevels?.nodes;
    const stock = levels?.[0]?.quantities?.[0]?.quantity ?? 0;

    // 2. Generate the Dynamic SVG
    const color = stock <= 0 ? "#6b7280" : stock < 10 ? "#ef4444" : "#22c55e";
    const statusText = stock <= 0 ? "SOLD OUT" : `ONLY ${stock} LEFT!`;

    const svg = `
      <svg width="220" height="40" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="8" fill="${color}" />
        <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
          ${statusText}
        </text>
      </svg>
    `;

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      },
    });
  } catch (error) {
    console.error("Stock Badge Error:", error);
    return new Response("Error generating badge", { status: 500 });
  }
}