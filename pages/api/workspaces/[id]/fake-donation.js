import { prisma } from "../../../../lib/prisma";
import { getSession, upsertUserFromSession } from "../../../../lib/auth";

// POST body: { "username": "builderman", "amount": 10000, "message": "..." }
// Bikin donasi dummy langsung di database, buat tes pipeline ujung-ke-ujung
// (web -> Roblox) tanpa perlu donasi asli dari Saweria/Bagi-Bagi.
export default async function handler(req, res) {
  const session = await getSession(req, res);
  if (!session) return res.status(401).json({ error: "unauthorized" });
  const user = await upsertUserFromSession(session);

  const { id: workspaceId } = req.query;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.ownerId !== user.id) {
    return res.status(404).json({ error: "workspace_not_found" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { username, amount, message } = req.body;
  if (!username || !amount) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const donation = await prisma.donation.create({
    data: {
      donorName: username,
      amount: Number(amount),
      message: message || null,
      provider: "test",
      status: "pending",
      workspaceId,
    },
  });

  return res.status(201).json({ donation });
}
