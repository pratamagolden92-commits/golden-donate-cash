import { useState } from "react";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default function DonasiPalsu({ isSuperOwner, workspaceId }) {
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("10000");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch(`/api/workspaces/${workspaceId}/fake-donation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, amount, message }),
    });
    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <Layout active="/dashboard/donasi-palsu" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div><h1>Donasi Palsu</h1><div className="page-sub">Uji integrasi dari ujung ke ujung tanpa donasi asli</div></div>
      </div>
      <form className="panel" style={{ maxWidth: 520 }} onSubmit={submit}>
        <div className="form-row">
          <label>Username Roblox</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mis. builderman" required />
        </div>
        <div className="form-row">
          <label>Jumlah (IDR)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Pesan</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Pesan opsional" />
        </div>
        <button className="btn" disabled={status === "sending"}>Kirim Donasi Palsu</button>
        {status === "sent" && <div className="empty-note">Terkirim! Cek halaman Donasi atau minta Roblox Studio poll /api/roblox/pending.</div>}
        {status === "error" && <div className="empty-note" style={{ color: "var(--red)" }}>Gagal mengirim, coba lagi.</div>}
      </form>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const user = await upsertUserFromSession(session);
  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });

  return { props: { isSuperOwner: user.isSuperOwner, workspaceId: workspace?.id || null } };
}
