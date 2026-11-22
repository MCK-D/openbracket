import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  PASSWORD_MAX_LENGTH,
  rejectUnknownAccount,
  verifyPassword,
} from "~/server/domain/passwords";
import {
  DEMO_USER_ID,
  isSessionCurrent,
  type Role,
} from "~/server/domain/permissions";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    sessionVersion?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionVersion?: number;
    /** Sign-in time in seconds; bounds the session even though Auth.js slides the cookie expiry. */
    authTime?: number;
    role?: Role;
  }
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const sessionUser = {
  id: true,
  name: true,
  email: true,
  sessionVersion: true,
} as const;

const passwordProvider = Credentials({
  id: "password",
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const parsed = signInSchema.safeParse(credentials);
    if (!parsed.success) return null;
    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { ...sessionUser, passwordHash: true },
    });
    if (!user?.passwordHash) {
      await rejectUnknownAccount(parsed.data.password);
      return null;
    }
    if (!(await verifyPassword(parsed.data.password, user.passwordHash)))
      return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      sessionVersion: user.sessionVersion,
    };
  },
});

// Only a synthetic read-only account is exposed. Never offer an administrator demo login.
const demoProvider = Credentials({
  id: "demo",
  name: "Demo spectator",
  credentials: { alias: { label: "Demo alias", type: "text" } },
  async authorize(credentials) {
    const parsed = z.literal(DEMO_USER_ID).safeParse(credentials.alias);
    if (!parsed.success) return null;
    return db.user.findFirst({
      where: { id: parsed.data, role: "SPECTATOR" },
      select: sessionUser,
    });
  },
});

export const authConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    passwordProvider,
    ...(env.DEMO_AUTH_ENABLED === "true" ? [demoProvider] : []),
  ],
  callbacks: {
    // Runs on every session read: a deleted user, a revoked or expired session, a disabled demo
    // login or a role change takes effect immediately.
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      if (user?.id) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        token.authTime = now;
      }
      if (!token.sub) return null;
      if (token.sub === DEMO_USER_ID && env.DEMO_AUTH_ENABLED !== "true")
        return null;
      const current = await db.user.findUnique({
        where: { id: token.sub },
        select: { role: true, sessionVersion: true },
      });
      if (!current) return null;
      if (!isSessionCurrent(token, current, now, SESSION_MAX_AGE_SECONDS))
        return null;
      token.role = current.role;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
