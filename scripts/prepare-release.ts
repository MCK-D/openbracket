import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseVersion = {
  tag: string;
  version: string;
  versionCode: number;
};

export function parseReleaseTag(tag: string): ReleaseVersion {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match)
    throw new Error(
      `Release tags must be stable SemVer like v1.2.3, got "${tag}".`,
    );
  const [major, minor, patch] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  if (minor > 99 || patch > 99)
    throw new Error("Minor and patch versions above 99 break versionCode.");
  return {
    tag,
    version: `${major}.${minor}.${patch}`,
    versionCode: major * 10000 + minor * 100 + patch,
  };
}

export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(
    `^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`,
  );
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1)
    throw new Error(
      `CHANGELOG.md has no dated "## [${version}] - YYYY-MM-DD" section.`,
    );
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  const body = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
  if (!body)
    throw new Error(`CHANGELOG.md section ${version} has no release notes.`);
  return body;
}

export function androidVersion(gradle: string): {
  versionName?: string;
  versionCode?: number;
} {
  const name = /versionName\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
  const code = /versionCode\s*=\s*(\d+)/.exec(gradle)?.[1];
  return {
    versionName: name,
    versionCode: code === undefined ? undefined : Number(code),
  };
}

export function prepareRelease(
  tag: string,
  files: { packageJson: string; changelog: string; gradle: string },
): string {
  const release = parseReleaseTag(tag);
  const { version } = JSON.parse(files.packageJson) as { version?: string };
  const android = androidVersion(files.gradle);
  const mismatches = [
    version !== release.version && `package.json version is ${version}`,
    android.versionName !== release.version &&
      `Android versionName is ${android.versionName}`,
    android.versionCode !== release.versionCode &&
      `Android versionCode is ${android.versionCode}, expected ${release.versionCode}`,
  ].filter(Boolean);
  if (mismatches.length)
    throw new Error(
      `Tag ${tag} does not match the source: ${mismatches.join("; ")}.`,
    );
  return changelogSection(files.changelog, release.version);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const [tag, output] = process.argv.slice(2);
  if (!tag || !output)
    throw new Error("Usage: prepare-release.ts <tag> <notes-output>");
  const notes = prepareRelease(tag, {
    packageJson: readFileSync("package.json", "utf8"),
    changelog: readFileSync("CHANGELOG.md", "utf8"),
    gradle: readFileSync("mobile/app/build.gradle.kts", "utf8"),
  });
  writeFileSync(output, `${notes}\n`);
  console.log(`Release ${tag} matches package.json, Android and CHANGELOG.md.`);
}
