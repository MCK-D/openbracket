import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { verifyVercelFunctions } from "../../scripts/verify-vercel-functions";

const engine =
  "node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== resolve(tmpdir()))
      throw new Error("Unexpected fixture directory");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture({
  runtime = "nodejs24.x",
  mapped = true,
  includeEngine = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "openbracket-vercel-"));
  roots.push(root);
  const functions = join(root, "functions");
  for (const name of ["api/health.func", "index.func"]) {
    const directory = join(functions, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, ".vc-config.json"),
      JSON.stringify({
        runtime,
        ...(mapped ? { filePathMap: { [engine]: engine } } : {}),
      }),
    );
    if (includeEngine) {
      const file = join(mapped ? root : directory, engine);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "synthetic-engine-fixture");
    }
  }
  return { root, functions };
}
it("accepts Vercel's file maps pointing to project dependencies outside the function directory", () => {
  const { root, functions } = fixture();
  expect(verifyVercelFunctions(functions, root)).toBe(2);
});
it("also accepts traditional function bundles with physical engine files", () => {
  const { root, functions } = fixture({ mapped: false });
  expect(verifyVercelFunctions(functions, root)).toBe(2);
});
it("rejects the wrong Node runtime", () => {
  const { root, functions } = fixture({ runtime: "nodejs26.x" });
  expect(() => verifyVercelFunctions(functions, root)).toThrow("Node.js 24");
});
it("rejects mapped dependencies whose source file is missing", () => {
  const { root, functions } = fixture({ includeEngine: false });
  expect(() => verifyVercelFunctions(functions, root)).toThrow(
    "engine file is missing",
  );
});
it("rejects a file map that omits the runtime engine", () => {
  const { root, functions } = fixture();
  writeFileSync(
    join(functions, "api/health.func/.vc-config.json"),
    JSON.stringify({ runtime: "nodejs24.x", filePathMap: {} }),
  );
  expect(() => verifyVercelFunctions(functions, root)).toThrow(
    "absent from a function file map",
  );
});
