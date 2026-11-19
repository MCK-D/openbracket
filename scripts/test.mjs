import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// Tests also run inside the production image; React's test helpers need the test build.
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
    ),
    "run",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  },
);
process.exit(result.status ?? 1);
