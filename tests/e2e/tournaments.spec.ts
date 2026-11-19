import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("the seeded tournament flow is accessible and backed by the API", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/tournaments");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { id: string }[] };
  expect(body.data).toHaveLength(3);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tournaments", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("link", { name: /View tournament\s*:\s*Winter Open/ })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("mobile width and keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
