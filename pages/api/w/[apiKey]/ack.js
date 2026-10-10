import { prisma } from "../../../../lib/prisma";

// Dipanggil oleh script Roblox setelah efek donasi selesai ditampilkan.
// Body: { items: [{ id, leaseToken, status: "done" | "failed", error }] }
const MAX_RETRY_AGE_MS = 10 * 60 * 1000; // lewat 10 menit & masih gagal -> berhenti dicoba

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { apiKey } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { apiKey } });
  if (!workspace || workspace.archived) {
    return res.status(401).json({ ok: false, error: "invalid_api_key" });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];

  for (const item of items) {
    try {
      if (!item || typeof item.id !== "string") continue;

      const donation = await prisma.donation.findFirst({
        where: { id: item.id, workspaceId: workspace.id },
      });
      if (!donation) continue;

      if (item.status === "done") {
        if (donation.status === "claimed") continue; // sudah di-ack sebelumnya
        await prisma.donation.update({
          where: { id: donation.id },
          data: { status: "claimed", claimedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
        });
      } else if (donation.status === "pending" && donation.leaseToken === item.leaseToken) {
        const tooOld = Date.now() - donation.createdAt.getTime() > MAX_RETRY_AGE_MS;
        await prisma.donation.update({
          where: { id: donation.id },
          data: tooOld
            ? { status: "failed", leaseToken: null, leaseExpiresAt: null } // berhenti mencoba
            : { leaseToken: null, leaseExpiresAt: null }, // antre lagi
        });
      }
    } catch (err) {
      console.error("ack item error:", err);
    }
  }

  return res.status(200).json({ ok: true });
}
