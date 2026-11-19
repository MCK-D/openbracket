import { waitForRevision } from "../src/server/domain/deployment";
const { APP_URL, COMMIT } = process.env;
if (!APP_URL || !COMMIT) throw new Error("APP_URL and COMMIT are required.");
await waitForRevision(APP_URL, COMMIT);
console.log(`Deployment healthy at revision ${COMMIT}.`);
