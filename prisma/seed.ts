import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  await db.user.upsert({
    where: { id: "demo-spectator" },
    update: {},
    create: {
      id: "demo-spectator",
      name: "Demo Spectator",
      email: "spectator@example.invalid",
      role: "SPECTATOR",
    },
  });
  const formats = ["SWISS", "DOUBLE_ELIMINATION", "FFA"] as const;
  for (const [i, format] of formats.entries()) {
    const id = `demo-${format.toLowerCase()}`;
    const startsAt = new Date("2027-01-20T18:00:00Z");
    await db.tournament.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: ["Winter Open", "Friday Rivals", "Circuit Sprint"][i]!,
        game: ["Chess", "Table football", "Racing"][i]!,
        format,
        status: "REGISTRATION",
        startsAt,
        matches: {
          create: {
            id: `${id}-match-1`,
            round: 1,
            homeName: "Player Atlas",
            awayName: "Player Nova",
            startsAt,
          },
        },
      },
    });
  }
  console.log(
    "Demo ready: three synthetic tournaments and one spectator. Existing records were preserved.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
