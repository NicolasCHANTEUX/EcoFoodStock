import type { Page, Route } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const email = "playwright@example.test";
const accessToken = "playwright-access-token";

const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email,
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Test Playwright" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

export type MockAccount = {
  onboardingCompleted: boolean;
};

export async function installMockAuthentication(page: Page, initialOnboardingCompleted = true) {
  const account: MockAccount = { onboardingCompleted: initialOnboardingCompleted };

  await page.route("**/auth/v1/**", async (route) => {
    await fulfillSupabaseAuthRoute(route);
  });

  await page.route("**/api/account/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        onboardingCompleted: account.onboardingCompleted,
        householdId: "22222222-2222-4222-8222-222222222222",
        householdName: "Foyer Playwright",
        displayName: "Test Playwright",
        email
      })
    });
  });

  return account;
}

export async function signInWithMockAccount(page: Page, onboardingCompleted = true) {
  const account = await installMockAuthentication(page, onboardingCompleted);

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Mot de passe").fill("Motdepasse1");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(onboardingCompleted ? "**/dashboard" : "**/onboarding");

  return account;
}

async function fulfillSupabaseAuthRoute(route: Route) {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info"
  };

  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }

  if (pathname.endsWith("/auth/v1/token")) {
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "playwright-refresh-token",
        user
      })
    });
    return;
  }

  if (pathname.endsWith("/auth/v1/user")) {
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
      body: JSON.stringify(user)
    });
    return;
  }

  if (pathname.endsWith("/auth/v1/logout")) {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }

  await route.fulfill({
    status: 404,
    headers: { ...corsHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "Unhandled mocked auth request" })
  });
}
