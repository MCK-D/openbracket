import { expect, it } from "vitest";
import {
  changelogSection,
  parseReleaseTag,
  prepareRelease,
} from "../../scripts/prepare-release";

const changelog = `# Changelog

## [Unreleased]

- Pending work.

## [0.2.0] - 2026-12-13

- Tournament engines.

## [0.1.0] - 2026-11-29

- Foundation.
`;
const gradle = `versionCode = 200\n        versionName = "0.2.0"`;
const packageJson = JSON.stringify({ version: "0.2.0" });

it("derives a monotonic Android versionCode from a stable SemVer tag", () => {
  expect(parseReleaseTag("v0.1.0").versionCode).toBe(100);
  expect(parseReleaseTag("v1.0.0").versionCode).toBe(10000);
  expect(parseReleaseTag("v1.2.3").versionCode).toBeGreaterThan(
    parseReleaseTag("v1.2.2").versionCode,
  );
});

it("rejects pre-release, unprefixed, padded and overflowing tags", () => {
  for (const tag of ["v1.0.0-rc.1", "1.0.0", "v01.0.0", "v1.0", "v0.100.0"])
    expect(() => parseReleaseTag(tag)).toThrow();
});

it("returns only the matching dated changelog section", () => {
  expect(changelogSection(changelog, "0.2.0")).toBe("- Tournament engines.");
  expect(changelogSection(changelog, "0.1.0")).toBe("- Foundation.");
  expect(() => changelogSection(changelog, "0.3.0")).toThrow("no dated");
  expect(() =>
    changelogSection("## [0.3.0] - 2027-01-03\n\n## [0.2.0] - x", "0.3.0"),
  ).toThrow("no release notes");
});

it("refuses a tag that disagrees with the web or Android version", () => {
  expect(prepareRelease("v0.2.0", { packageJson, changelog, gradle })).toBe(
    "- Tournament engines.",
  );
  expect(() =>
    prepareRelease("v0.1.0", { packageJson, changelog, gradle }),
  ).toThrow(/package\.json.*versionName.*versionCode/);
  expect(() =>
    prepareRelease("v0.2.0", {
      packageJson,
      changelog,
      gradle: gradle.replace("200", "1"),
    }),
  ).toThrow("versionCode is 1, expected 200");
});
