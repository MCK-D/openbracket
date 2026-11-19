import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  // Foundation smoke simulator: bounded, deterministic, synthetic records only.
  const match = await db.match.findFirst({
    where: { id: { startsWith: "demo-" }, completedAt: null },
    orderBy: { id: "asc" },
  });
  if (!match)
    console.log(
      "No pending synthetic matches. Seed a fresh local database to restart.",
    );
  else {
    await db.match.update({
      where: { id: match.id },
      data: {
        homeScore: 2,
        awayScore: 1,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    console.log(`Simulated ${match.id}: Player Atlas 2 - 1 Player Nova.`);
  }
} finally {
  await db.$disconnect();
}
