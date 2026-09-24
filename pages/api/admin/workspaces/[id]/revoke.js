import { prisma } from "../../../../../lib/prisma";
import { requireSuperOwner } from "../../../../../lib/requireSuperOwner";

// POST-only: super owner mencabut akses API key sebuah workspace.
// Workspace tidak dihapus (histori tetap ada), cuma diarsipkan supaya
// requireWorkspaceByApiKey menolak permintaan dari Roblox Studio-nya.
export default async function handler(req, res) {
  const guard = await requireSuperOwner(req, res);
  if (!guard) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { id } = req.query;
  await prisma.workspace.update({ where: { id }, data: { archived: true } });

  return res.status(200).json({ ok: true });
}
