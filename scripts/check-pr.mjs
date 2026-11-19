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
