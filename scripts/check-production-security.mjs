import process from "node:process";

const MAX_BACKUP_VERIFICATION_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_RESTORE_TEST_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_OPERATIONAL_SECURITY_REVIEW_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const failures = [];

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function requireRecentDate(name, maximumAgeMs) {
  const value = process.env[name]?.trim();
  const timestamp = Date.parse(value ?? "");
  const now = Date.now();

  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000 || now - timestamp > maximumAgeMs) {
    failures.push(`${name} doit contenir une date ISO récente et vérifiée.`);
  }
}

if (!isEnabled(process.env.ECOFOODSTOCK_STRICT_CSP)) {
  failures.push("ECOFOODSTOCK_STRICT_CSP doit être activé en production.");
}

if (!isEnabled(process.env.ECOFOODSTOCK_BACKUPS_ENABLED)) {
  failures.push("ECOFOODSTOCK_BACKUPS_ENABLED doit confirmer l'activation réelle des backups Supabase.");
}

requireRecentDate("ECOFOODSTOCK_BACKUP_VERIFIED_AT", MAX_BACKUP_VERIFICATION_AGE_MS);
requireRecentDate("ECOFOODSTOCK_RESTORE_TESTED_AT", MAX_RESTORE_TEST_AGE_MS);
requireRecentDate("ECOFOODSTOCK_AUTH_REDIRECTS_VERIFIED_AT", MAX_OPERATIONAL_SECURITY_REVIEW_AGE_MS);
requireRecentDate("ECOFOODSTOCK_SERVICE_ROLE_REVIEWED_AT", MAX_OPERATIONAL_SECURITY_REVIEW_AGE_MS);

const baseUrl = process.env.APP_BASE_URL?.trim();

try {
  const parsedBaseUrl = new URL(baseUrl ?? "");
  if (
    parsedBaseUrl.protocol !== "https:" ||
    (parsedBaseUrl.pathname !== "/" && parsedBaseUrl.pathname !== "") ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new Error("invalid production URL");
  }
} catch {
  failures.push("APP_BASE_URL doit être une origine HTTPS valide, sans chemin, query ou fragment.");
}

try {
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
  if (supabaseUrl.protocol !== "https:") {
    throw new Error("invalid Supabase URL");
  }
} catch {
  failures.push("NEXT_PUBLIC_SUPABASE_URL doit être une URL HTTPS valide.");
}

const clientIpStrategy = process.env.ECOFOODSTOCK_CLIENT_IP_STRATEGY?.trim().toLowerCase();
if (!["auto", "vercel", "cloudflare", "trusted-proxy"].includes(clientIpStrategy ?? "")) {
  failures.push("ECOFOODSTOCK_CLIENT_IP_STRATEGY doit désigner un proxy de production approuvé.");
}

if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  failures.push("La clé service_role ne doit jamais utiliser un préfixe NEXT_PUBLIC_.");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (
  !serviceRoleKey ||
  !anonKey ||
  serviceRoleKey === anonKey ||
  serviceRoleKey.toLowerCase().includes("your-service-role-key")
) {
  failures.push("Les clés Supabase serveur et anon doivent être présentes et distinctes.");
}

if (failures.length > 0) {
  console.error("Contrôle sécurité production échoué :");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Contrôle sécurité production réussi.");
