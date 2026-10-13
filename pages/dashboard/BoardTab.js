import { useCallback, useEffect, useMemo, useState } from "react";

const MAX_NAME = 45;
const MAX_TOTAL = 1_000_000_000_000;
const bytes = (s) => new TextEncoder().encode(s).length;
const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const keyOf = (s) => clean(s).replace(/[A-Z]/g, (c) => c.toLowerCase());
const fmt = (n) => Number(n).toLocaleString("id-ID");

function checkName(raw) {
  const name = clean(raw);
  if (!name) return { error: "Nama tidak boleh kosong" };
  if (bytes(name) > MAX_NAME) return { error: `Nama terlalu panjang (maksimal ${MAX_NAME} karakter)` };
  return { name };
}
function checkTotal(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,13}$/.test(s)) return { error: "Total harus bilangan bulat 0 atau lebih" };
  const n = Number(s);
  if (n > MAX_TOTAL) return { error: "Total terlalu besar" };
  return { total: n };
}

const REASON = {
  conflict: "total sudah berubah di game (data dimuat ulang)",
  missing: "entri sudah tidak ada",
  exists: "nama sudah dipakai entri lain",
};

async function api(workspaceId, method, body) {
  const res = await fetch(`/api/workspaces/${workspaceId}/board`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data: data || {} };
}

const toRows = (entries) =>
  entries.map((e) => ({ uid: e.key, key: e.key, origName: e.name, origTotal: e.total, name: e.name, total: e.total }));

export default function BoardTab({ workspaceId }) {
  const [phase, setPhase] = useState("loading");
  const [loadErr, setLoadErr] = useState("");
  const [meta, setMeta] = useState(null);
  const [base, setBase] = useState([]);
  const [rows, setRows] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("d");
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [setup, setSetup] = useState(false);
  const [form, setForm] = useState({ universeId: "", topStoreName: "", nameStoreName: "", apiKey: "" });
  const [setupErr, setSetupErr] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const applyData = useCallback((d) => {
    setMeta({ configured: d.configured !== false, config: d.config || null, warnings: d.warnings || [] });
    setBase(d.entries || []);
    setRows(toRows(d.entries || []));
    setRemoved([]);
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    const r = await api(workspaceId, "GET");
    if (r.ok) {
      applyData(r.data);
      if (r.data.config) setForm((f) => ({ ...f, universeId: r.data.config.universeId, topStoreName: r.data.config.topStoreName, nameStoreName: r.data.config.nameStoreName, apiKey: "" }));
      setPhase("ready");
    } else {
      setLoadErr(r.data.message || "Gagal memuat board");
      setPhase("error");
    }
  }, [workspaceId, applyData]);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(
    () => removed.length > 0 || rows.some((r) => r.key === null || r.name !== r.origName || r.total !== r.origTotal),
    [rows, removed]
  );

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const a = rows.filter((r) => !s || r.name.toLowerCase().includes(s));
    a.sort((x, y) => (sort === "n" ? x.name.localeCompare(y.name) : sort === "a" ? x.total - y.total : y.total - x.total));
    return a;
  }, [rows, q, sort]);

  function openModal(mode, row) {
    setModal({ mode, uid: row?.uid || null, name: row?.name || "", total: row ? String(row.total) : "0", err: "" });
  }
  function submitModal() {
    const n = checkName(modal.name), t = checkTotal(modal.total);
    if (n.error || t.error) return setModal({ ...modal, err: n.error || t.error });
    const k = keyOf(n.name);
    if (rows.some((r) => r.uid !== modal.uid && keyOf(r.name) === k)) return setModal({ ...modal, err: "Nama sudah ada di board" });
    if (modal.mode === "add") {
      setRows([...rows, { uid: "new-" + Date.now(), key: null, origName: null, origTotal: null, name: n.name, total: t.total }]);
    } else {
      setRows(rows.map((r) => (r.uid === modal.uid ? { ...r, name: n.name, total: t.total } : r)));
    }
    setModal(null);
    setMsg(null);
  }
  function confirmDelete() {
    if (del.key !== null) setRemoved([...removed, { key: del.key, orig: del.origTotal }]);
    setRows(rows.filter((r) => r.uid !== del.uid));
    setDel(null);
    setMsg(null);
  }
  function discard() {
    setRows(toRows(base));
    setRemoved([]);
    setMsg(null);
  }

  async function save() {
    const changes = {
      edits: rows.filter((r) => r.key !== null && (r.name !== r.origName || r.total !== r.origTotal)).map((r) => ({ key: r.key, orig: r.origTotal, name: r.name, total: r.total })),
      adds: rows.filter((r) => r.key === null).map((r) => ({ name: r.name, total: r.total })),
      deletes: removed,
    };
    setSaving(true);
    setMsg(null);
    const r = await api(workspaceId, "POST", changes);
    setSaving(false);
    if (!r.ok) {
      const lines = r.data.errors || [];
      return setMsg({ kind: "bad", text: r.data.message || (lines.length ? "Perubahan tidak valid:" : "Gagal menyimpan"), lines });
    }
    const d = r.data;
    applyData({ ...d, configured: true, config: meta?.config });
    const lines = [
      ...(d.rejected || []).map((x) => `"${x.ref}" ditolak: ${REASON[x.reason] || x.reason}`),
      ...(d.failed || []).map((x) => `"${x.ref}" gagal: ${x.message}`),
      ...(d.warnings || []),
    ];
    const problem = (d.rejected || []).length + (d.failed || []).length > 0;
    setMsg({ kind: problem ? "warn" : "ok", text: `${d.applied} perubahan tersimpan ke DataStore`, lines });
  }

  async function saveSetup() {
    setSetupBusy(true);
    setSetupErr("");
    const r = await api(workspaceId, "PUT", form);
    setSetupBusy(false);
    if (!r.ok) return setSetupErr(r.data.message || "Gagal menyimpan koneksi");
    setSetup(false);
    await load();
  }
  async function disconnect() {
    if (!window.confirm("Putuskan koneksi DataStore? Data di game tidak dihapus.")) return;
    await api(workspaceId, "DELETE");
    setSetup(false);
    setForm({ universeId: "", topStoreName: "", nameStoreName: "", apiKey: "" });
    await load();
  }

  if (phase === "loading") return <div className="panel empty-note">Memuat board…</div>;
  if (phase === "error")
    return (
      <div className="panel">
        <div className="field-err" style={{ marginBottom: 12 }}>{loadErr}</div>
        <div className="btn-row">
          <button className="btn ghost" onClick={load}>Coba lagi</button>
          <button className="btn ghost" onClick={() => { setPhase("ready"); setMeta({ configured: true, config: null, warnings: [] }); setSetup(true); }}>Ubah koneksi</button>
        </div>
      </div>
    );

  if (!meta?.configured || setup) {
    const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const hasKey = Boolean(meta?.config?.hasKey);
    return (
      <div className="panel" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="panel-title">Hubungkan DataStore game</div>
        <p className="key-hint" style={{ marginBottom: 16 }}>
          Board membaca dan mengubah DataStore game lewat Roblox Open Cloud. API key disimpan terenkripsi dan tidak akan ditampilkan lagi.
        </p>
        <div className="form-row"><label htmlFor="bu">Universe ID</label><input id="bu" inputMode="numeric" value={form.universeId} onChange={f("universeId")} placeholder="mis. 1234567890" /></div>
        <div className="form-row"><label htmlFor="bt">Nama OrderedDataStore (total donasi)</label><input id="bt" value={form.topStoreName} onChange={f("topStoreName")} /></div>
        <div className="form-row"><label htmlFor="bn">Nama DataStore nama (opsional)</label><input id="bn" value={form.nameStoreName} onChange={f("nameStoreName")} /></div>
        <div className="form-row"><label htmlFor="bk">API key Open Cloud</label><input id="bk" type="password" autoComplete="off" value={form.apiKey} onChange={f("apiKey")} placeholder={hasKey ? "Kosongkan untuk tetap memakai key lama" : ""} /></div>
        {setupErr && <div className="field-err" style={{ marginBottom: 12 }}>{setupErr}</div>}
        <div className="btn-row">
          <button className="btn" disabled={setupBusy} onClick={saveSetup}>{setupBusy ? "Menguji koneksi…" : "Simpan dan tes koneksi"}</button>
          {meta?.configured && <button className="btn ghost" onClick={() => setSetup(false)}>Batal</button>}
          {hasKey && <button className="btn danger" onClick={disconnect}>Putuskan</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div className="panel-title" style={{ marginBottom: 4 }}>Board donatur</div>
          <span className="key-hint" style={{ margin: 0 }}>Total donasi per pemain yang tersimpan di DataStore map ini.</span>
        </div>
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => setSetup(true)}>Koneksi</button>
          <button className="btn small" onClick={() => openModal("add")}>+ Tambah</button>
        </div>
      </div>

      <div className="tools">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama" aria-label="Cari nama" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan">
          <option value="d">Total tertinggi</option>
          <option value="a">Total terendah</option>
          <option value="n">Nama A-Z</option>
        </select>
      </div>

      {shown.length === 0 && (
        <p className="empty-note" style={{ textAlign: "center", padding: "20px 0" }}>
          {rows.length === 0 ? "Belum ada data. Klik Tambah untuk membuat entri pertama." : "Tidak ada nama yang cocok."}
        </p>
      )}
      {shown.map((r) => {
        const changed = r.key !== null && (r.name !== r.origName || r.total !== r.origTotal);
        return (
          <div className="item" key={r.uid}>
            <div className="avatar" style={{ borderRadius: 12 }}>{(r.name[0] || "?").toUpperCase()}</div>
            <div className="m">
              <b>{r.name}</b>
              <span>{r.key === null ? "Baru, belum disimpan" : changed ? "Diubah, belum disimpan" : "Total donasi"}</span>
            </div>
            <div className="amt">{fmt(r.total)}</div>
            <button className="btn ghost small" onClick={() => openModal("edit", r)}>Edit</button>
            <button className="btn danger small" onClick={() => setDel(r)}>Hapus</button>
          </div>
        );
      })}

      <div className={"statusbar" + (dirty ? " dirty" : "")}>
        <span className="key-hint" style={{ margin: 0 }}>{dirty ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}</span>
        <div className="btn-row">
          <button className="btn ghost small" disabled={!dirty || saving} onClick={discard}>Batalkan</button>
          <button className="btn small" disabled={!dirty || saving} onClick={save}>{saving ? "Menyimpan…" : "Simpan ke DataStore"}</button>
        </div>
      </div>

      {msg && (
        <div className={"msg " + msg.kind}>
          <div>{msg.text}</div>
          {msg.lines?.map((l, i) => <div key={i}>• {l}</div>)}
        </div>
      )}
      {!msg && meta?.warnings?.map((w, i) => <div key={i} className="msg warn">{w}</div>)}

      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="panel left" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">{modal.mode === "add" ? "Tambah entri" : "Edit entri"}</div>
            <div className="form-row"><label htmlFor="mn">Nama pemain</label><input id="mn" autoFocus value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value, err: "" })} /></div>
            <div className="form-row"><label htmlFor="mt">Total (IDR)</label><input id="mt" inputMode="numeric" value={modal.total} onChange={(e) => setModal({ ...modal, total: e.target.value, err: "" })} /></div>
            {modal.err && <div className="field-err">{modal.err}</div>}
            <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>Batal</button>
              <button className="btn" onClick={submitModal}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {del && (
        <div className="overlay" onClick={() => setDel(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">Hapus entri?</div>
            <p className="key-hint" style={{ marginBottom: 20 }}>Entri {del.name} (Rp {fmt(del.total)}) akan dihapus dari board setelah kamu klik Simpan.</p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn ghost" onClick={() => setDel(null)}>Batal</button>
              <button className="btn danger" onClick={confirmDelete}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
