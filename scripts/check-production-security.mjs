import process from "node:process";

const MAX_BACKUP_VERIFICATION_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_RESTORE_TEST_AGE_MS = 31 * 24 * 60 * 60 * 1000;
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

const baseUrl = process.env.APP_BASE_URL?.trim();

try {
  if (!baseUrl || new URL(baseUrl).protocol !== "https:") {
    throw new Error("invalid production URL");
  }
} catch {
  failures.push("APP_BASE_URL doit être une URL HTTPS valide en production.");
}

if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  failures.push("La clé service_role ne doit jamais utiliser un préfixe NEXT_PUBLIC_.");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!serviceRoleKey || !anonKey || serviceRoleKey === anonKey) {
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
