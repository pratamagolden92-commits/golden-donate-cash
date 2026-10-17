import { prisma } from "../../../../lib/prisma";
import { requireWorkspaceOwner, requireJson } from "../../../../lib/board";
import { validateSettings } from "../../../../lib/settings";

// GET -> pengaturan tersimpan (atau configured:false). PUT -> simpan pengaturan baru.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const ctx = await requireWorkspaceOwner(req, res);
  if (!ctx) return;
  const workspaceId = ctx.workspace.id;

  try {
    if (req.method === "GET") {
      const row = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
      if (!row) return res.status(200).json({ configured: false });
      return res.status(200).json({ configured: true, settings: row.data, version: row.version, updatedAt: row.updatedAt });
    }

    if (req.method === "PUT") {
      if (!requireJson(req, res)) return;
      const v = validateSettings(req.body);
      if (v.errors.length) return res.status(400).json({ error: "invalid_settings", errors: v.errors });
      const row = await prisma.workspaceSettings.upsert({
        where: { workspaceId },
        update: { data: v.value, version: { increment: 1 } },
        create: { workspaceId, data: v.value },
      });
      return res.status(200).json({ ok: true, version: row.version, updatedAt: row.updatedAt });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (err) {
    console.error("settings error:", err?.message);
    return res.status(500).json({ error: "server_error" });
  }
}
