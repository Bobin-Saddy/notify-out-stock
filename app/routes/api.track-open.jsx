import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    await prisma.backInStock.update({
      where: { id: parseInt(id) },
      data: { opened: true }
    });
    console.log(`Email opened for subscriber ID: ${id}`);
  }

  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  return new Response(pixel, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" }
  });
}