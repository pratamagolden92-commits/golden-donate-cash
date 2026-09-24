import { useState } from "react";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default function ApiKeyPage({ isSuperOwner, apiKey: initialKey, workspaceId, createdAt }) {
  const [apiKey, setApiKey] = useState(initialKey);
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    if (!confirm("API key lama akan langsung berhenti berfungsi. Lanjutkan?")) return;
    setBusy(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/regenerate-key`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setApiKey(data.apiKey);
  }

  return (
    <Layout active="/dashboard/api-key" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div><h1>API Key</h1><div className="page-sub">Dipakai Roblox Studio untuk mengambil data donasi workspace ini</div></div>
      </div>
      <div className="panel">
        <div className="key-box">
          <div>
            <div className="key-value">{apiKey}</div>
            <div className="key-hint">Dibuat {new Date(createdAt).toLocaleDateString("id-ID")}</div>
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => navigator.clipboard.writeText(apiKey)}>Salin</button>
            <button className="btn danger" onClick={regenerate} disabled={busy}>Buat Ulang</button>
          </div>
        </div>
        <div className="empty-note">
          Tempel key ini di ModuleScript sistem donasi kamu di Roblox Studio, dikirim lewat header{" "}
          <code>x-api-key</code>. Jangan bagikan key ini ke orang lain.
        </div>
      </div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);

  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });

  return {
    props: {
      isSuperOwner: user.isSuperOwner,
      apiKey: workspace?.apiKey || "",
      workspaceId: workspace?.id || null,
      createdAt: workspace?.createdAt?.toISOString() || new Date().toISOString(),
    },
  };
}
