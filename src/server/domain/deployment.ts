type HealthOptions = {
  attempts?: number;
  interval?: number;
  request?: typeof fetch;
  pause?: (milliseconds: number) => Promise<void>;
};

export async function waitForRevision(
  origin: string,
  revision: string,
  options: HealthOptions = {},
): Promise<void> {
  const {
    attempts = 60,
    interval = 5000,
    request = fetch,
    pause = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;
  const url = new URL("/api/health", origin);
  if (url.protocol !== "https:")
    throw new Error("Deployment health checks require HTTPS.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      const data = (await response.json()) as {
        status?: string;
        revision?: string;
      };
      if (response.ok && data.status === "ok" && data.revision === revision)
        return;
    } catch {
      /* Cold starts and transient failures are retried within a bounded deadline. */
    }
    if (attempt < attempts - 1) await pause(interval);
  }
  throw new Error(
    "The tested revision did not become healthy before the deployment deadline.",
  );
}
