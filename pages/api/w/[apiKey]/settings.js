import { prisma } from "../../../../lib/prisma";

// Dipanggil server game (Roblox) tiap ±60 detik.
// Response: { ok, configured, version, settings }. Tidak berisi rahasia, hanya pengaturan efek.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    const { apiKey } = req.query;
    const workspace = await prisma.workspace.findUnique({ where: { apiKey: String(apiKey || "") } });
    if (!workspace || workspace.archived) return res.status(401).json({ ok: false, error: "invalid_api_key" });

    const row = await prisma.workspaceSettings.findUnique({ where: { workspaceId: workspace.id } });
    if (!row) return res.status(200).json({ ok: true, configured: false });
    return res.status(200).json({ ok: true, configured: true, version: row.version, settings: row.data });
  } catch (err) {
    console.error("game settings error:", err?.message);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
