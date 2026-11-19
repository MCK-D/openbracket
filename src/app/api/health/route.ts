import { db } from "~/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({
      status: "ok",
      service: "openbracket",
      version: "0.1.0",
      revision:
        process.env.APP_REVISION ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        "local",
    });
  } catch {
    return Response.json(
      { status: "unavailable", service: "openbracket" },
      { status: 503 },
    );
  }
}
