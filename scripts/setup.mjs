import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "replace-with-at-least-32-random-characters",
      randomBytes(48).toString("hex"),
    ),
  );
execFileSync("docker", ["compose", "up", "--build", "--detach", "--wait"], {
  stdio: "inherit",
});
console.log(
  "OpenBracket is ready at http://localhost:3000. Run: docker compose exec app npm run demo",
);
