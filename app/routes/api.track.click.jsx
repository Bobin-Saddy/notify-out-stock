import prisma from "../db.server";
import { redirect } from "@remix-run/node";

export async function loader({ request }) {
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get("id");
  const productUrl = url.searchParams.get("url");

  if (!subscriptionId || !productUrl) {
    return redirect('/');
  }

  try {
    // Update clicked status (also marks as opened if not already)
    await prisma.backInStock.update({
      where: { id: parseInt(subscriptionId) },
      data: { 
        clicked: true,
        opened: true  // Auto-mark as opened when clicked
      }
    });

    console.log(`🖱️ Email link clicked: Subscription ID ${subscriptionId}`);
  } catch (error) {
    console.error("Error tracking email click:", error);
  }

  // Redirect to product page
  return redirect(productUrl);
}