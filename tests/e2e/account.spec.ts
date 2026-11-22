import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations;

test("a visitor registers, reaches the account page and signs out everywhere", async ({
  page,
}) => {
  await page.goto("/register");
  expect(await axe(page)).toEqual([]);
  await page.getByLabel("Display name").fill("E2E Player");
  await page
    .getByLabel("Email")
    .fill(
      `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    );
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/account");
  await expect(page.getByText("Player: enter tournaments")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/account");
  await page.waitForURL((url) => url.pathname === "/api/auth/signin");
});

test("cross-site account mutations are refused", async ({ request }) => {
  const response = await request.post("/api/trpc/account.register", {
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    data: {
      json: {
        name: "Forged",
        email: "forged@example.invalid",
        password: "correct horse battery",
        role: "PLAYER",
      },
    },
  });
  expect(response.status()).toBe(403);
});
