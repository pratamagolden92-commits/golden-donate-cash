import { prisma } from "../../../../lib/prisma";
import { getSession, upsertUserFromSession, generateApiKey } from "../../../../lib/auth";

export default async function handler(req, res) {
  const session = await getSession(req, res);
  if (!session) return res.status(401).json({ error: "unauthorized" });
  const user = await upsertUserFromSession(session);

  const { id: workspaceId } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.ownerId !== user.id) {
    return res.status(404).json({ error: "workspace_not_found" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const apiKey = generateApiKey();
  await prisma.workspace.update({ where: { id: workspaceId }, data: { apiKey } });
  return res.status(200).json({ apiKey });
}
