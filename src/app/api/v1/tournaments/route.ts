import { db } from "~/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = await db.tournament.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { startsAt: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        game: true,
        format: true,
        status: true,
        startsAt: true,
        sourceUrl: true,
      },
    });
    return Response.json({ data });
  } catch {
    return Response.json(
      { error: "Tournaments are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
