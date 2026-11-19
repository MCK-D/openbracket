import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pooled = new URL(process.env.DATABASE_URL ?? "");
const direct = new URL(process.env.DATABASE_URL_UNPOOLED ?? "");
if (
  direct.hostname.includes("-pooler") ||
  pooled.hostname.replace("-pooler", "") !== direct.hostname ||
  pooled.pathname !== direct.pathname ||
  pooled.username !== direct.username
) {
  throw new Error(
    "Application and migration URLs must point to the same database, with a direct migration endpoint.",
  );
}
// Only the selected environment's direct connection is used for migration and seeding.
const env = { ...process.env, DATABASE_URL: direct.href };
for (const [entry, ...args] of [
  ["../node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["../node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(entry, import.meta.url)), ...args],
    { stdio: "inherit", env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
