import { prisma } from "../../../lib/prisma";
import { getSession, upsertUserFromSession, generateApiKey } from "../../../lib/auth";

export default async function handler(req, res) {
  const session = await getSession(req, res);
  if (!session) return res.status(401).json({ error: "unauthorized" });
  const user = await upsertUserFromSession(session);

  if (req.method === "GET") {
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: user.id },
      include: { donations: true },
    });
    return res.status(200).json({ workspaces });
  }

  if (req.method === "POST") {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "missing_name" });

    const count = await prisma.workspace.count({ where: { ownerId: user.id } });
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slot: count + 1,
        apiKey: generateApiKey(),
        ownerId: user.id,
        providers: {
          create: [
            { type: "saweria", enabled: false },
            { type: "bagibagi", enabled: false },
            { type: "sociabuzz", enabled: false },
          ],
        },
      },
    });
    return res.status(201).json({ workspace });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
