import { prisma } from "../../../lib/prisma";
import { requireWorkspaceByApiKey } from "../../../lib/apiKeyAuth";

// POST /api/roblox/claim   body: { "id": "donation_id" }
// Header: x-api-key: gld_live_xxxxxxxx
// Dipanggil dari Roblox Studio setelah efek donasi berhasil ditampilkan
// in-game, supaya donasi yang sama gak muncul dua kali.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const workspace = await requireWorkspaceByApiKey(req, res);
  if (!workspace) return;

  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "missing_id" });

  const donation = await prisma.donation.findUnique({ where: { id } });
  if (!donation || donation.workspaceId !== workspace.id) {
    return res.status(404).json({ error: "donation_not_found" });
  }

  await prisma.donation.update({
    where: { id },
    data: { status: "claimed", claimedAt: new Date() },
  });

  return res.status(200).json({ ok: true });
}
