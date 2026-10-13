import { prisma } from "../../../../lib/prisma";
import {
  requireWorkspaceOwner, requireJson, validateChanges, validateConfig, toCfg, publicConfig,
  loadBoard, applyChanges, probe, encryptSecret, sendError,
} from "../../../../lib/board";

export const config = { maxDuration: 30 };

// GET    -> daftar board (+ status koneksi)
// PUT    -> simpan koneksi Open Cloud { universeId, topStoreName, nameStoreName, apiKey }
// DELETE -> putuskan koneksi
// POST   -> simpan perubahan { edits, adds, deletes }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const ctx = await requireWorkspaceOwner(req, res);
  if (!ctx) return;
  const workspaceId = ctx.workspace.id;

  try {
    const row = await prisma.boardConfig.findUnique({ where: { workspaceId } });

    if (req.method === "GET") {
      if (!row) return res.status(200).json({ configured: false });
      const board = await loadBoard(toCfg(row));
      return res.status(200).json({ configured: true, config: publicConfig(row), ...board });
    }

    if (req.method === "PUT") {
      if (!requireJson(req, res)) return;
      const v = validateConfig(req.body, row);
      if (v.error) return res.status(400).json({ error: "invalid_config", message: v.error });
      const cfg = {
        universeId: v.value.universeId,
        topStore: v.value.topStore,
        nameStore: v.value.nameStore,
        apiKey: v.value.apiKey || toCfg(row).apiKey,
      };
      await probe(cfg); // tes koneksi sebelum disimpan
      const data = {
        universeId: cfg.universeId,
        topStoreName: cfg.topStore,
        nameStoreName: cfg.nameStore || null,
        apiKeyEnc: v.value.apiKey ? encryptSecret(v.value.apiKey) : row.apiKeyEnc,
      };
      const saved = await prisma.boardConfig.upsert({
        where: { workspaceId },
        update: data,
        create: { workspaceId, ...data },
      });
      return res.status(200).json({ ok: true, config: publicConfig(saved) });
    }

    if (req.method === "DELETE") {
      if (row) await prisma.boardConfig.delete({ where: { workspaceId } });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      if (!requireJson(req, res)) return;
      if (!row) return res.status(400).json({ error: "not_configured", message: "Koneksi Open Cloud belum diatur" });
      const v = validateChanges(req.body);
      if (v.errors.length) return res.status(400).json({ error: "invalid_changes", errors: v.errors });
      const cfg = toCfg(row);
      const result = await applyChanges(cfg, v.changes);
      const board = await loadBoard(cfg);
      return res.status(200).json({ ok: true, ...result, ...board });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (err) {
    return sendError(res, err);
  }
}
