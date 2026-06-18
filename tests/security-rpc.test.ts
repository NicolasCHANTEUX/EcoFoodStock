import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source: string, expected: string, context: string) {
  assert.ok(source.includes(expected), `${context} should include: ${expected}`);
}

function assertNotIncludes(source: string, forbidden: string, context: string) {
  assert.equal(source.includes(forbidden), false, `${context} should not include: ${forbidden}`);
}

function assertOrdered(source: string, orderedSnippets: string[], context: string) {
  let previousIndex = -1;

  for (const snippet of orderedSnippets) {
    const currentIndex = source.indexOf(snippet);
    assert.notEqual(currentIndex, -1, `${context} should include: ${snippet}`);
    assert.ok(currentIndex > previousIndex, `${context} should keep this order around: ${snippet}`);
    previousIndex = currentIndex;
  }
}

function assertServiceRoleOnlyRpc(sql: string, signature: string, context: string) {
  assertIncludes(sql, `revoke execute on function public.${signature}`, context);
  assertIncludes(sql, "from PUBLIC", context);
  assertIncludes(sql, "anon", context);
  assertIncludes(sql, "authenticated", context);
  assertIncludes(sql, `grant execute on function public.${signature}`, context);
  assertIncludes(sql, "to service_role", context);
}

function assertUserHouseholdGuard(sql: string, householdReference: string, context: string) {
  assertOrdered(
    sql,
    [
      "if p_user_id is null then",
      "if coalesce(auth.role(), '') <> 'service_role' then",
      "raise exception 'Forbidden user context'",
      "from household_members hm",
      householdReference,
      "raise exception 'Forbidden household access'"
    ],
    context
  );
}

test("critical RPCs verify user and household access even when executed through service_role", () => {
  const batchRpc = readProjectFile("sql/create-inventory-batch-rpc.sql");
  const actionRpc = readProjectFile("sql/apply-inventory-action-rpc.sql");
  const undoRpc = readProjectFile("sql/undo-activity-event-rpc.sql");
  const shoppingRpc = readProjectFile("sql/apply-shopping-action-rpc.sql");

  assertUserHouseholdGuard(batchRpc, "hm.household_id = p_household_id", "create inventory batch RPC");
  assertUserHouseholdGuard(actionRpc, "hm.household_id = p_household_id", "apply inventory action RPC");
  assertUserHouseholdGuard(undoRpc, "hm.household_id = v_event.household_id", "undo activity event RPC");
  assertUserHouseholdGuard(shoppingRpc, "hm.household_id = p_household_id", "apply shopping action RPC");
});

test("critical RPC execution is revoked from public client roles", () => {
  const rpcChecks = [
    {
      path: "sql/create-inventory-batch-rpc.sql",
      signature: "create_inventory_batch_with_activity(uuid, uuid, uuid, text, numeric, text, text, date, text, text)"
    },
    {
      path: "sql/apply-inventory-action-rpc.sql",
      signature: "apply_inventory_action(uuid, uuid, uuid, text, numeric, text, text)"
    },
    {
      path: "sql/undo-activity-event-rpc.sql",
      signature: "undo_activity_event(uuid, uuid)"
    },
    {
      path: "sql/create-invitation-token-rpc.sql",
      signature: "create_invitation_token(uuid, uuid, text, timestamptz)"
    },
    {
      path: "sql/join-household-with-invitation-rpc.sql",
      signature: "join_household_with_invitation(text, uuid)"
    },
    {
      path: "sql/delete-application-account-rpc.sql",
      signature: "delete_application_account_data(uuid)"
    },
    {
      path: "sql/rate-limit-rpc.sql",
      signature: "check_rate_limit(text, text, integer, integer)"
    },
    {
      path: "sql/apply-shopping-action-rpc.sql",
      signature: "apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean)"
    }
  ];

  for (const check of rpcChecks) {
    assertServiceRoleOnlyRpc(readProjectFile(check.path), check.signature, check.path);
  }
});

test("distributed rate limit RPC hashes subjects and locks counters", () => {
  const rateLimitRpc = readProjectFile("sql/rate-limit-rpc.sql");

  assertIncludes(rateLimitRpc, "create table if not exists public.rate_limits", "rate limit RPC");
  assertIncludes(rateLimitRpc, "subject_hash text not null", "rate limit RPC");
  assertIncludes(rateLimitRpc, "create extension if not exists pgcrypto", "rate limit RPC");
  assertIncludes(rateLimitRpc, "set search_path = public, extensions", "rate limit RPC");
  assertIncludes(rateLimitRpc, "encode(digest(btrim(p_subject), 'sha256'), 'hex')", "rate limit RPC");
  assertOrdered(
    rateLimitRpc,
    [
      "v_rate_key := p_scope || ':' || v_subject_hash;",
      "if random() < 0.01 then",
      "delete from public.rate_limits",
      "where expires_at < v_now - interval '5 minutes';\n  end if;",
      "loop"
    ],
    "rate limit RPC cleanup"
  );
  assertIncludes(rateLimitRpc, "where rate_key = v_rate_key\n    for update", "rate limit RPC");
  assertIncludes(rateLimitRpc, "exception when unique_violation then", "rate limit RPC");
  assertIncludes(rateLimitRpc, "alter table public.rate_limits enable row level security", "rate limit RPC");
  assertIncludes(rateLimitRpc, "revoke all on table public.rate_limits from anon", "rate limit RPC");
  assertIncludes(rateLimitRpc, "revoke all on table public.rate_limits from authenticated", "rate limit RPC");
  assertServiceRoleOnlyRpc(rateLimitRpc, "check_rate_limit(text, text, integer, integer)", "rate limit RPC");
});

test("sensitive API routes use the distributed rate limiter", () => {
  const routeChecks = [
    "src/app/api/auth/signup/route.ts",
    "src/app/api/products/lookup/[barcode]/route.ts",
    "src/app/api/images/route.ts",
    "src/app/api/household/invite/route.ts",
    "src/app/api/household/join/route.ts",
    "src/app/api/inventory/actions/route.ts",
    "src/app/api/inventory/batches/route.ts",
    "src/app/api/shopping/route.ts"
  ];

  for (const routePath of routeChecks) {
    const source = readProjectFile(routePath);
    assertIncludes(source, "checkRateLimits", routePath);
    assertIncludes(source, "createRateLimitResponse", routePath);
  }

  const signupRoute = readProjectFile("src/app/api/auth/signup/route.ts");
  assertNotIncludes(signupRoute, "signupAttempts", "signup route");
  assertNotIncludes(signupRoute, "new Map<string, number[]>", "signup route");
});

test("CI builds Next.js and pins the Supabase CLI version", () => {
  const ciWorkflow = readProjectFile(".github/workflows/ci.yml");
  const dependabotConfig = readProjectFile(".github/dependabot.yml");
  const dependencyAuditWorkflow = readProjectFile(".github/workflows/dependency-audit.yml");

  assertIncludes(ciWorkflow, "- name: Build\n        run: npm run build", "CI workflow");
  assertIncludes(ciWorkflow, "npm audit --omit=dev --audit-level=high", "CI workflow");
  assertIncludes(ciWorkflow, "node-version: 24", "CI workflow");
  assertNotIncludes(ciWorkflow, "node-version: 20", "CI workflow");
  assertIncludes(ciWorkflow, "uses: supabase/setup-cli@v2", "CI workflow");
  assertIncludes(ciWorkflow, "version: 2.107.0", "CI workflow");
  assertNotIncludes(ciWorkflow, "version: latest", "CI workflow");
  assertIncludes(ciWorkflow, "name: Playwright E2E", "CI workflow");
  assertIncludes(ciWorkflow, "npx playwright install --with-deps chromium", "CI workflow");
  assertIncludes(ciWorkflow, "run: npm run test:e2e", "CI workflow");
  assertIncludes(dependabotConfig, "package-ecosystem: npm", "Dependabot config");
  assertIncludes(dependabotConfig, "package-ecosystem: github-actions", "Dependabot config");
  assertIncludes(dependabotConfig, "interval: weekly", "Dependabot config");
  assertIncludes(dependencyAuditWorkflow, "schedule:", "dependency audit workflow");
  assertIncludes(dependencyAuditWorkflow, "workflow_dispatch:", "dependency audit workflow");
  assertIncludes(dependencyAuditWorkflow, "npm audit --omit=dev --audit-level=high", "dependency audit workflow");
});

test("production observability captures errors and avoids raw server logs", () => {
  const instrumentation = readProjectFile("src/instrumentation.ts");
  const serverConfig = readProjectFile("src/sentry.server.config.ts");
  const clientConfig = readProjectFile("src/instrumentation-client.ts");
  const logger = readProjectFile("src/lib/observability/logger.ts");

  assertIncludes(instrumentation, "Sentry.captureRequestError", "Sentry instrumentation");
  assertIncludes(serverConfig, "sendDefaultPii: false", "Sentry server config");
  assertIncludes(clientConfig, "sendDefaultPii: false", "Sentry client config");
  assertIncludes(logger, "SENSITIVE_KEY_PATTERN", "structured logger");
  assertIncludes(logger, "Sentry.captureException", "structured logger");
  assertIncludes(logger, "JSON.stringify(record)", "structured logger");

  const rawConsoleFiles = [
    "src/services/inventory-service.ts",
    "src/services/shopping-service.ts",
    "src/services/household-invitations-service.ts",
    "src/services/activity-undo-service.ts",
    "src/lib/rate-limit.ts",
    "src/lib/open-food-facts.ts",
    "src/app/api/auth/signup/route.ts",
    "src/app/api/account/delete/route.ts",
    "src/app/api/images/route.ts",
    "src/app/api/settings/route.ts"
  ];

  for (const routePath of rawConsoleFiles) {
    assertNotIncludes(readProjectFile(routePath), "console.", routePath);
  }
});

test("image proxy has bounded upstream fetches, CDN caching and miss-only rate limits", () => {
  const imageRoute = readProjectFile("src/app/api/images/route.ts");

  assertIncludes(imageRoute, "const IMAGE_FETCH_TIMEOUT_MS = 5_000", "image proxy");
  assertIncludes(imageRoute, "const MAX_CACHED_IMAGES = 40", "image proxy");
  assertIncludes(imageRoute, "MAX_IMAGE_CACHE_BYTES", "image proxy");
  assertIncludes(imageRoute, "readLimitedImageBody", "image proxy");
  assertIncludes(imageRoute, "MAX_IMAGE_BYTES", "image proxy");
  assertIncludes(imageRoute, "redirect: \"manual\"", "image proxy");
  assertIncludes(imageRoute, "CDN-Cache-Control", "image proxy");
  assertIncludes(imageRoute, "Vercel-CDN-Cache-Control", "image proxy");
  assertIncludes(imageRoute, "stale-if-error", "image proxy");
  assertIncludes(imageRoute, "X-EcoFoodStock-Image-Cache", "image proxy");
  assertIncludes(imageRoute, "image_proxy:asset_by_ip", "image proxy");
  assertIncludes(imageRoute, "image_proxy:asset_global", "image proxy");
  assertIncludes(imageRoute, "kind: \"error\"", "image proxy");
  assertOrdered(
    imageRoute,
    [
      "const cachedImage = getCachedImage(cacheKey);",
      "if (cachedImage?.kind === \"image\")",
      "if (cachedImage?.kind === \"error\")",
      "const clientIp = getClientIp(req);",
      "scope: \"image_proxy:asset_global\"",
      "const fetchedImage = await fetchImagePayload(cacheKey);"
    ],
    "image proxy cache and rate limit flow"
  );
});

test("shopping mutations are delegated to a transactional RPC", () => {
  const shoppingRoute = readProjectFile("src/app/api/shopping/route.ts");
  const shoppingService = readProjectFile("src/services/shopping-service.ts");
  const shoppingRpc = readProjectFile("sql/apply-shopping-action-rpc.sql");

  assertIncludes(shoppingRoute, "mutateShoppingState", "shopping route");
  assertNotIncludes(shoppingRoute, ".from(\"shopping_lists\")", "shopping route");
  assertNotIncludes(shoppingRoute, ".from(\"shopping_items\")", "shopping route");
  assertNotIncludes(shoppingRoute, ".from(\"activity_events\")", "shopping route");

  assertIncludes(shoppingService, ".rpc(\"apply_shopping_action\"", "shopping service");
  assertIncludes(shoppingService, "loadShoppingState", "shopping service");
  assertIncludes(shoppingService, "isMissingRpcError(error.message, error.code, \"apply_shopping_action\")", "shopping service");

  assertIncludes(shoppingRpc, "from public.households h\n  where h.id = p_household_id\n  for update", "shopping RPC");
  assertIncludes(shoppingRpc, "from public.shopping_lists sl", "shopping RPC");
  assertIncludes(shoppingRpc, "limit 1\n  for update", "shopping RPC");
  assertIncludes(shoppingRpc, "insert into public.shopping_items", "shopping RPC");
  assertIncludes(shoppingRpc, "update public.shopping_items", "shopping RPC");
  assertIncludes(shoppingRpc, "delete from public.shopping_items", "shopping RPC");
  assertIncludes(shoppingRpc, "update public.shopping_lists", "shopping RPC");
  assertIncludes(shoppingRpc, "insert into public.activity_events", "shopping RPC");
  assertIncludes(shoppingRpc, "jsonb_build_object(\n        'source', 'shopping'", "shopping RPC");
  assertServiceRoleOnlyRpc(
    shoppingRpc,
    "apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean)",
    "shopping RPC"
  );
});

test("inventory action and undo RPCs use database locking for critical mutable rows", () => {
  const actionRpc = readProjectFile("sql/apply-inventory-action-rpc.sql");
  const undoRpc = readProjectFile("sql/undo-activity-event-rpc.sql");

  assertIncludes(actionRpc, "for update", "apply inventory action RPC");
  assertIncludes(actionRpc, "where household_id = p_household_id", "apply inventory action RPC");
  assertIncludes(actionRpc, "quantity_remaining > 0", "apply inventory action RPC");
  assertIncludes(undoRpc, "where id = p_event_id\n  for update", "undo activity event RPC");
  assertIncludes(undoRpc, "where id = v_effective_batch_id\n      for update", "undo activity event RPC");
});

test("invitation RPCs are atomic and enforce invitation ownership rules", () => {
  const createInviteRpc = readProjectFile("sql/create-invitation-token-rpc.sql");
  const joinInviteRpc = readProjectFile("sql/join-household-with-invitation-rpc.sql");

  assertIncludes(createInviteRpc, "hm.role in ('owner', 'admin')", "create invitation RPC");
  assertIncludes(createInviteRpc, "created_by", "create invitation RPC");
  assertServiceRoleOnlyRpc(createInviteRpc, "create_invitation_token(uuid, uuid, text, timestamptz)", "create invitation RPC");

  assertIncludes(joinInviteRpc, "create unique index if not exists household_members_household_user_unique", "join invitation RPC");
  assertIncludes(joinInviteRpc, "where it.token = p_token\n  for update", "join invitation RPC");
  assertIncludes(joinInviteRpc, "exception when unique_violation then", "join invitation RPC");
  assertIncludes(joinInviteRpc, "set consumed_at = v_now", "join invitation RPC");
  assertServiceRoleOnlyRpc(joinInviteRpc, "join_household_with_invitation(text, uuid)", "join invitation RPC");
});

test("settings history does not store sensitive profile snapshots", () => {
  const settingsRoute = readProjectFile("src/app/api/settings/route.ts");
  const backfillSql = readProjectFile("sql/backfill-history-can-undo.sql");

  assertIncludes(settingsRoute, "changed_fields: changedFields", "settings history");
  assertIncludes(settingsRoute, "sensitive_fields_changed", "settings history");
  assertIncludes(settingsRoute, "can_undo: false", "settings history");
  assertNotIncludes(settingsRoute, "previous_profile", "settings history");
  assertNotIncludes(settingsRoute, "next_profile", "settings history");
  assertNotIncludes(settingsRoute, "original_error", "settings history");

  assertIncludes(backfillSql, "coalesce(metadata->>'section', '') <> 'settings'", "history backfill");
  assertNotIncludes(backfillSql, "coalesce(metadata->>'section', '') = 'settings'", "history backfill");
});

test("Open Food Facts product lookup uses a persistent database cache", () => {
  const cacheSql = readProjectFile("sql/open-food-facts-persistent-cache.sql");
  const lookupRoute = readProjectFile("src/app/api/products/lookup/[barcode]/route.ts");

  assertIncludes(cacheSql, "off_last_fetched_at timestamptz", "Open Food Facts cache migration");
  assertIncludes(cacheSql, "off_fetch_status text not null default 'unknown'", "Open Food Facts cache migration");
  assertIncludes(cacheSql, "off_quantity_value numeric(10,3)", "Open Food Facts cache migration");
  assertIncludes(cacheSql, "products_off_fetch_status_check", "Open Food Facts cache migration");
  assertIncludes(cacheSql, "products_off_cache_idx", "Open Food Facts cache migration");

  assertIncludes(lookupRoute, "lookupOpenFoodFactsProductStatus", "product lookup route");
  assertIncludes(lookupRoute, "off_last_fetched_at", "product lookup route");
  assertIncludes(lookupRoute, "off_fetch_status", "product lookup route");
  assertIncludes(lookupRoute, "OFF_PERSISTED_FOUND_TTL_MS", "product lookup route");
  assertIncludes(lookupRoute, "isPersistedOffCacheFresh", "product lookup route");
  assertIncludes(lookupRoute, "updateCatalogProductWithOffData", "product lookup route");
});

test("Supabase migrations include the critical RPC and policy files", () => {
  const migrationsDir = path.join(root, "supabase", "migrations");
  assert.ok(existsSync(migrationsDir), "supabase/migrations should exist");

  const migrations = readdirSync(migrationsDir).sort();
  const expectedMigrations = [
    "20260616_000_initial_schema.sql",
    "20260616_060_enable_rls_policies.sql",
    "20260616_070_create_inventory_batch_rpc.sql",
    "20260616_080_apply_inventory_action_rpc.sql",
    "20260616_090_undo_activity_event_rpc.sql",
    "20260616_110_create_invitation_token_rpc.sql",
    "20260616_120_join_household_with_invitation_rpc.sql",
    "20260616_130_rate_limit_rpc.sql",
    "20260616_140_apply_shopping_action_rpc.sql",
    "20260616_150_rate_limit_probabilistic_cleanup.sql",
    "20260616_160_open_food_facts_persistent_cache.sql",
    "20260618_170_rate_limit_pgcrypto_search_path.sql"
  ];

  for (const migration of expectedMigrations) {
    assert.ok(migrations.includes(migration), `missing migration: ${migration}`);
  }

  assert.ok(
    migrations.indexOf("20260616_060_enable_rls_policies.sql") <
      migrations.indexOf("20260616_070_create_inventory_batch_rpc.sql"),
    "RLS migration should run before RPC migrations"
  );

  assert.ok(
    migrations.indexOf("20260616_120_join_household_with_invitation_rpc.sql") <
      migrations.indexOf("20260616_130_rate_limit_rpc.sql"),
    "rate limit migration should run after invitation RPC migrations"
  );

  assert.ok(
    migrations.indexOf("20260616_130_rate_limit_rpc.sql") <
      migrations.indexOf("20260616_140_apply_shopping_action_rpc.sql"),
    "shopping action migration should run after rate limit migration"
  );

  assert.ok(
    migrations.indexOf("20260616_140_apply_shopping_action_rpc.sql") <
      migrations.indexOf("20260616_150_rate_limit_probabilistic_cleanup.sql"),
    "rate limit cleanup migration should run after shopping action migration"
  );

  assert.ok(
    migrations.indexOf("20260616_150_rate_limit_probabilistic_cleanup.sql") <
      migrations.indexOf("20260616_160_open_food_facts_persistent_cache.sql"),
    "Open Food Facts cache migration should run after rate limit cleanup migration"
  );

  assert.ok(
    migrations.indexOf("20260616_160_open_food_facts_persistent_cache.sql") <
      migrations.indexOf("20260618_170_rate_limit_pgcrypto_search_path.sql"),
    "rate limit pgcrypto search path migration should run after Open Food Facts cache migration"
  );
});
