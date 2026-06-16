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
  assertIncludes(rateLimitRpc, "encode(digest(btrim(p_subject), 'sha256'), 'hex')", "rate limit RPC");
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
    "20260616_140_apply_shopping_action_rpc.sql"
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
});
