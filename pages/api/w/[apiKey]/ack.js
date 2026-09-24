import { prisma } from "../../../../lib/prisma";

// Dipanggil oleh script "WX SAWERIA" setelah efek donasi selesai ditampilkan.
// Body: { items: [{ id, leaseToken, status: "done" | "failed", error }] }
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { apiKey } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { apiKey } });
  if (!workspace || workspace.archived) {
    return res.status(401).json({ ok: false, error: "invalid_api_key" });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  for (const item of items) {
    const donation = await prisma.donation.findUnique({ where: { id: item.id } });
    if (!donation || donation.workspaceId !== workspace.id) continue;

    if (item.status === "done") {
      await prisma.donation.update({
        where: { id: item.id },
        data: { status: "claimed", claimedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
      });
    } else if (donation.leaseToken === item.leaseToken) {
      // gagal: lepas lease supaya donasi ini di-pull lagi di siklus berikutnya
      await prisma.donation.update({
        where: { id: item.id },
        data: { leaseToken: null, leaseExpiresAt: null },
      });
    }
  }

  return res.status(200).json({ ok: true });
}
