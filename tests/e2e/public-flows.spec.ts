import { expect, test } from "@playwright/test";

test("login page renders and validates empty credentials", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "EcoFoodStock" })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();

  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByText("Email et mot de passe requis.", { exact: true })).toBeVisible();
});

test("signup requires legal consent before calling the API", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /créer un compte/i }).click();

  await page.getByPlaceholder(/Nom et pr/i).fill("Test Playwright");
  await page.getByPlaceholder("Email").fill("playwright@example.test");
  await page.getByPlaceholder("Mot de passe").fill("Motdepasse1");
  await page.getByRole("button", { name: /créer un compte/i }).click();

  await expect(page.getByText(/Vous devez accepter les CGU/i)).toBeVisible();
});

test("legal pages and PWA manifest are publicly available", async ({ page, request }) => {
  await page.goto("/legal/terms");
  await expect(page.getByRole("heading", { name: /Conditions générales/i })).toBeVisible();

  await page.goto("/legal/privacy");
  await expect(page.getByRole("heading", { name: /Politique de confidentialité/i })).toBeVisible();

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as { name?: string; icons?: unknown[] };
  expect(manifest.name).toContain("EcoFoodStock");
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
});

test("protected pages redirect unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/inventory");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  await expect(page.getByRole("heading", { name: "EcoFoodStock" })).toBeVisible();
});
