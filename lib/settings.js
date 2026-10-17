// Validasi pengaturan efek (fitur 1). Dipakai di API route (server).
const MAX_MIN = 1_000_000_000;
const MAX_MESSAGE = 200;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exactKeys = (o, keys) => isObj(o) && Object.keys(o).length === keys.length && keys.every((k) => k in o);
const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export const EFFECT_NAMES = { nuke: "Nuke", hammer: "Hammer", blackHole: "Black Hole" };

function parseMin(raw) {
  const s = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
  if (!/^\d{1,10}$/.test(s)) return { error: "batas jumlah harus bilangan bulat" };
  const n = Number(s);
  if (n < 1 || n > MAX_MIN) return { error: "batas jumlah harus antara 1 dan 1.000.000.000" };
  return { value: n };
}

export function validateSettings(b) {
  if (!exactKeys(b, ["effects", "levels", "defaultMessage"])) return { errors: ["Format pengaturan tidak valid"] };
  if (!exactKeys(b.effects, Object.keys(EFFECT_NAMES))) return { errors: ["Format efek tidak valid"] };

  const errors = [];
  const out = { effects: {}, levels: [], defaultMessage: "" };

  for (const k of Object.keys(EFFECT_NAMES)) {
    const e = b.effects[k];
    if (!exactKeys(e, ["enabled", "min"]) || typeof e.enabled !== "boolean") { errors.push(`${EFFECT_NAMES[k]}: data tidak valid`); continue; }
    const m = parseMin(e.min);
    if (m.error) { errors.push(`${EFFECT_NAMES[k]}: ${m.error}`); continue; }
    out.effects[k] = { enabled: e.enabled, min: m.value };
  }

  if (!Array.isArray(b.levels) || b.levels.length !== 4) {
    errors.push("Level effect harus berisi 4 baris");
  } else {
    b.levels.forEach((l, i) => {
      if (!exactKeys(l, ["enabled", "min"]) || typeof l.enabled !== "boolean") { errors.push(`Level ${i + 1}: data tidak valid`); return; }
      const m = parseMin(l.min);
      if (m.error) { errors.push(`Level ${i + 1}: ${m.error}`); return; }
      out.levels.push({ enabled: l.enabled, min: m.value });
    });
  }

  if (typeof b.defaultMessage !== "string") errors.push("Pesan bawaan harus berupa teks");
  else {
    const msg = clean(b.defaultMessage);
    if (msg.length > MAX_MESSAGE) errors.push(`Pesan bawaan maksimal ${MAX_MESSAGE} karakter`);
    out.defaultMessage = msg;
  }

  return errors.length ? { errors } : { errors: [], value: out };
}
