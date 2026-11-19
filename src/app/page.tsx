import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { Button } from "~/components/ui/button";
import { db } from "~/server/db";
export const dynamic = "force-dynamic";
const formatNames: Record<string, string> = {
  SWISS: "Swiss",
  DOUBLE_ELIMINATION: "Double elimination",
  SINGLE_ELIMINATION: "Single elimination",
  ROUND_ROBIN: "Round robin",
  FFA: "Free for all",
};
export default async function Home() {
  const tournaments = await db.tournament
    .findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { startsAt: "asc" },
      take: 100,
    })
    .catch(() => null);
  return (
    <main
      id="main"
      className="mx-auto min-h-[75vh] max-w-6xl px-6 py-14 md:py-20"
    >
      <div className="mb-14 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
          Find your next
          <br />
          friendly rivalry.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
          Follow community tournaments, explore the match schedule, and see how
          the competition unfolds.
        </p>
      </div>
      <section aria-labelledby="tournaments-heading">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 id="tournaments-heading" className="text-2xl font-semibold">
            Tournaments
          </h2>
          <span className="bg-muted rounded-md px-3 py-2 text-sm">
            Demo environment
          </span>
        </div>
        <p className="text-muted-foreground mb-6 max-w-2xl text-sm leading-relaxed">
          These tournaments and participants are fictional. Tournament engines,
          predictions, and live rankings are planned in the project roadmap.
        </p>
        {tournaments === null ? (
          <div role="status" className="border-border rounded-lg border p-6">
            <h3 className="font-semibold">
              Tournaments are temporarily unavailable
            </h3>
            <p className="text-muted-foreground mt-2">
              Check the database connection, then reload this page.
            </p>
          </div>
        ) : tournaments.length === 0 ? (
          <p className="py-10">
            No tournaments yet. Run the demo seed to populate this environment.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y border-y">
            {tournaments.map((tournament) => (
              <li
                key={tournament.id}
                className="grid items-center gap-5 py-7 md:grid-cols-[1fr_1fr_auto]"
              >
                <div className="flex items-center gap-4">
                  <Trophy
                    className="text-primary"
                    size={24}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-lg font-semibold">
                      <Link href={`/tournaments/${tournament.id}`}>
                        {tournament.name}
                      </Link>
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {tournament.game} · {formatNames[tournament.format]}
                    </p>
                  </div>
                </div>
                <div className="text-sm">
                  <p>
                    {tournament.status === "REGISTRATION"
                      ? "Registration stage"
                      : tournament.status.toLowerCase().replaceAll("_", " ")}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    <time dateTime={tournament.startsAt.toISOString()}>
                      {tournament.startsAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}{" "}
                      · {tournament.startsAt.toISOString().slice(11, 16)} UTC
                    </time>
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/tournaments/${tournament.id}`}>
                    View tournament
                    <span className="sr-only">: {tournament.name}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
