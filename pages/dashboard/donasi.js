import { useState } from "react";
import Layout from "../../components/Layout";
import BoardTab from "../../components/BoardTab";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default function Donasi({ isSuperOwner, donations, workspaceId }) {
  const [tab, setTab] = useState("riwayat");

  return (
    <Layout active="/dashboard/donasi" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div>
          <h1>Donasi</h1>
          <div className="page-sub">Riwayat donasi dan board donatur, jadi satu tempat</div>
        </div>
      </div>

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === "riwayat"} className={tab === "riwayat" ? "on" : ""} onClick={() => setTab("riwayat")}>Riwayat</button>
        <button role="tab" aria-selected={tab === "board"} className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}>Board</button>
      </div>

      {tab === "riwayat" && (
        <div className="panel">
          <table>
            <tbody>
              <tr><th>Donatur</th><th>Jumlah</th><th>Provider</th><th>Pesan</th><th>Status</th><th>Waktu</th></tr>
              {donations.length === 0 && (
                <tr><td colSpan={6} className="empty-note">Belum ada donasi. Coba kirim donasi palsu buat tes.</td></tr>
              )}
              {donations.map((d) => (
                <tr key={d.id}>
                  <td className="strong">{d.donorName}</td>
                  <td>{d.amount.toLocaleString("id-ID")}</td>
                  <td>{d.provider}</td>
                  <td>{d.message || "-"}</td>
                  <td><span className={"badge" + (d.status === "pending" ? " pending" : "")}>{d.status}</span></td>
                  <td>{new Date(d.createdAt).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "board" && (workspaceId ? <BoardTab workspaceId={workspaceId} /> : <div className="panel empty-note">Workspace belum tersedia.</div>)}
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);

  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });
  const donations = workspace
    ? await prisma.donation.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } })
    : [];

  return {
    props: {
      isSuperOwner: user.isSuperOwner,
      donations: JSON.parse(JSON.stringify(donations)),
      workspaceId: workspace ? workspace.id : null,
    },
  };
}
