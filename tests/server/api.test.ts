import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), query: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: { tournament: { findMany: mocks.findMany }, $queryRaw: mocks.query },
}));
import { GET as tournaments } from "~/app/api/v1/tournaments/route";
import { GET as health } from "~/app/api/health/route";
beforeEach(() => vi.resetAllMocks());
it("bounds the public API and never exposes private tournaments", async () => {
  mocks.findMany.mockResolvedValue([{ id: "demo", name: "Winter Open" }]);
  expect(await (await tournaments()).json()).toEqual({
    data: [{ id: "demo", name: "Winter Open" }],
  });
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { visibility: "PUBLIC" }, take: 100 }),
  );
});
it("returns a safe 503 without leaking database errors", async () => {
  mocks.findMany.mockRejectedValue(new Error("private connection string"));
  const response = await tournaments();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private connection string");
});
it("reports database readiness", async () => {
  mocks.query.mockResolvedValue([{ value: 1 }]);
  expect((await health()).status).toBe(200);
  mocks.query.mockRejectedValue(new Error("offline"));
  expect((await health()).status).toBe(503);
});
