import { getSession, upsertUserFromSession } from "./auth";

// Pakai di getServerSideProps atau API routes /api/admin/*.
// Balikin { user } kalau valid, atau null kalau ditolak (response sudah dikirim).
export async function requireSuperOwner(req, res) {
  const session = await getSession(req, res);
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const user = await upsertUserFromSession(session);
  if (!user.isSuperOwner) {
    res.status(403).json({ error: "forbidden_not_super_owner" });
    return null;
  }
  return { user };
}
