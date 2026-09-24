import { prisma } from "../../../../lib/prisma";
import { customAlphabet } from "nanoid";

const genLease = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  20
);

// Dipanggil oleh script "WX SAWERIA" (Script di ServerScriptService) via
// Config.Connection.WorkerBaseUrl + Config.Connection.PullPath
//
// Body: { serverId, limit }
// Response: { ok: true, items: [{ id, leaseToken, username, amount, message, createdAt, isFake, useEffect }] }
//
// Setiap donasi yang di-pull "disewa" (leased) 60 detik. Kalau Roblox gak
// ack dalam waktu itu (server crash dsb), donasi otomatis kembali antre
// supaya gak hilang.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { apiKey } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { apiKey } });
  if (!workspace || workspace.archived) {
    return res.status(401).json({ ok: false, error: "invalid_api_key" });
  }

  const limit = Math.min(Math.max(Number(req.body?.limit) || 10, 1), 25);
  const now = new Date();

  // Lepas lease yang sudah kadaluarsa (donasi yang gagal di-ack)
  await prisma.donation.updateMany({
    where: { workspaceId: workspace.id, status: "pending", leaseExpiresAt: { lt: now } },
    data: { leaseToken: null, leaseExpiresAt: null },
  });

  const available = await prisma.donation.findMany({
    where: { workspaceId: workspace.id, status: "pending", leaseToken: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const items = [];
  for (const d of available) {
    const leaseToken = genLease();
    await prisma.donation.update({
      where: { id: d.id },
      data: { leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    items.push({
      id: d.id,
      leaseToken,
      username: d.donorName,
      amount: d.amount,
      message: d.message,
      createdAt: d.createdAt.toISOString(),
      isFake: d.provider === "test",
      useEffect: true,
    });
  }

  return res.status(200).json({ ok: true, items });
}
