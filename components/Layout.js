import Link from "next/link";
import { useSession } from "next-auth/react";

const NAV = [
  { href: "/dashboard", label: "Ringkasan" },
  { href: "/dashboard/donasi", label: "Donasi" },
  { href: "/dashboard/provider", label: "Provider" },
  { href: "/dashboard/api-key", label: "API Key" },
  { href: "/dashboard/donasi-palsu", label: "Donasi Palsu" },
  { href: "/dashboard/workspace", label: "Workspace" },
];

export default function Layout({ children, active, isSuperOwner }) {
  const { data: session } = useSession();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-name">
            Golden Donate Cash
            <span>GOLDEN STUDIO</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-item" + (active === item.href ? " active" : "")}
            >
              {item.label}
            </Link>
          ))}
          {isSuperOwner && (
            <>
              <div className="nav-section-label">SUPER OWNER</div>
              <Link
                href="/admin"
                className={"nav-item" + (active === "/admin" ? " active" : "")}
              >
                Panel Admin
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" />
            ) : (
              session?.user?.name?.[0] || "?"
            )}
          </div>
          <div>
            <span className="sf-name">{session?.user?.name || "..."}</span>
            <span className="sf-role">Golden Studio</span>
          </div>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
