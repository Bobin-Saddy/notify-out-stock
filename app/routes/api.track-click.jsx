// routes/api.track-click.jsx
import { redirect } from "@remix-run/node";
import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const targetUrl = url.searchParams.get("url");

  if (id) {
    await prisma.backInStock.update({
      where: { id: parseInt(id) },
      data: { clicked: true }
    });
  }

  return redirect(targetUrl);
}