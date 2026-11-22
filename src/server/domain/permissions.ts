import { TRPCError } from "@trpc/server";

export const ROLES = ["ADMIN", "PLAYER", "SPECTATOR"] as const;
export type Role = (typeof ROLES)[number];
/** Roles a visitor may choose at sign-up. Administrators are only granted by another administrator or the operator script. */
export const SELF_SERVICE_ROLES = ["PLAYER", "SPECTATOR"] as const;

export function requireRole(
  role: string | undefined,
  allowed: readonly Role[],
): asserts role is Role {
  if (!allowed.includes(role as Role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your role does not allow this action.",
    });
}

export function requireAdmin(role: string | undefined): void {
  if (role !== "ADMIN")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access is required.",
    });
}

/** Players and spectators predict; administrators run tournaments and do not compete in predictions. */
export function canPredict(role: string | undefined): boolean {
  return role === "PLAYER" || role === "SPECTATOR";
}

export const DEMO_USER_ID = "demo-spectator";

/** The shared demo identity may read but never change account state. */
export function requireRealAccount(userId: string): void {
  if (userId === DEMO_USER_ID)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The shared demo account cannot change account settings.",
    });
}

/**
 * A token is valid only while it carries the user's current session version and was issued by a
 * sign-in less than `maxAgeSeconds` ago. Auth.js refreshes the cookie expiry on every read, so the
 * sign-in time is the only absolute limit.
 */
export function isSessionCurrent(
  token: { sessionVersion?: unknown; authTime?: unknown },
  user: { sessionVersion: number } | null,
  nowSeconds: number,
  maxAgeSeconds: number,
): boolean {
  return (
    user !== null &&
    typeof token.sessionVersion === "number" &&
    token.sessionVersion === user.sessionVersion &&
    typeof token.authTime === "number" &&
    token.authTime <= nowSeconds &&
    nowSeconds - token.authTime < maxAgeSeconds
  );
}
/** Rejects cross-site browser requests: a present Origin must match the request host. */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(",")[0]!.trim();
  } catch {
    return false;
  }
}
