// app/routes/api.email-stats.jsx
import prisma from "../db.server";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);

  const totalEmails = await prisma.emailLog.count();
  const successfulEmails = await prisma.emailLog.count({ where: { status: 'sent' } });
  const failedEmails = await prisma.emailLog.count({ where: { status: 'failed' } });
  const pendingSubscribers = await prisma.backInStock.count({ where: { notified: false } });

  const emailHistory = await prisma.emailLog.groupBy({
    by: ['createdAt'],
    _count: { status: true },
    orderBy: { createdAt: 'desc' },
    take: 7
  });

  return json({ totalEmails, successfulEmails, failedEmails, pendingSubscribers, emailHistory });
}