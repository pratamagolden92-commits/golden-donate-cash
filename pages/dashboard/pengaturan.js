import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

// Nilai bawaan = nilai yang sekarang ada di script game
const DEFAULTS = {
  effects: {
    nuke: { enabled: true, min: "100" },
    hammer: { enabled: true, min: "2000" },
    blackHole: { enabled: true, min: "3000" },
  },
  levels: [
    { enabled: true, min: "1" },
    { enabled: true, min: "2000" },
    { enabled: true, min: "3000" },
    { enabled: true, min: "5000" },
  ],
  defaultMessage: "Terima kasih banyak atas dukungannya!",
};
const EFFECTS = [
  ["nuke", "Nuke"],
  ["hammer", "Hammer"],
  ["blackHole", "Black Hole"],
];

const toForm = (s) => ({
  effects: Object.fromEntries(EFFECTS.map(([k]) => [k, { enabled: s.effects[k].enabled, min: String(s.effects[k].min) }])),
  levels: s.levels.map((l) => ({ enabled: l.enabled, min: String(l.min) })),
  defaultMessage: s.defaultMessage || "",
});

function checkMin(v) {
  const s = String(v).trim();
  if (!/^\d{1,10}$/.test(s)) return "harus bilangan bulat";
  const n = Number(s);
  return n < 1 || n > 1_000_000_000 ? "harus antara 1 dan 1.000.000.000" : "";
}

function Row({ label, hint, value, onChange }) {
  const err = checkMin(value.min);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 56px", gap: 12, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
      <div>
        <b>{label}</b>
        {hint && <div className="key-hint" style={{ margin: 0 }}>{hint}</div>}
        {err && <div className="field-err">{err}</div>}
      </div>
      <input aria-label={`Batas jumlah ${label}`} inputMode="numeric" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} />
      <label className="switch" aria-label={`Aktifkan ${label}`}>
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        <span className="slider" />
      </label>
    </div>
  );
}

export default function Pengaturan({ isSuperOwner, workspaceId }) {
  const [form, setForm] = useState(toForm(DEFAULTS));
  const [phase, setPhase] = useState("loading");
  const [saved, setSaved] = useState(null); // null = belum pernah disimpan
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      try {
        const r = await fetch(`/api/workspaces/${workspaceId}/settings`);
        const d = await r.json();
        if (!r.ok) throw new Error();
        if (d.configured) { setForm(toForm(d.settings)); setSaved(d.version); }
        setPhase("ready");
      } catch { setPhase("error"); }
    })();
  }, [workspaceId]);

  const hasError = [...EFFECTS.map(([k]) => form.effects[k].min), ...form.levels.map((l) => l.min)].some((v) => checkMin(v));

  async function save() {
    setSaving(true);
    setMsg(null);
    const body = {
      effects: Object.fromEntries(EFFECTS.map(([k]) => [k, { enabled: form.effects[k].enabled, min: form.effects[k].min.trim() }])),
      levels: form.levels.map((l) => ({ enabled: l.enabled, min: l.min.trim() })),
      defaultMessage: form.defaultMessage,
    };
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) setMsg({ kind: "bad", text: (d.errors || ["Gagal menyimpan"]).join(". ") });
      else { setSaved(d.version); setMsg({ kind: "ok", text: "Tersimpan. Game menerapkannya dalam sekitar 60 detik, tanpa publish ulang." }); }
    } catch { setMsg({ kind: "bad", text: "Gagal menyimpan, coba lagi" }); }
    setSaving(false);
  }

  return (
    <Layout active="/dashboard/pengaturan" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <div className="page-sub">Atur efek donasi dari sini, tanpa membuka Roblox Studio</div>
        </div>
      </div>

      {!workspaceId && <div className="panel empty-note">Workspace belum tersedia.</div>}
      {workspaceId && phase === "loading" && <div className="panel empty-note">Memuat pengaturan…</div>}
      {workspaceId && phase === "error" && <div className="panel field-err">Gagal memuat pengaturan. Muat ulang halaman.</div>}

      {workspaceId && phase === "ready" && (
        <>
          {saved === null && (
            <div className="msg warn" style={{ marginBottom: 16 }}>
              Belum pernah disimpan. Game masih memakai nilai bawaan di script, dan nilai di bawah ini sama dengan nilai itu.
            </div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title">Efek besar</div>
            <p className="key-hint" style={{ marginTop: 0 }}>
              Satu donasi memicu satu efek. Urutannya Black Hole, lalu Hammer, lalu Nuke: kalau jumlah donasi memenuhi batas Black Hole, efek itu yang dipakai, dan seterusnya.
            </p>
            {EFFECTS.map(([k, label]) => (
              <Row key={k} label={label} hint="Aktif mulai jumlah (Rp)" value={form.effects[k]} onChange={(v) => setForm({ ...form, effects: { ...form.effects, [k]: v } })} />
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title">Level efek lingkungan</div>
            {form.levels.map((l, i) => (
              <Row key={i} label={`Level ${i + 1}`} hint="Aktif mulai jumlah (Rp)" value={l} onChange={(v) => setForm({ ...form, levels: form.levels.map((x, j) => (j === i ? v : x)) })} />
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title">Pesan bawaan</div>
            <p className="key-hint" style={{ marginTop: 0 }}>Dipakai kalau donatur tidak menulis pesan. Kosongkan untuk tetap memakai teks di script.</p>
            <input aria-label="Pesan bawaan" maxLength={200} value={form.defaultMessage} onChange={(e) => setForm({ ...form, defaultMessage: e.target.value })} />
          </div>

          <div className="statusbar">
            <span className="key-hint" style={{ margin: 0 }}>{saved === null ? "Belum disimpan" : `Versi tersimpan: ${saved}`}</span>
            <button className="btn" disabled={saving || hasError} onClick={save}>{saving ? "Menyimpan…" : "Simpan pengaturan"}</button>
          </div>
          {msg && <div className={"msg " + msg.kind}>{msg.text}</div>}
        </>
      )}
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);
  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });
  return { props: { isSuperOwner: user.isSuperOwner, workspaceId: workspace ? workspace.id : null } };
}
