import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: { id: string } & DefaultSession["user"];
  }
}
// Only synthetic read-only accounts are exposed. Never offer an administrator demo login.
export const authConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers:
    env.DEMO_AUTH_ENABLED === "true"
      ? [
          Credentials({
            name: "Demo spectator",
            credentials: { alias: { label: "Demo alias", type: "text" } },
            async authorize(credentials) {
              const parsed = z
                .literal("demo-spectator")
                .safeParse(credentials.alias);
              if (!parsed.success) return null;
              return db.user.findFirst({
                where: { id: parsed.data, role: "SPECTATOR" },
              });
            },
          }),
        ]
      : [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
