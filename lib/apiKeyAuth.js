import { prisma } from "./prisma";

// Dipakai oleh endpoint yang dipanggil dari Roblox Studio (HttpService).
// Roblox kirim header: x-api-key: gld_live_xxxxxxxx
export async function requireWorkspaceByApiKey(req, res) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    res.status(401).json({ error: "missing_api_key" });
    return null;
  }
  const workspace = await prisma.workspace.findUnique({ where: { apiKey } });
  if (!workspace || workspace.archived) {
    res.status(401).json({ error: "invalid_api_key" });
    return null;
  }
  return workspace;
}
