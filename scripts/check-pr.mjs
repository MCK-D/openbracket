import { execFileSync } from "node:child_process";
const body = process.env.PR_BODY ?? "";
if (
  !/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs)\s+(?:MCK-D\/openbracket)?#\d+/i.test(
    body,
  )
) {
  console.error(
    "Link an issue using Refs #123 or Closes #123 in the PR description.",
  );
  process.exit(1);
}
const issueNumber =
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs)\s+(?:MCK-D\/openbracket)?#(\d+)/i.exec(
    body,
  )?.[1];
const issue = JSON.parse(
  execFileSync("gh", ["api", `repos/MCK-D/openbracket/issues/${issueNumber}`], {
    encoding: "utf8",
  }),
);
if (issue.pull_request) {
  console.error("Link a real issue, not another pull request.");
  process.exit(1);
}
if (
  process.env.PR_BASE === "main" &&
  process.env.PR_HEAD !== "develop" &&
  !process.env.PR_HEAD?.startsWith("hotfix/")
) {
  console.error(
    "Production accepts promotion from develop or a hotfix/ branch only.",
  );
  process.exit(1);
}
console.log("Pull request policy passed.");
