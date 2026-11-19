export interface SourceTournament {
  externalId: string;
  name: string;
  sourceUrl: string;
  capabilities: ("matches" | "standings" | "characters" | "maps")[];
}
/** Adapters normalize public source data. Imported tournaments remain read-only. */
export interface TournamentConnector {
  readonly id: string;
  fetchTournament(
    externalId: string,
    signal?: AbortSignal,
  ): Promise<SourceTournament>;
}
