import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders data-driven dashboard and completes the public demo", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Agent CFO for Arc" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Spend activity/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Spend flow/ })).toBeVisible();

  const walletInput = page.getByRole("textbox", { name: "Agent Wallet Address" });
  const demoWallet = await walletInput.inputValue();
  await walletInput.fill("not-a-wallet");
  await expect(walletInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid EVM wallet address.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze Wallet" })).toBeDisabled();
  await walletInput.fill(demoWallet);
  await expect(walletInput).toHaveAttribute("aria-invalid", "false");

  const paymentMeasure = page.getByRole("button", { name: "Payments", exact: true });
  await paymentMeasure.click();
  await expect(paymentMeasure).toHaveAttribute("aria-pressed", "true");

  await walletInput.press("Enter");
  await expect(page.getByText(/DEMO · Recalculated/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Run Demo Agent" }).click();
  await expect(
    page.getByText(/Demo agent completed\. \d+ x402-style payments generated\./),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /Spend activity/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("navigates every public workspace page", async ({ page }) => {
  await page.goto("/");
  const destinations = [
    ["Wallets", "/wallets"],
    ["Spend", "/spend"],
    ["Providers", "/providers"],
    ["Budgets", "/budgets"],
    ["Risks", "/risks"],
    ["Tasks", "/tasks"],
    ["Reports", "/reports"],
    ["Settings", "/settings"],
  ] as const;

  for (const [label, path] of destinations) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("honors reduced motion and contains mobile overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile layout assertion");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator('[data-motion="reduced"]').first()).toBeVisible();
  await expect(page.locator('[data-motion="full"]')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});
