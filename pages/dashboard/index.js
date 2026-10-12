import Link from "next/link";
import Layout from "../../components/Layout";
import { getSession, upsertUserFromSession, generateApiKey } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

function formatIDR(n) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function Ringkasan({ isSuperOwner, stats, week, topDonors, providerBreakdown, recent }) {
  const maxProvider = Math.max(1, ...providerBreakdown.map((p) => p.total));

  return (
    <Layout active="/dashboard" isSuperOwner={isSuperOwner}>
      <div className="hero">
        <span className="chip">Live</span>
        <div className="num">{formatIDR(stats.total)}</div>
        <p className="page-sub">
          Total donasi terkumpul di workspace utama, dari {stats.count} donasi dan {stats.uniqueDonors} donatur.
        </p>
        <div className="row-c">
          <Link className="btn" href="/dashboard/donasi-palsu">Kirim donasi palsu</Link>
          <Link className="btn ghost" href="/dashboard/donasi">Lihat semua donasi</Link>
        </div>
      </div>

      <div className="bento">
        <div className="panel s2 r2">
          <div className="panel-title">Donasi 7 hari terakhir</div>
          <div className="bars">
            {week.map((b) => (
              <div key={b.key} title={formatIDR(b.total)}>
                <i style={{ height: b.pct + "%" }} />
                {b.label}
              </div>
            ))}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Donasi</div>
          <div className="stat-value">{stats.count}</div>
          <div className="stat-note">{stats.pending} menunggu diklaim</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rata-rata donasi</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{formatIDR(stats.avg)}</div>
        </div>

        <div className="panel s2">
          <div className="panel-title">Top donatur</div>
          {topDonors.length === 0 && <div className="empty-note">Belum ada donatur.</div>}
          <ul className="lb">
            {topDonors.map((d) => (
              <li key={d.name}><span>{d.name}</span><b>{d.total.toLocaleString("id-ID")}</b></li>
            ))}
          </ul>
        </div>

        <div className="panel s2">
          <div className="panel-title">Per provider</div>
          {providerBreakdown.length === 0 && <div className="empty-note">Belum ada data.</div>}
          {providerBreakdown.map((p) => (
            <div key={p.provider}>
              <div className="line"><span>{p.provider}</span><b>{formatIDR(p.total)}</b></div>
              <div className="pv"><b style={{ width: Math.round((p.total / maxProvider) * 100) + "%" }} /></div>
            </div>
          ))}
        </div>

        <div className="panel s2">
          <div className="panel-title">Aktivitas terbaru</div>
          {recent.length === 0 && <div className="empty-note">Belum ada donasi masuk.</div>}
          {recent.map((d) => (
            <div className="item" key={d.id}>
              <div className="avatar" style={{ borderRadius: 12 }}>{(d.donorName[0] || "?").toUpperCase()}</div>
              <div className="m">
                <b>{d.donorName}</b>
                <span>{d.message || d.provider}</span>
              </div>
              <span className={"badge" + (d.status === "pending" ? " pending" : "")}>{d.status}</span>
              <div className="amt">{d.amount.toLocaleString("id-ID")}</div>
            </div>
          ))}
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

  const all = await prisma.donation.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  // Donasi palsu (provider "test") tidak dihitung ke total, rata-rata, donatur, dan grafik
  const donations = all.filter((d) => d.provider !== "test");
  const total = donations.reduce((s, d) => s + d.amount, 0);
  const pending = all.filter((d) => d.status === "pending").length;
  const uniqueDonors = new Set(donations.map((d) => d.donorName)).size;
  const avg = donations.length ? Math.round(total / donations.length) : 0;

  const byProvider = {};
  for (const d of all) byProvider[d.provider] = (byProvider[d.provider] || 0) + d.amount;
  const providerBreakdown = Object.entries(byProvider)
    .map(([provider, t]) => ({ provider, total: t }))
    .sort((a, b) => b.total - a.total);

  const byDonor = {};
  for (const d of donations) byDonor[d.donorName] = (byDonor[d.donorName] || 0) + d.amount;
  const topDonors = Object.entries(byDonor)
    .map(([name, t]) => ({ name, total: t }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 7 hari terakhir (waktu WIB, UTC+7)
  const WIB = 7 * 3600 * 1000;
  const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const key = new Date(Date.now() + WIB - i * 86400000).toISOString().slice(0, 10);
    const label = DAYS[new Date(key + "T00:00:00Z").getUTCDay()];
    const t = donations
      .filter((d) => new Date(d.createdAt.getTime() + WIB).toISOString().slice(0, 10) === key)
      .reduce((s, d) => s + d.amount, 0);
    week.push({ key, label, total: t });
  }
  const maxDay = Math.max(1, ...week.map((w) => w.total));
  week.forEach((w) => (w.pct = w.total > 0 ? Math.max(6, Math.round((w.total / maxDay) * 100)) : 2));

  const recent = all.slice(0, 5).map((d) => ({
    id: d.id,
    donorName: d.donorName,
    amount: d.amount,
    provider: d.provider,
    message: d.message || null,
    status: d.status,
  }));

  return {
    props: {
      isSuperOwner: user.isSuperOwner,
      stats: { total, count: donations.length, pending, uniqueDonors, avg },
      week,
      topDonors,
      providerBreakdown,
      recent,
    },
  };
}
