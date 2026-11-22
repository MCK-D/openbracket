import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type VercelDeployment = {
  uid: string;
  url: string;
  created: number;
  meta?: { githubCommitSha?: string };
};

export type RollbackPair = {
  current: { url: string; revision: string };
  previous: { url: string; revision: string };
};

type Health = (url: string) => Promise<string | undefined>;

export async function selectRollbackPair(
  deployments: VercelDeployment[],
  currentRevision: string,
  revisionOf: Health,
): Promise<RollbackPair> {
  const newestFirst = [...deployments]
    .filter((deployment) => deployment.meta?.githubCommitSha)
    .sort((a, b) => b.created - a.created);
  const live = async (deployment: VercelDeployment) =>
    (await revisionOf(`https://${deployment.url}`)) ===
    deployment.meta?.githubCommitSha;

  let current: VercelDeployment | undefined;
  for (const deployment of newestFirst) {
    if (deployment.meta?.githubCommitSha !== currentRevision) continue;
    if (await live(deployment)) {
      current = deployment;
      break;
    }
  }
  if (!current)
    throw new Error(
      `No healthy deployment reports the public revision ${currentRevision}.`,
    );

  for (const deployment of newestFirst) {
    if (deployment.created >= current.created) continue;
    if (deployment.meta?.githubCommitSha === currentRevision) continue;
    if (await live(deployment))
      return {
        current: { url: `https://${current.url}`, revision: currentRevision },
        previous: {
          url: `https://${deployment.url}`,
          revision: deployment.meta!.githubCommitSha!,
        },
      };
  }
  throw new Error(
    "No older healthy deployment with a different revision to roll back to.",
  );
}

export async function healthRevision(
  origin: string,
  request: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await request(new URL("/api/health", origin), {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const data = (await response.json()) as {
      status?: string;
      revision?: string;
    };
    return response.ok && data.status === "ok" ? data.revision : undefined;
  } catch {
    return undefined;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, APP_URL } =
    process.env;
  if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID || !APP_URL)
    throw new Error(
      "VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID and APP_URL are required.",
    );
  const currentRevision = await healthRevision(APP_URL);
  if (!currentRevision)
    throw new Error(`${APP_URL} is not healthy; refusing to rehearse.`);
  const query = new URLSearchParams({
    projectId: VERCEL_PROJECT_ID,
    teamId: VERCEL_ORG_ID,
    target: "production",
    state: "READY",
    limit: "20",
  });
  const response = await fetch(
    `https://api.vercel.com/v6/deployments?${query}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  );
  if (!response.ok)
    throw new Error(`Vercel deployment list failed: HTTP ${response.status}.`);
  const { deployments } = (await response.json()) as {
    deployments: VercelDeployment[];
  };
  const pair = await selectRollbackPair(deployments, currentRevision, (url) =>
    healthRevision(url),
  );
  const output = [
    `current_url=${pair.current.url}`,
    `current_revision=${pair.current.revision}`,
    `previous_url=${pair.previous.url}`,
    `previous_revision=${pair.previous.revision}`,
  ].join("\n");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  console.log(output);
}
