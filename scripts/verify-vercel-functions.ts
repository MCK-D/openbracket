import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const engine =
  "node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node";
export function verifyVercelFunctions(
  functionsDirectory = ".vercel/output/functions",
  projectDirectory = process.cwd(),
): number {
  const functions = [
    ...globSync("**/.vc-config.json", { cwd: functionsDirectory }),
  ]
    .map((path) => ({
      directory: dirname(join(functionsDirectory, path)),
      config: JSON.parse(
        readFileSync(join(functionsDirectory, path), "utf8"),
      ) as {
        runtime?: string;
        filePathMap?: Record<string, string>;
      },
    }))
    .filter(({ config }) => config.runtime?.startsWith("nodejs"));
  if (
    !functions.length ||
    functions.some(({ config }) => config.runtime !== "nodejs24.x")
  ) {
    throw new Error("Prebuilt Vercel functions must use Node.js 24.");
  }
  for (const { directory, config } of functions) {
    const source = config.filePathMap?.[engine];
    if (config.filePathMap && !source)
      throw new Error("RHEL Prisma engine is absent from a function file map.");
    const enginePath = source
      ? resolve(projectDirectory, source)
      : join(directory, engine);
    if (!existsSync(enginePath))
      throw new Error("RHEL Prisma engine file is missing.");
  }
  return functions.length;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  console.log(
    `Verified the RHEL Prisma engine in ${verifyVercelFunctions()} Node.js 24 function bundles.`,
  );
}
