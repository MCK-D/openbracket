import { expect, it, vi } from "vitest";
import { waitForRevision } from "~/server/domain/deployment";

it("waits for the tested revision, rather than accepting a healthy older release", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: "ok", revision: "old" }))
    .mockResolvedValueOnce(Response.json({ status: "ok", revision: "tested" }));
  const pause = vi.fn().mockResolvedValue(undefined);
  await waitForRevision("https://example.vercel.app", "tested", {
    request,
    pause,
    attempts: 2,
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledTimes(1);
});
it("fails closed for HTTP errors and missing revision metadata", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ status: "ok", revision: "tested" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json({ status: "ok" }));
  await expect(
    waitForRevision("https://example.vercel.app", "tested", {
      request,
      pause: async () => {},
      attempts: 2,
    }),
  ).rejects.toThrow("deadline");
});
it("retries network failure but rejects insecure origins", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(Response.json({ status: "ok", revision: "tested" }));
  await expect(
    waitForRevision("https://example.vercel.app", "tested", {
      request,
      pause: async () => {},
      attempts: 2,
    }),
  ).resolves.toBeUndefined();
  await expect(
    waitForRevision("http://example.vercel.app", "tested", { request }),
  ).rejects.toThrow("HTTPS");
});
