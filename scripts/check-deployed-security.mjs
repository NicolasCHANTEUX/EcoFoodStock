import process from "node:process";

const REQUEST_TIMEOUT_MS = 15_000;
const failures = [];
const configuredBaseUrl = process.env.DEPLOYED_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
let baseUrl;

try {
  baseUrl = new URL(configuredBaseUrl ?? "");
  if (baseUrl.protocol !== "https:") {
    throw new Error("HTTPS required");
  }
} catch {
  console.error("DEPLOYED_BASE_URL doit être une URL HTTPS valide.");
  process.exit(1);
}

function requireHeader(headers, name, predicate, expectation) {
  const value = headers.get(name) ?? "";
  if (!predicate(value)) {
    failures.push(`${name} ${expectation}.`);
  }
  return value;
}

async function fetchChecked(pathname) {
  try {
    return await fetch(new URL(pathname, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "EcoFoodStock-Production-Security-Check"
      }
    });
  } catch {
    failures.push(`${pathname} est inaccessible ou a dépassé ${REQUEST_TIMEOUT_MS} ms.`);
    return null;
  }
}

const loginResponse = await fetchChecked("/login");

if (loginResponse) {
  if (loginResponse.status !== 200) {
    failures.push(`/login doit répondre 200, statut reçu : ${loginResponse.status}.`);
  }

  const csp = requireHeader(
    loginResponse.headers,
    "content-security-policy",
    (value) =>
      value.includes("script-src 'self' 'nonce-") &&
      value.includes("style-src 'self' 'nonce-") &&
      value.includes("frame-ancestors 'none'") &&
      !value.includes("unsafe-inline"),
    "doit utiliser des nonces script/style, interdire les frames et exclure unsafe-inline"
  );
  requireHeader(
    loginResponse.headers,
    "strict-transport-security",
    (value) => /max-age=\d+/.test(value),
    "doit être activé"
  );
  requireHeader(loginResponse.headers, "x-content-type-options", (value) => value === "nosniff", "doit valoir nosniff");
  requireHeader(loginResponse.headers, "x-frame-options", (value) => value === "DENY", "doit valoir DENY");
  requireHeader(
    loginResponse.headers,
    "referrer-policy",
    (value) => value === "strict-origin-when-cross-origin",
    "doit valoir strict-origin-when-cross-origin"
  );
  requireHeader(loginResponse.headers, "permissions-policy", (value) => value.includes("geolocation=()"), "doit limiter les permissions navigateur");

  const html = await loginResponse.text();
  const inlineStyleCount = (html.match(/<[^>]+\sstyle=/gi) ?? []).length;
  const scriptsWithoutNonce = (html.match(/<script(?![^>]*\snonce=)[^>]*>/gi) ?? []).length;
  const stylesWithoutNonce = (html.match(/<style(?![^>]*\snonce=)[^>]*>/gi) ?? []).length;

  if (inlineStyleCount > 0 || scriptsWithoutNonce > 0 || stylesWithoutNonce > 0) {
    failures.push("Le HTML déployé contient des styles inline ou des balises script/style sans nonce.");
  }

  if (!csp) {
    failures.push("La CSP déployée est absente.");
  }
}

const healthResponse = await fetchChecked("/api/health/summary");

if (healthResponse) {
  if (healthResponse.status !== 401) {
    failures.push(`/api/health/summary doit refuser une requête anonyme avec 401, statut reçu : ${healthResponse.status}.`);
  }

  const body = await healthResponse.text();
  if (/stack|postgres|relation .* does not exist|supabase_service_role_key/i.test(body)) {
    failures.push("La réponse anonyme de l'API santé semble exposer un détail interne.");
  }
}

if (failures.length > 0) {
  console.error("Audit dynamique production échoué :");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Audit dynamique production réussi.");
