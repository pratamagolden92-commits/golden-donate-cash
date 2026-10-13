// Logika server untuk Board donatur (fitur A).
// Hanya dipakai di API route (server). Jangan di-import dari komponen client.
import crypto from "crypto";
import { prisma } from "./prisma";
import { getSession, upsertUserFromSession } from "./auth";

/* ======================= Validasi ======================= */
export const MAX_NAME_BYTES = 45; // sama dengan batas key di script game
export const MAX_TOTAL = 1_000_000_000_000;
export const MAX_OPS = 200;

const bytes = (s) => new TextEncoder().encode(s).length;

export function cleanName(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Huruf besar ASCII saja yang dikecilkan, sama seperti string.lower() di Lua
export function toKey(name) {
  return cleanName(name).replace(/[A-Z]/g, (c) => c.toLowerCase());
}
export function checkName(raw) {
  const name = cleanName(raw);
  if (!name) return { error: "Nama tidak boleh kosong" };
  if (bytes(name) > MAX_NAME_BYTES) return { error: `Nama terlalu panjang (maksimal ${MAX_NAME_BYTES} karakter)` };
  return { name };
}
export function checkTotal(raw) {
  const s = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
  if (!/^\d{1,13}$/.test(s)) return { error: "Total harus bilangan bulat 0 atau lebih" };
  const n = Number(s);
  if (n > MAX_TOTAL) return { error: "Total terlalu besar" };
  return { total: n };
}
const okKey = (k) => typeof k === "string" && k.length > 0 && bytes(k) <= MAX_NAME_BYTES && !/[\u0000-\u001f\u007f]/.test(k);
const okOrig = (v) => Number.isSafeInteger(v) && v >= 0;

// body: { edits:[{key,orig,name,total}], adds:[{name,total}], deletes:[{key,orig}] }
export function validateChanges(body) {
  const errors = [];
  const arr = (v) => (Array.isArray(v) ? v : []);
  const E = arr(body?.edits), A = arr(body?.adds), D = arr(body?.deletes);
  const n = E.length + A.length + D.length;
  if (n === 0) return { errors: ["Tidak ada perubahan untuk disimpan"] };
  if (n > MAX_OPS) return { errors: [`Maksimal ${MAX_OPS} perubahan sekali simpan`] };

  const edits = [], adds = [], deletes = [];
  const seenOrig = new Set(), seenNew = new Set();

  for (const d of D) {
    if (!okKey(d?.key) || !okOrig(d?.orig)) { errors.push("Data hapus tidak valid"); continue; }
    if (seenOrig.has(d.key)) { errors.push(`Entri "${d.key}" muncul dua kali`); continue; }
    seenOrig.add(d.key);
    deletes.push({ key: d.key, orig: d.orig });
  }
  for (const e of E) {
    if (!okKey(e?.key) || !okOrig(e?.orig)) { errors.push("Data edit tidak valid"); continue; }
    if (seenOrig.has(e.key)) { errors.push(`Entri "${e.key}" muncul dua kali`); continue; }
    const nm = checkName(e.name), tt = checkTotal(e.total);
    if (nm.error || tt.error) { errors.push(`${cleanName(e.name) || e.key}: ${nm.error || tt.error}`); continue; }
    seenOrig.add(e.key);
    const nk = toKey(nm.name);
    if (seenNew.has(nk)) { errors.push(`Nama kembar: ${nm.name}`); continue; }
    seenNew.add(nk);
    edits.push({ key: e.key, orig: e.orig, name: nm.name, total: tt.total });
  }
  for (const a of A) {
    const nm = checkName(a?.name), tt = checkTotal(a?.total);
    if (nm.error || tt.error) { errors.push(`${cleanName(a?.name) || "(tanpa nama)"}: ${nm.error || tt.error}`); continue; }
    const nk = toKey(nm.name);
    if (seenNew.has(nk)) { errors.push(`Nama kembar: ${nm.name}`); continue; }
    seenNew.add(nk);
    adds.push({ name: nm.name, total: tt.total });
  }
  return errors.length ? { errors } : { errors: [], changes: { edits, adds, deletes } };
}

// lookup: Map key -> total | null  (null = tidak ada di DataStore)
export function planSave(lookup, changes) {
  const ops = [], rejected = [];
  const freed = new Set(), claimed = new Set();
  const taken = (k) => claimed.has(k) || (lookup.get(k) != null && !freed.has(k));

  for (const d of changes.deletes) {
    const cur = lookup.get(d.key);
    if (cur == null) rejected.push({ ref: d.key, reason: "missing" });
    else if (cur !== d.orig) rejected.push({ ref: d.key, reason: "conflict" });
    else { ops.push({ type: "delete", key: d.key }); freed.add(d.key); }
  }
  for (const e of changes.edits) {
    const cur = lookup.get(e.key);
    if (cur == null) { rejected.push({ ref: e.name, reason: "missing" }); continue; }
    if (cur !== e.orig) { rejected.push({ ref: e.name, reason: "conflict" }); continue; }
    const nk = toKey(e.name);
    if (nk === e.key) { ops.push({ type: "update", key: e.key, total: e.total, name: e.name }); continue; }
    if (taken(nk)) { rejected.push({ ref: e.name, reason: "exists" }); continue; }
    claimed.add(nk); freed.add(e.key);
    ops.push({ type: "rename", fromKey: e.key, toKey: nk, total: e.total, name: e.name });
  }
  for (const a of changes.adds) {
    const k = toKey(a.name);
    if (taken(k)) { rejected.push({ ref: a.name, reason: "exists" }); continue; }
    claimed.add(k);
    ops.push({ type: "add", key: k, total: a.total, name: a.name });
  }
  return { ops, rejected };
}

/* ======================= Enkripsi key Open Cloud ======================= */
function secretKey() {
  const raw = process.env.BOARD_SECRET_KEY;
  if (!raw) throw Object.assign(new Error("board_secret_missing"), { code: "board_secret_missing" });
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw Object.assign(new Error("board_secret_invalid"), { code: "board_secret_invalid" });
  return buf;
}
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), enc].map((x) => (typeof x === "string" ? x : x.toString("base64"))).join(":");
}
export function decryptSecret(blob) {
  try {
    const [v, iv, tag, enc] = String(blob).split(":");
    if (v !== "v1") throw new Error("format");
    const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch (e) {
    if (e.code) throw e;
    throw Object.assign(new Error("board_key_unreadable"), { code: "board_key_unreadable" });
  }
}

/* ======================= Roblox Open Cloud ======================= */
export class OpenCloudError extends Error {
  constructor(status, detail) { super("opencloud_" + status); this.status = status; this.detail = detail; }
}
async function oc(cfg, method, path, { query, body } = {}) {
  const base = process.env.OPENCLOUD_BASE || "https://apis.roblox.com/cloud/v2/";
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      headers: { "x-api-key": cfg.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new OpenCloudError(res.status, text.slice(0, 200));
    try { return text ? JSON.parse(text) : null; } catch { return null; }
  } catch (e) {
    if (e.name === "AbortError") throw new OpenCloudError(504, "timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const enc = encodeURIComponent;
const oPath = (c, key) => `universes/${c.universeId}/ordered-data-stores/${enc(c.topStore)}/scopes/global/entries${key != null ? "/" + enc(key) : ""}`;
const nPath = (c, key) => `universes/${c.universeId}/data-stores/${enc(c.nameStore)}/entries${key != null ? "/" + enc(key) : ""}`;
const notFound = (e) => e instanceof OpenCloudError && e.status === 404;

export async function orderedList(cfg, size = 100) {
  const data = await oc(cfg, "GET", oPath(cfg), { query: { maxPageSize: String(size), orderBy: "value desc" } });
  const arr = Array.isArray(data?.orderedDataStoreEntries)
    ? data.orderedDataStoreEntries
    : Object.values(data || {}).find(Array.isArray) || [];
  return arr
    .map((e) => ({ key: e.id ?? decodeURIComponent(String(e.path || "").split("/").pop() || ""), total: Number(e.value) }))
    .filter((e) => e.key && Number.isFinite(e.total));
}
async function orderedGet(cfg, key) {
  try { const d = await oc(cfg, "GET", oPath(cfg, key)); const n = Number(d?.value); return Number.isFinite(n) ? n : null; }
  catch (e) { if (notFound(e)) return null; throw e; }
}
async function orderedCreate(cfg, key, total) {
  try { await oc(cfg, "POST", oPath(cfg), { query: { id: key }, body: { value: total } }); }
  catch (e) { if (e instanceof OpenCloudError && e.status === 409) throw Object.assign(new Error("exists"), { code: "exists" }); throw e; }
}
const orderedUpdate = (cfg, key, total) => oc(cfg, "PATCH", oPath(cfg, key), { body: { value: total } });
async function orderedDelete(cfg, key) { try { await oc(cfg, "DELETE", oPath(cfg, key)); } catch (e) { if (!notFound(e)) throw e; } }
async function nameGet(cfg, key) {
  try { const d = await oc(cfg, "GET", nPath(cfg, key)); return d?.value ?? null; }
  catch (e) { if (notFound(e)) return null; throw e; }
}
async function nameSet(cfg, key, name) {
  try { await oc(cfg, "PATCH", nPath(cfg, key), { body: { value: name } }); }
  catch (e) { if (!notFound(e)) throw e; await oc(cfg, "POST", nPath(cfg), { query: { id: key }, body: { value: name } }); }
}
async function nameDelete(cfg, key) { try { await oc(cfg, "DELETE", nPath(cfg, key)); } catch (e) { if (!notFound(e)) throw e; } }

export async function probe(cfg) {
  await orderedList(cfg, 1);
  if (cfg.nameStore) await oc(cfg, "GET", nPath(cfg), { query: { maxPageSize: "1" } });
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

function errText(e) {
  if (e?.code === "exists") return "Nama sudah ada di DataStore";
  if (e instanceof OpenCloudError) {
    if (e.status === 401 || e.status === 403) return "Izin API key Open Cloud kurang";
    if (e.status === 429) return "Terlalu banyak request, coba lagi sebentar";
    return `Roblox menolak (kode ${e.status})`;
  }
  return "Gagal menyimpan";
}

export async function loadBoard(cfg) {
  const rows = await orderedList(cfg, 100);
  const names = {};
  let canWriteNames = Boolean(cfg.nameStore);
  const warnings = [];
  if (cfg.nameStore) {
    await pool(rows, 10, async (r) => {
      let v = null;
      try { v = await nameGet(cfg, r.key); }
      catch (e) { if (e instanceof OpenCloudError && (e.status === 401 || e.status === 403)) throw e; }
      if (typeof v === "string" && v.trim()) names[r.key] = v;
      else if (v && typeof v === "object") {
        const s = v.name ?? v.displayName ?? v.username;
        if (typeof s === "string" && s) names[r.key] = s;
        canWriteNames = false;
      }
    });
    if (!canWriteNames) warnings.push("Store nama menyimpan data bukan teks biasa, jadi perubahan nama tidak ditulis ke store nama.");
  }
  return { entries: rows.map((r) => ({ key: r.key, name: names[r.key] || r.key, total: r.total })), canWriteNames, warnings };
}

async function writeName(cfg, key, name, fromKey, out) {
  try {
    const cur = await nameGet(cfg, fromKey ?? key);
    if (cur != null && typeof cur !== "string") { out.warnings.push(`Nama "${name}" tidak ditulis ke store nama (formatnya berbeda).`); return; }
    await nameSet(cfg, key, name);
  } catch { out.warnings.push(`Nama "${name}" tersimpan di board tapi gagal ditulis ke store nama.`); }
}
async function dropName(cfg, key, out) {
  try { await nameDelete(cfg, key); } catch { out.warnings.push(`Gagal membersihkan store nama untuk "${key}".`); }
}

async function runOp(cfg, op, out) {
  const nm = Boolean(cfg.nameStore);
  try {
    if (op.type === "delete") {
      await orderedDelete(cfg, op.key);
      if (nm) await dropName(cfg, op.key, out);
    } else if (op.type === "update") {
      await orderedUpdate(cfg, op.key, op.total);
      if (nm) await writeName(cfg, op.key, op.name, null, out);
    } else if (op.type === "add") {
      await orderedCreate(cfg, op.key, op.total);
      if (nm) await writeName(cfg, op.key, op.name, null, out);
    } else if (op.type === "rename") {
      await orderedCreate(cfg, op.toKey, op.total);
      try { await orderedDelete(cfg, op.fromKey); }
      catch (e) { await orderedDelete(cfg, op.toKey).catch(() => {}); throw e; }
      if (nm) { await writeName(cfg, op.toKey, op.name, op.fromKey, out); await dropName(cfg, op.fromKey, out); }
    }
    out.applied++;
  } catch (e) {
    out.failed.push({ ref: op.name || op.key || op.fromKey, message: errText(e) });
  }
}

export async function applyChanges(cfg, changes) {
  const keys = new Set([
    ...changes.edits.map((e) => e.key), ...changes.deletes.map((d) => d.key),
    ...changes.edits.map((e) => toKey(e.name)), ...changes.adds.map((a) => toKey(a.name)),
  ]);
  const list = [...keys];
  const vals = await pool(list, 8, (k) => orderedGet(cfg, k));
  const lookup = new Map(list.map((k, i) => [k, vals[i]]));

  const { ops, rejected } = planSave(lookup, changes);
  const out = { applied: 0, rejected, failed: [], warnings: [] };
  for (const type of ["delete", "update", "rename", "add"]) {
    await pool(ops.filter((o) => o.type === type), 6, (op) => runOp(cfg, op, out));
  }
  out.warnings = [...new Set(out.warnings)];
  return out;
}

/* ======================= Auth dan config ======================= */
export async function requireWorkspaceOwner(req, res) {
  const session = await getSession(req, res);
  if (!session) { res.status(401).json({ error: "unauthorized" }); return null; }
  const user = await upsertUserFromSession(session);
  if (!user) { res.status(401).json({ error: "unauthorized" }); return null; }
  const workspace = await prisma.workspace.findUnique({ where: { id: String(req.query.id || "") } });
  if (!workspace || workspace.ownerId !== user.id || workspace.archived) {
    res.status(404).json({ error: "workspace_not_found" });
    return null;
  }
  return { user, workspace };
}
export function requireJson(req, res) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    res.status(415).json({ error: "json_required" });
    return false;
  }
  return true;
}
export function toCfg(row) {
  return { universeId: row.universeId, topStore: row.topStoreName, nameStore: row.nameStoreName || "", apiKey: decryptSecret(row.apiKeyEnc) };
}
export function publicConfig(row) {
  return { universeId: row.universeId, topStoreName: row.topStoreName, nameStoreName: row.nameStoreName || "", hasKey: Boolean(row.apiKeyEnc), updatedAt: row.updatedAt };
}
const okStore = (s) => typeof s === "string" && s.length > 0 && s.length <= 50 && !/[\u0000-\u001f\u007f]/.test(s);
export function validateConfig(b, existing) {
  const universeId = String(b?.universeId ?? "").trim();
  const topStore = String(b?.topStoreName ?? "").trim();
  const nameStore = String(b?.nameStoreName ?? "").trim();
  const apiKey = String(b?.apiKey ?? "").trim();
  if (!/^\d{1,20}$/.test(universeId)) return { error: "Universe ID harus angka" };
  if (!okStore(topStore)) return { error: "Nama OrderedDataStore wajib diisi (maksimal 50 karakter)" };
  if (nameStore && !okStore(nameStore)) return { error: "Nama DataStore nama tidak valid" };
  if (!apiKey && !existing) return { error: "API key Open Cloud wajib diisi" };
  if (apiKey && (apiKey.length < 20 || apiKey.length > 4000 || /\s/.test(apiKey))) return { error: "Format API key tidak valid" };
  return { value: { universeId, topStore, nameStore, apiKey } };
}

export function sendError(res, err) {
  if (err?.code === "board_secret_missing") return res.status(503).json({ error: err.code, message: "BOARD_SECRET_KEY belum diisi di Vercel" });
  if (err?.code === "board_secret_invalid") return res.status(503).json({ error: err.code, message: "BOARD_SECRET_KEY harus 32 byte (base64 atau hex 64 karakter)" });
  if (err?.code === "board_key_unreadable") return res.status(409).json({ error: err.code, message: "API key tersimpan tidak bisa dibaca, isi ulang di pengaturan koneksi" });
  if (err instanceof OpenCloudError) {
    if (err.status === 401 || err.status === 403) return res.status(502).json({ error: "opencloud_forbidden", message: "API key Open Cloud ditolak atau izinnya kurang" });
    if (err.status === 404) return res.status(502).json({ error: "opencloud_not_found", message: "Universe ID atau nama store tidak ditemukan" });
    if (err.status === 429) return res.status(429).json({ error: "opencloud_rate_limited", message: "Terlalu banyak request ke Roblox, coba lagi sebentar" });
    return res.status(502).json({ error: "opencloud_error", message: `Roblox membalas dengan kode ${err.status}` });
  }
  console.error("board error:", err?.message);
  return res.status(500).json({ error: "server_error" });
}
