import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";
import { customAlphabet } from "nanoid";
import { prisma } from "./prisma";

const genKeyPart = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  24
);

// Format: gld_live_xxxxxxxxxxxxxxxxxxxxxxxx
export function generateApiKey() {
  return `gld_live_${genKeyPart()}`;
}

// Ambil session di server (getServerSideProps atau API routes)
export async function getSession(req, res) {
  return getServerSession(req, res, authOptions);
}

// Pastikan user login sudah punya baris User di DB, sinkron dari profil Discord
export async function upsertUserFromSession(session) {
  if (!session?.user?.discordId) return null;
  const isSuperOwner =
    session.user.discordId === process.env.SUPER_OWNER_DISCORD_ID;

  return prisma.user.upsert({
    where: { discordId: session.user.discordId },
    update: { name: session.user.name, avatar: session.user.image, isSuperOwner },
    create: {
      discordId: session.user.discordId,
      name: session.user.name,
      avatar: session.user.image,
      isSuperOwner,
    },
  });
}
