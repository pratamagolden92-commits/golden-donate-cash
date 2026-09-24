import { prisma } from "../../../lib/prisma";
import { requireSuperOwner } from "../../../lib/requireSuperOwner";

// GET-only: cuma super owner yang boleh lihat SEMUA workspace di sistem.
export default async function handler(req, res) {
  const guard = await requireSuperOwner(req, res);
  if (!guard) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const workspaces = await prisma.workspace.findMany({
    include: {
      owner: true,
      donations: { where: { status: "claimed" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    ownerName: w.owner.name,
    apiKey: w.apiKey,
    archived: w.archived,
    totalDonasi: w.donations.reduce((sum, d) => sum + d.amount, 0),
    createdAt: w.createdAt,
  }));

  return res.status(200).json({ workspaces: result });
}
