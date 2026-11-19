import { setTimeout } from "node:timers/promises";
const { RENDER_DEPLOY_HOOK, APP_URL, COMMIT } = process.env;
if (!RENDER_DEPLOY_HOOK || !APP_URL || !COMMIT)
  throw new Error("Deployment configuration is incomplete.");
const hook = new URL(RENDER_DEPLOY_HOOK);
hook.searchParams.set("ref", COMMIT);
const response = await fetch(hook, {
  method: "POST",
  signal: AbortSignal.timeout(30000),
});
if (!response.ok)
  throw new Error(`Render rejected deployment with HTTP ${response.status}.`);
// A healthy old release is insufficient: wait for the exact tested revision.
for (let attempt = 0; attempt < 90; attempt++) {
  await setTimeout(10000);
  try {
    const health = await fetch(new URL("/api/health", APP_URL), {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const data = await health.json();
    if (health.ok && data.status === "ok" && data.revision === COMMIT) {
      console.log(`Deployment healthy at revision ${COMMIT}.`);
      process.exit(0);
    }
  } catch {
    /* Cold starts and transient upstream errors are retried until the deadline. */
  }
}
throw new Error(
  "The tested revision did not become healthy before the deployment deadline.",
);
