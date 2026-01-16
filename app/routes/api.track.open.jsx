import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get("id");

  if (!subscriptionId) {
    return new Response("Missing ID", { status: 400 });
  }

  try {
    // Update opened status
    await prisma.backInStock.update({
      where: { id: parseInt(subscriptionId) },
      data: { opened: true }
    });

    console.log(`📧 Email opened: Subscription ID ${subscriptionId}`);
  } catch (error) {
    console.error("Error tracking email open:", error);
  }

  // Return 1x1 transparent pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new Response(pixel, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}