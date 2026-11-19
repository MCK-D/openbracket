# Connector developer guide

## Contract

`src/server/connectors/types.ts` defines `TournamentConnector` and the normalized `SourceTournament`. A connector has a stable `id` and implements `fetchTournament(externalId, signal?)`. Return a stable external ID, name, public HTTPS source URL and a truthful list of capabilities. The existing contract is a starting point; normalized phases, sets, games, standings and statistics must be added with the start.gg implementation.

No external connector is currently implemented. Tests and local onboarding make no start.gg requests. A fake fixture is suitable for developing core logic; it must never be presented as a real import.

## Minimal tutorial

1. Create `src/server/connectors/example.ts`, implement the interface, and inject the HTTP fetch function for offline tests.
2. Fetch only allowed public tournament data from an allowlisted provider endpoint. Validate the external ID and response with Zod; never fetch an arbitrary administrator-supplied URL. Redact upstream tokens and internal errors.
3. Normalize source fields to the contract. Keep `sourceUrl` for visible attribution and include only supported capabilities.
4. Test success, malformed responses, missing capabilities, aborted requests, 429 with Retry-After, 401, 5xx and recovery using mocked HTTP. No tests require internet access or credentials.
5. Register the adapter in a server-only connector registry when that registry is introduced. The result service must consume the normalized contract, never provider-specific fields.

```ts
import type { TournamentConnector } from "./types";

export const fixtureConnector: TournamentConnector = {
  id: "fixture",
  async fetchTournament(externalId) {
    return {
      externalId,
      name: "Synthetic fixture tournament",
      sourceUrl: "https://example.invalid/tournaments/demo",
      capabilities: ["matches"],
    };
  },
};
```

This tutorial fixture performs no network calls and belongs in tests, not the production registry.

## Synchronization design requirements

start.gg is the only required delivered adapter. Use the official public GraphQL API with a server-side token stored in the runtime secret manager. Imported tournaments must be read-only locally. Upsert by connector ID and external ID, use source version/result identifiers for idempotency, and route results through the same audited cascade service as manual results.

Persist the last successful normalized snapshot with a freshness timestamp. Serve it while the source is unavailable. Respect upstream rate limits and Retry-After, use capped exponential backoff with jitter, prevent duplicate concurrent syncs, and automatically resume. Never erase a cached result on a transient failure. Derive Pick'em availability from capabilities and cancel a question if required data later becomes unavailable.

The adapter implementation, durable cache/scheduler, capability-aware builder and two real public imports are tracked separately in the roadmap. The source's terms and attribution requirements must be checked when implementation begins.
