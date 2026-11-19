import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
import { appRouter } from "~/server/api/root";
import type { createTRPCContext } from "~/server/api/trpc";
type Context = Awaited<ReturnType<typeof createTRPCContext>>;
function caller(userId?: string) {
  return appRouter.createCaller({
    db: {
      user: { findUnique: mocks.findUnique },
      $transaction: mocks.transaction,
    } as unknown as Context["db"],
    session: userId ? { user: { id: userId }, expires: "2027-01-01" } : null,
    headers: new Headers(),
  });
}
const input = {
  name: "Test Tournament",
  game: "Chess",
  format: "SWISS" as const,
  startsAt: new Date("2099-01-01T00:00:00Z"),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      tournament: { create: mocks.create },
      auditLog: { create: mocks.audit },
    }),
  );
});
it("rejects unauthenticated creation", async () => {
  await expect(caller().tournament.create(input)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("reloads current role and denies spectator creation", async () => {
  mocks.findUnique.mockResolvedValue({ role: "SPECTATOR" });
  await expect(
    caller("spectator").tournament.create(input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("creates an administrator tournament and audit record in one transaction", async () => {
  mocks.findUnique.mockResolvedValue({ role: "ADMIN" });
  mocks.create.mockResolvedValue({ id: "new-tournament", ...input });
  await expect(
    caller("admin").tournament.create(input),
  ).resolves.toHaveProperty("id", "new-tournament");
  expect(mocks.audit).toHaveBeenCalledWith({
    data: {
      actorId: "admin",
      action: "tournament.created",
      entityId: "new-tournament",
    },
  });
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
});
it("rejects invalid inputs before any database mutation", async () => {
  await expect(
    caller("admin").tournament.create({ ...input, name: "x" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.transaction).not.toHaveBeenCalled();
});
