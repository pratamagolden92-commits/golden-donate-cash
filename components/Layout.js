import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

const NAV = [
  { href: "/dashboard", label: "Ringkasan" },
  { href: "/dashboard/donasi", label: "Donasi" },
  { href: "/dashboard/pengaturan", label: "Pengaturan" },
  { href: "/dashboard/provider", label: "Provider" },
  { href: "/dashboard/api-key", label: "API Key" },
  { href: "/dashboard/donasi-palsu", label: "Donasi Palsu" },
  { href: "/dashboard/workspace", label: "Workspace" },
];

export default function Layout({ children, active, isSuperOwner }) {
  const { data: session } = useSession();
  const [confirmOut, setConfirmOut] = useState(false);
  const items = isSuperOwner ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">GOLDEN DONATE</span>
        </div>
        <nav className="topnav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-item" + (active === item.href ? " active" : "")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <div className="who-pill">
            <div className="avatar">
              {session?.user?.image ? (
                <img src={session.user.image} alt="" />
              ) : (
                session?.user?.name?.[0] || "?"
              )}
            </div>
            <span className="who-name">{session?.user?.name || "..."}</span>
          </div>
          <button className="btn danger small" onClick={() => setConfirmOut(true)}>
            Keluar
          </button>
        </div>
      </header>
      <main>{children}</main>

      {confirmOut && (
        <div className="overlay" onClick={() => setConfirmOut(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">Keluar dari akun?</div>
            <p className="key-hint" style={{ marginBottom: 20 }}>
              Kamu perlu masuk lagi untuk membuka dashboard.
            </p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn ghost" onClick={() => setConfirmOut(false)}>Batal</button>
              <button className="btn danger" onClick={() => signOut({ callbackUrl: "/login" })}>Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
