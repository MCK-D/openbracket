import { expect, it, vi } from "vitest";
import {
  healthRevision,
  selectRollbackPair,
  type VercelDeployment,
} from "../../scripts/rollback-candidates";

const deployment = (
  url: string,
  created: number,
  sha?: string,
): VercelDeployment => ({
  uid: url,
  url: `${url}.vercel.app`,
  created,
  meta: sha ? { githubCommitSha: sha } : {},
});

const deployments = [
  deployment("broken", 30, "c3"),
  deployment("current", 40, "c4"),
  deployment("redeploy", 35, "c4"),
  deployment("unhealthy-older", 20, "c2"),
  deployment("healthy-older", 10, "c1"),
  deployment("manual", 5),
];
const healthy: Record<string, string> = {
  "https://current.vercel.app": "c4",
  "https://redeploy.vercel.app": "c4",
  "https://healthy-older.vercel.app": "c1",
};

it("pairs the live release with the newest older healthy revision", async () => {
  await expect(
    selectRollbackPair(deployments, "c4", async (url) => healthy[url]),
  ).resolves.toEqual({
    current: { url: "https://current.vercel.app", revision: "c4" },
    previous: { url: "https://healthy-older.vercel.app", revision: "c1" },
  });
});

it("never targets a newer, unhealthy or same-revision deployment", async () => {
  await expect(
    selectRollbackPair(deployments, "c1", async (url) => healthy[url]),
  ).rejects.toThrow("No older healthy deployment");
  await expect(
    selectRollbackPair(
      [deployment("only", 1, "c1"), deployment("again", 2, "c1")],
      "c1",
      async () => "c1",
    ),
  ).rejects.toThrow("No older healthy deployment");
});

it("refuses when no deployment serves the public revision", async () => {
  await expect(
    selectRollbackPair(deployments, "c9", async (url) => healthy[url]),
  ).rejects.toThrow("public revision c9");
});

it("reads the revision only from a healthy response", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: "ok", revision: "c1" }))
    .mockResolvedValueOnce(
      Response.json({ status: "ok", revision: "c1" }, { status: 503 }),
    )
    .mockRejectedValueOnce(new Error("offline"));
  expect(await healthRevision("https://a.vercel.app", request)).toBe("c1");
  expect(await healthRevision("https://a.vercel.app", request)).toBeUndefined();
  expect(await healthRevision("https://a.vercel.app", request)).toBeUndefined();
});
