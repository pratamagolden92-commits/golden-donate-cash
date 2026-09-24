import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession, generateApiKey } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function formatIDR(n) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function Ringkasan({ isSuperOwner, stats, providerBreakdown, recentDonations }) {
  return (
    <Layout active="/dashboard" isSuperOwner={isSuperOwner}>
      <div className="page-head">
        <div>
          <h1>Ringkasan</h1>
          <div className="page-sub">Workspace utama kamu</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">TOTAL TERKUMPUL</div>
          <div className="stat-value">{formatIDR(stats.total)}</div>
          <div className="stat-note">{stats.count} donasi</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DONASI</div>
          <div className="stat-value">{stats.count}</div>
          <div className="stat-note">{stats.pending} menunggu diklaim</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DONATUR UNIK</div>
          <div className="stat-value">{stats.uniqueDonors}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">RATA-RATA DONASI</div>
          <div className="stat-value">{formatIDR(stats.avg)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Donasi Terbaru</div>
          <table>
            <tbody>
              <tr><th>Donatur</th><th>Jumlah</th><th>Provider</th><th>Status</th></tr>
              {recentDonations.length === 0 && (
                <tr><td colSpan={4} className="empty-note">Belum ada donasi masuk.</td></tr>
              )}
              {recentDonations.map((d) => (
                <tr key={d.id}>
                  <td className="strong">{d.donorName}</td>
                  <td>{d.amount.toLocaleString("id-ID")}</td>
                  <td>{d.provider}</td>
                  <td><span className={"badge" + (d.status === "pending" ? " pending" : "")}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-title">Per Provider</div>
          {providerBreakdown.map((p) => (
            <div key={p.provider} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{p.provider}</span>
                <strong>{formatIDR(p.total)}</strong>
              </div>
            </div>
          ))}
          {providerBreakdown.length === 0 && <div className="empty-note">Belum ada data.</div>}
        </div>
      </div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  const session = await getSession(ctx.req, ctx.res);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const user = await upsertUserFromSession(session);

  let workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Workspace Utama",
        slot: 1,
        apiKey: generateApiKey(),
        ownerId: user.id,
        providers: {
          create: [
            { type: "saweria", enabled: false },
            { type: "bagibagi", enabled: false },
            { type: "sociabuzz", enabled: false },
          ],
        },
      },
    });
  }

  const donations = await prisma.donation.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  const total = donations.reduce((s, d) => s + d.amount, 0);
  const pending = donations.filter((d) => d.status === "pending").length;
  const uniqueDonors = new Set(donations.map((d) => d.donorName)).size;
  const avg = donations.length ? Math.round(total / donations.length) : 0;

  const byProvider = {};
  for (const d of donations) {
    byProvider[d.provider] = (byProvider[d.provider] || 0) + d.amount;
  }
  const providerBreakdown = Object.entries(byProvider).map(([provider, total]) => ({ provider, total }));

  return {
    props: {
      isSuperOwner: user.isSuperOwner,
      stats: { total, count: donations.length, pending, uniqueDonors, avg },
      providerBreakdown,
      recentDonations: donations.slice(0, 8),
    },
  };
}
