import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
import { appRouter } from "~/server/api/root";
import type { createTRPCContext } from "~/server/api/trpc";
import {
  hashPassword,
  rejectUnknownAccount,
  verifyPassword,
} from "~/server/domain/passwords";
import {
  canPredict,
  isSameOriginRequest,
  isSessionCurrent,
  requireRole,
} from "~/server/domain/permissions";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
const tx = {
  user: {
    findUnique: mocks.findUnique,
    update: mocks.update,
    count: mocks.count,
    create: mocks.create,
  },
  auditLog: { create: mocks.audit },
};
function caller(
  user?: { id: string; role: "ADMIN" | "PLAYER" | "SPECTATOR" },
  headers = new Headers({ host: "openbracket.test" }),
) {
  return appRouter.createCaller({
    db: {
      ...tx,
      $transaction: mocks.transaction,
    } as unknown as Context["db"],
    session: user ? { user, expires: "2027-01-01" } : null,
    headers,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (work: unknown) =>
    typeof work === "function" ? work(tx) : Promise.all(work as unknown[]),
  );
});

describe("password hashing", () => {
  it("verifies the right password only, with a unique salt per hash", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");
    expect(first).not.toBe(second);
    expect(first).not.toContain("correct");
    expect(await verifyPassword("correct horse battery", first)).toBe(true);
    expect(await verifyPassword("correct horse batterY", first)).toBe(false);
  });
  it("never verifies malformed, tampered or weakened hashes", async () => {
    const stored = await hashPassword("correct horse battery");
    const parts = stored.split("$");
    const weakened = ["scrypt", "1024", ...parts.slice(2)].join("$");
    const tampered = [...parts.slice(0, 5), "AAAA"].join("$");
    for (const hash of ["", "plain", weakened, tampered, `md5$${stored}`])
      expect(await verifyPassword("correct horse battery", hash)).toBe(false);
    expect(await rejectUnknownAccount("anything")).toBe(false);
  });
  it("refuses passwords outside the accepted length", async () => {
    await expect(hashPassword("short")).rejects.toThrow("12 to 128");
    await expect(hashPassword("x".repeat(129))).rejects.toThrow();
  });
});

describe("roles and sessions", () => {
  it("lets players and spectators predict, not administrators", () => {
    expect(canPredict("PLAYER")).toBe(true);
    expect(canPredict("SPECTATOR")).toBe(true);
    expect(canPredict("ADMIN")).toBe(false);
    expect(canPredict(undefined)).toBe(false);
    expect(() => requireRole("SPECTATOR", ["PLAYER"])).toThrow();
    expect(() => requireRole("PLAYER", ["PLAYER"])).not.toThrow();
  });
  it("invalidates deleted users, revoked versions and sessions past their absolute lifetime", () => {
    const now = 1_000_000;
    const hours = 8 * 3600;
    const token = (sessionVersion?: number, authTime?: number) => ({
      sessionVersion,
      authTime,
    });
    const current = (t: ReturnType<typeof token>, version = 2) =>
      isSessionCurrent(t, { sessionVersion: version }, now, hours);
    expect(current(token(2, now - 60))).toBe(true);
    expect(current(token(1, now - 60))).toBe(false);
    expect(current(token(undefined, now - 60), 0)).toBe(false);
    expect(isSessionCurrent(token(0, now), null, now, hours)).toBe(false);
    // Auth.js refreshes the cookie on every read: only the sign-in time bounds a stolen token.
    expect(current(token(2, now - hours))).toBe(false);
    expect(current(token(2))).toBe(false);
    expect(current(token(2, now + 60))).toBe(false);
  });
  it("keeps the shared demo identity away from account settings", async () => {
    const demo = caller({ id: "demo-spectator", role: "SPECTATOR" });
    await expect(demo.account.revokeSessions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      demo.account.changePassword({
        currentPassword: "anything",
        newPassword: "another long passphrase",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("accepts same-origin and origin-less requests, refuses cross-site ones", () => {
    const req = (headers: Record<string, string>) =>
      isSameOriginRequest(new Headers(headers));
    expect(req({ host: "a.test", origin: "https://a.test" })).toBe(true);
    expect(req({ host: "a.test" })).toBe(true);
    expect(req({ host: "a.test", origin: "https://evil.test" })).toBe(false);
    expect(req({ host: "a.test", origin: "null" })).toBe(false);
    expect(req({ origin: "https://a.test" })).toBe(false);
    expect(
      req({
        host: "internal:3000",
        "x-forwarded-host": "a.test",
        origin: "https://a.test",
      }),
    ).toBe(true);
  });
});

describe("account API", () => {
  const registration = {
    name: "Atlas",
    email: " Atlas@Example.COM ",
    password: "correct horse battery",
    role: "PLAYER" as const,
  };
  it("registers a hashed, normalised player account with an audit record", async () => {
    mocks.create.mockResolvedValue({ id: "u1", role: "PLAYER" });
    await expect(caller().account.register(registration)).resolves.toEqual({
      id: "u1",
      role: "PLAYER",
    });
    const data = mocks.create.mock.calls[0]![0].data;
    expect(data.email).toBe("atlas@example.com");
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword(registration.password, data.passwordHash)).toBe(
      true,
    );
    expect(mocks.audit).toHaveBeenCalledWith({
      data: { actorId: "u1", action: "user.registered", entityId: "u1" },
    });
  });
  it("never lets a visitor register as administrator", async () => {
    await expect(
      caller().account.register({
        ...registration,
        role: "ADMIN" as unknown as "PLAYER",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports a duplicate email as a conflict", async () => {
    mocks.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await expect(caller().account.register(registration)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
  });
  it("refuses cross-site mutations before touching the database", async () => {
    const crossSite = new Headers({
      host: "openbracket.test",
      origin: "https://evil.test",
    });
    await expect(
      caller(undefined, crossSite).account.register(registration),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller({ id: "u1", role: "PLAYER" }, crossSite).account.revokeSessions(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("revokes every session by bumping the session version", async () => {
    await expect(caller().account.revokeSessions()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await caller({ id: "u1", role: "PLAYER" }).account.revokeSessions();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
  });
  it("requires the current password to change it, then revokes sessions", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    mocks.findUnique.mockResolvedValue({ passwordHash });
    const me = caller({ id: "u1", role: "PLAYER" });
    await expect(
      me.account.changePassword({
        currentPassword: "wrong password!!",
        newPassword: "another long passphrase",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
    await me.account.changePassword({
      currentPassword: "correct horse battery",
      newPassword: "another long passphrase",
    });
    expect(mocks.update.mock.calls[0]![0].data.sessionVersion).toEqual({
      increment: 1,
    });
  });
  it("lets only a current administrator change roles", async () => {
    mocks.findUnique.mockResolvedValue({ role: "PLAYER" });
    await expect(
      caller({ id: "u1", role: "ADMIN" }).account.setRole({
        userId: "u2",
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("changes a role, revokes the target's sessions and audits it", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "PLAYER" });
    await expect(
      caller({ id: "admin", role: "ADMIN" }).account.setRole({
        userId: "u2",
        role: "SPECTATOR",
      }),
    ).resolves.toEqual({ role: "SPECTATOR" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { role: "SPECTATOR", sessionVersion: { increment: 1 } },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        actorId: "admin",
        action: "user.role_changed.PLAYER.SPECTATOR",
        entityId: "u2",
      },
    });
  });
  it("refuses to demote the last administrator", async () => {
    mocks.findUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.count.mockResolvedValue(1);
    await expect(
      caller({ id: "admin", role: "ADMIN" }).account.setRole({
        userId: "admin",
        role: "PLAYER",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
