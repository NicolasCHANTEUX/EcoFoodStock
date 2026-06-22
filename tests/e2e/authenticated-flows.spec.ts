import { expect, test } from "@playwright/test";
import { signInWithMockAccount } from "./helpers/mock-auth";

test("a new user completes onboarding and reaches the dashboard", async ({ page }) => {
  let submittedProfile: Record<string, unknown> | null = null;

  const account = await signInWithMockAccount(page, false);

  await page.route("**/api/onboarding/complete", async (route) => {
    submittedProfile = route.request().postDataJSON() as Record<string, unknown>;
    account.onboardingCompleted = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.getByRole("button", { name: /2\s+pers\./i }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Omnivore/i }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Mode Grand Public/i }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Homme/i }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Plus tard" }).click();

  await page.waitForURL("**/dashboard");
  expect(submittedProfile).toMatchObject({
    householdSize: 2,
    diet: "omnivore",
    appMode: "general_public",
    notifications: {
      expiryAlerts: false,
      nutritionReminders: false,
      recipeSuggestions: false
    }
  });
});

test("consuming an inventory item updates its quantity", async ({ page }) => {
  let quantity = 2;
  let submittedAction: Record<string, unknown> | null = null;

  await page.route("**/api/inventory/actions", async (route) => {
    submittedAction = route.request().postDataJSON() as Record<string, unknown>;
    quantity -= Number(submittedAction.quantity);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/inventory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        inventory: [
          {
            id: "stock-1",
            productId: "product-1",
            name: "Pommes",
            icon: "P",
            quantity,
            unit: "pieces",
            storageArea: "fresh"
          }
        ]
      })
    });
  });

  await signInWithMockAccount(page);
  await page.goto("/inventory");
  await expect(page.getByText("2 pièces", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Consomm/i }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();

  await expect(page.getByText("1 pièce", { exact: true })).toBeVisible();
  expect(submittedAction).toMatchObject({
    productId: "product-1",
    action: "consume",
    quantity: 1,
    storageArea: "fresh",
    unit: "pieces"
  });
});

test("account export explains shared data and downloads a CSV", async ({ page }) => {
  await page.route("**/api/settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          householdSize: 2,
          diet: "omnivore",
          appMode: "general_public",
          age: 30,
          weightKg: 70,
          heightCm: 175,
          sex: "other",
          goal: "maintenance",
          dailyCaloriesAdjustment: 0
        }
      })
    });
  });
  await page.route("**/api/account/export", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: "section,field,value\nprofile,email,playwright@example.test\n"
    });
  });

  await signInWithMockAccount(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: /Compte & sécurité/i }).click();

  await expect(page.getByText(/données des foyers auxquels vous appartenez/i)).toBeVisible();
  await expect(page.getByText(/peuvent concerner d'autres membres/i)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^ecofoodstock-export-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText("Export CSV téléchargé.", { exact: true })).toBeVisible();
});
