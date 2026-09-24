import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function Login() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <div className="login-wrap">
      <div className="brand-mark" style={{ width: 44, height: 44 }} />
      <div className="login-card">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Golden Donate Cash</h1>
        <p className="page-sub" style={{ marginBottom: 24 }}>
          Masuk untuk memantau donasi map Roblox kamu
        </p>
        <button className="discord-btn" onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}>
          Masuk dengan Discord
        </button>
      </div>
    </div>
  );
}
