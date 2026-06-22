import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { IosInstallHelper } from "@/components/shared/IosInstallHelper";
import { PwaInstallPrompt } from "@/components/shared/PwaInstallPrompt";
import { ServiceWorkerRegister } from "@/components/shared/ServiceWorkerRegister";
import { isStrictCspEnabled } from "@/lib/security/csp";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "EcoFoodStock",
  description: "Assistant domestique pour stock alimentaire et DLC",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "EcoFoodStock"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = isStrictCspEnabled() ? ((await headers()).get("x-nonce") ?? undefined) : undefined;

  return (
    <html
      lang="fr"
      data-theme="light"
      data-theme-preference="system"
      suppressHydrationWarning
    >
      <body>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
                  var preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
                  var isDark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  var theme = isDark ? "dark" : "light";
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.dataset.themePreference = preference;
                } catch {
                  document.documentElement.dataset.theme = "light";
                  document.documentElement.dataset.themePreference = "system";
                }
              })();
            `
          }}
        />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.__ecofoodstockInstallPromptCaptureReady) return;
                window.__ecofoodstockInstallPromptCaptureReady = true;

                window.addEventListener("beforeinstallprompt", function (event) {
                  event.preventDefault();
                  window.__ecofoodstockBeforeInstallPrompt = event;
                  window.dispatchEvent(new Event("ecofoodstock:beforeinstallprompt"));
                });

                window.addEventListener("appinstalled", function () {
                  window.__ecofoodstockBeforeInstallPrompt = null;
                  window.dispatchEvent(new Event("ecofoodstock:appinstalled"));
                });
              })();
            `
          }}
        />
        {children}
        <PwaInstallPrompt />
        <IosInstallHelper />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

