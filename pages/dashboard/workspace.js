import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default function Workspace({ isSuperOwner, workspaces }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function createWorkspace() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) router.replace(router.asPath);
  }

  return (
    <Layout active="/dashboard/workspace" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div><h1>Workspace</h1><div className="page-sub">Setiap workspace punya API key dan konfigurasi provider sendiri</div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {workspaces.map((w) => (
          <div className="panel ws-card" key={w.id}>
            <div>
              <div className="ws-name">{w.name} {w.slot === 1 && <span className="ws-tag">UTAMA</span>}</div>
              <div className="ws-meta">Slot {w.slot}</div>
              <div className="ws-key">{w.apiKey}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="panel" style={{ maxWidth: 420, marginTop: 8 }}>
        <div className="form-row">
          <label>Nama workspace baru</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Golden City RP" />
        </div>
        <button className="btn" onClick={createWorkspace} disabled={busy}>+ Workspace Baru</button>
      </div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);
  const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id }, orderBy: { slot: "asc" } });

  return { props: { isSuperOwner: user.isSuperOwner, workspaces: JSON.parse(JSON.stringify(workspaces)) } };
}
