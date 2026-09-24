import { useState } from "react";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function formatIDR(n) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function AdminPanel({ workspaces: initial }) {
  const [workspaces, setWorkspaces] = useState(initial);

  async function revoke(id) {
    if (!confirm("Cabut akses workspace ini? Roblox Studio-nya akan langsung berhenti bisa mengambil data.")) return;
    const res = await fetch(`/api/admin/workspaces/${id}/revoke`, { method: "POST" });
    if (res.ok) {
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, archived: true } : w)));
    }
  }

  const totalMap = workspaces.length;
  const totalAktif = workspaces.filter((w) => !w.archived).length;
  const totalDonasi = workspaces.reduce((s, w) => s + w.totalDonasi, 0);

  return (
    <Layout active="/admin" isSuperOwner={true}>
      <div className="page-head">
        <div><h1>Panel Admin</h1><div className="page-sub">Semua map yang menggunakan sistem Golden Donate Cash</div></div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">TOTAL MAP TERDAFTAR</div>
          <div className="stat-value">{totalMap}</div>
          <div className="stat-note">{totalAktif} aktif &middot; {totalMap - totalAktif} nonaktif</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TOTAL DONASI SEMUA MAP</div>
          <div className="stat-value">{formatIDR(totalDonasi)}</div>
          <div className="stat-note">sepanjang waktu</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Semua Workspace</div>
        <table>
          <tbody>
            <tr><th>Owner</th><th>Nama Map</th><th>API Key</th><th>Total Donasi</th><th>Status</th><th>Aksi</th></tr>
            {workspaces.map((w) => (
              <tr key={w.id}>
                <td className="strong">{w.ownerName}</td>
                <td>{w.name}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{w.apiKey.slice(0, 14)}...</td>
                <td>{formatIDR(w.totalDonasi)}</td>
                <td><span className={"badge" + (w.archived ? " pending" : "")}>{w.archived ? "nonaktif" : "aktif"}</span></td>
                <td>
                  {!w.archived && (
                    <button className="btn danger small" onClick={() => revoke(w.id)}>Cabut</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="empty-note">Panel ini cuma bisa diakses akun kamu sebagai pemilik sistem.</div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);
  if (!user.isSuperOwner) {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }

  const workspaces = await prisma.workspace.findMany({
    include: { owner: true, donations: { where: { status: "claimed" } } },
    orderBy: { createdAt: "desc" },
  });

  const result = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    ownerName: w.owner.name,
    apiKey: w.apiKey,
    archived: w.archived,
    totalDonasi: w.donations.reduce((s, d) => s + d.amount, 0),
  }));

  return { props: { workspaces: result } };
}
