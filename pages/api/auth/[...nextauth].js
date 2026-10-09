import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

export const authOptions = {
  providers: [
DiscordProvider({
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  issuer: "https://discord.com",
}),
  ],
  callbacks: {
    // Simpan Discord user id ke dalam session, dipakai buat cek super owner
    // dan buat kaitan ke tabel User di database.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.discordId = profile.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.discordId = token.discordId;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export default NextAuth(authOptions);
