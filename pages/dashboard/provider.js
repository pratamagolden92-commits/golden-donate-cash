import { useState } from "react";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const LABELS = { saweria: "Saweria", bagibagi: "Bagi-Bagi", sociabuzz: "Sociabuzz" };

export default function Provider({ isSuperOwner, workspaceId, providers: initial, baseUrl, apiKey }) {
  const [providers, setProviders] = useState(initial);
  const [saving, setSaving] = useState(null);

  async function save(type, patch) {
    setSaving(type);
    const res = await fetch(`/api/workspaces/${workspaceId}/providers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...patch }),
    });
    const data = await res.json();
    setSaving(null);
    if (res.ok) {
      setProviders((prev) => prev.map((p) => (p.type === type ? data.provider : p)));
    }
  }

  return (
    <Layout active="/dashboard/provider" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div><h1>Provider</h1><div className="page-sub">Hubungkan sumber donasi cash kamu ke workspace ini</div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {providers.map((p) => (
          <div className="panel" key={p.type}>
            <div className="provider-card-head">
              <h3>{LABELS[p.type]}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={"status-pill" + (p.enabled ? " on" : "")}>
                  {p.enabled ? "Aktif" : "Nonaktif"}
                </span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => save(p.type, { enabled: e.target.checked })}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            {p.type === "saweria" && (
              <div className="form-row" style={{ marginTop: 16 }}>
                <label>Stream Key</label>
                <input
                  type="password"
                  defaultValue={p.streamKey || ""}
                  onBlur={(e) => save(p.type, { streamKey: e.target.value })}
                  placeholder="Stream key dari dashboard Saweria kamu"
                />
              </div>
            )}

            <div className="form-row">
              <label>Webhook URL</label>
              <div className="webhook-box">
                <input
                  readOnly
                  value={
                    p.type === "saweria"
                      ? `${baseUrl}/api/w/${apiKey}/saweria`
                      : `${baseUrl}/api/webhook/${p.type}/${p.webhookToken}`
                  }
                />
                <button
                  className="btn ghost"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      p.type === "saweria"
                        ? `${baseUrl}/api/w/${apiKey}/saweria`
                        : `${baseUrl}/api/webhook/${p.type}/${p.webhookToken}`
                    )
                  }
                >
                  Salin
                </button>
              </div>
              <div className="empty-note">Tempel URL ini ke pengaturan webhook di {LABELS[p.type]}.</div>
            </div>
            {saving === p.type && <div className="empty-note">Menyimpan...</div>}
          </div>
        ))}
      </div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);

  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    include: { providers: true },
  });

  const proto = ctx.req.headers["x-forwarded-proto"] || "http";
  const baseUrl = `${proto}://${ctx.req.headers.host}`;

  return {
    props: {
      isSuperOwner: user.isSuperOwner,
      workspaceId: workspace?.id || null,
      providers: JSON.parse(JSON.stringify(workspace?.providers || [])),
      baseUrl,
      apiKey: workspace?.apiKey || "",
    },
  };
}
