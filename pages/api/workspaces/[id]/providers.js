import { prisma } from "../../../../lib/prisma";
import { getSession, upsertUserFromSession } from "../../../../lib/auth";

// PATCH body: { "type": "saweria", "enabled": true, "streamKey": "..." }
export default async function handler(req, res) {
  const session = await getSession(req, res);
  if (!session) return res.status(401).json({ error: "unauthorized" });
  const user = await upsertUserFromSession(session);

  const { id: workspaceId } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.ownerId !== user.id) {
    return res.status(404).json({ error: "workspace_not_found" });
  }

  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { type, enabled, streamKey } = req.body;
  const updated = await prisma.provider.update({
    where: { workspaceId_type: { workspaceId, type } },
    data: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(streamKey !== undefined ? { streamKey } : {}),
    },
  });

  return res.status(200).json({ provider: updated });
}
