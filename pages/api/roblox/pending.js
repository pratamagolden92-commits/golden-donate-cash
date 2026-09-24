import { prisma } from "../../../lib/prisma";
import { requireWorkspaceByApiKey } from "../../../lib/apiKeyAuth";

// GET /api/roblox/pending
// Header: x-api-key: gld_live_xxxxxxxx
// Dipanggil dari Roblox Studio (HttpService:GetAsync) secara berkala
// buat ambil donasi yang belum ditampilkan in-game.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const workspace = await requireWorkspaceByApiKey(req, res);
  if (!workspace) return; // response sudah dikirim di dalam helper

  const pending = await prisma.donation.findMany({
    where: { workspaceId: workspace.id, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  return res.status(200).json({
    donations: pending.map((d) => ({
      id: d.id,
      donor: d.donorName,
      amount: d.amount,
      message: d.message,
      provider: d.provider,
    })),
  });
}
