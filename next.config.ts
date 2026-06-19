import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDevelopment = process.env.NODE_ENV !== "production";
const strictCspEnabled = ["1", "true", "yes", "on"].includes(
  process.env.ECOFOODSTOCK_STRICT_CSP?.trim().toLowerCase() ?? ""
);
const configuredBuildCpus = Number.parseInt(process.env.ECOFOODSTOCK_BUILD_CPUS ?? "", 10);
const buildCpus = Number.isInteger(configuredBuildCpus) && configuredBuildCpus > 0 ? configuredBuildCpus : undefined;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.openfoodfacts.org https://static.openfoodfacts.org https://images.openfoodfacts.net",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org https://images.openfoodfacts.org https://static.openfoodfacts.org https://images.openfoodfacts.net${isDevelopment ? " ws: wss:" : ""}`,
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");
const securityHeaders = [
  ...(strictCspEnabled ? [] : [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"
  },
  ...(isDevelopment
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload"
        }
      ])
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    ...(buildCpus ? { cpus: buildCpus } : {}),
    optimizePackageImports: ["lucide-react"]
  },
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

const sentryBuildEnabled = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

const sentryNextConfig = sentryBuildEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.SENTRY_AUTH_TOKEN,
      webpack: {
        treeshake: {
          removeDebugLogging: true
        }
      }
    })
  : nextConfig;

export default sentryNextConfig;

