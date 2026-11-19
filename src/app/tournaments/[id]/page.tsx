import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "~/server/db";
export const dynamic = "force-dynamic";
export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await db.tournament.findFirst({
    where: { id, visibility: "PUBLIC" },
    include: { matches: { orderBy: { round: "asc" } } },
  });
  if (!tournament) notFound();
  return (
    <main id="main" className="mx-auto min-h-[75vh] max-w-6xl px-6 py-14">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to tournaments
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {tournament.name}
      </h1>
      <p className="text-muted-foreground mt-3">
        {tournament.game} ·{" "}
        {tournament.format.toLowerCase().replaceAll("_", " ")} · Synthetic demo
      </p>
      <section aria-labelledby="matches-heading" className="mt-12">
        <h2 id="matches-heading" className="text-2xl font-semibold">
          Match schedule
        </h2>
        <p className="text-muted-foreground my-4 text-sm">
          An accessible match list is the foundation for the future bracket
          view. Times are shown in UTC.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Matches for {tournament.name}</caption>
            <thead>
              <tr className="border-border border-b">
                {["Round", "Participants", "Result", "Starts at"].map((h) => (
                  <th scope="col" key={h} className="px-3 py-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tournament.matches.map((match) => (
                <tr key={match.id} className="border-border border-b">
                  <td className="px-3 py-5">{match.round}</td>
                  <td className="px-3 py-5">
                    {match.homeName} vs {match.awayName}
                  </td>
                  <td className="px-3 py-5">
                    {match.completedAt
                      ? `${match.homeScore} - ${match.awayScore}`
                      : "Scheduled"}
                  </td>
                  <td className="px-3 py-5">
                    <time dateTime={match.startsAt.toISOString()}>
                      {match.startsAt
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 16)}{" "}
                      UTC
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
