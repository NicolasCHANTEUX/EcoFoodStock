import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

type AppUser = {
  id: string;
  auth_user_id: string;
  email: string;
};

type Household = {
  id: string;
};

type Product = {
  id: string;
};

type IntegrationFixture = {
  owner: AppUser;
  outsider: AppUser;
  household: Household;
  product: Product;
};

const integrationEnv = readIntegrationEnv();
const serviceRoleClient = createClient(integrationEnv.url, integrationEnv.serviceRoleKey, {
  auth: {
    persistSession: false
  }
});
const anonClient = createClient(integrationEnv.url, integrationEnv.anonKey, {
  auth: {
    persistSession: false
  }
});

test("Supabase local migrations expose RLS-protected rate limit RPC behavior", async () => {
  const subject = `integration-${randomUUID()}`;
  const firstDecision = await serviceRoleClient.rpc("check_rate_limit", {
    p_scope: "integration",
    p_subject: subject,
    p_limit: 1,
    p_window_seconds: 60
  });

  assertNoSupabaseError(firstDecision.error, "service_role check_rate_limit first call");
  assert.equal(firstDecision.data?.ok, true);
  assert.equal(firstDecision.data?.allowed, true);

  const secondDecision = await serviceRoleClient.rpc("check_rate_limit", {
    p_scope: "integration",
    p_subject: subject,
    p_limit: 1,
    p_window_seconds: 60
  });

  assertNoSupabaseError(secondDecision.error, "service_role check_rate_limit second call");
  assert.equal(secondDecision.data?.ok, true);
  assert.equal(secondDecision.data?.allowed, false);
  assert.equal(typeof secondDecision.data?.retryAfterSeconds, "number");

  const storedLimit = await serviceRoleClient
    .from("rate_limits")
    .select("rate_key, scope, subject_hash, attempts")
    .eq("scope", "integration")
    .limit(1)
    .maybeSingle<{ rate_key: string; scope: string; subject_hash: string; attempts: number }>();

  assertNoSupabaseError(storedLimit.error, "service_role rate_limits select");
  assert.equal(storedLimit.data?.scope, "integration");
  assert.equal(storedLimit.data?.subject_hash.length, 64);
  assert.equal(storedLimit.data?.rate_key.includes(subject), false);

  const anonDecision = await anonClient.rpc("check_rate_limit", {
    p_scope: "integration",
    p_subject: `anon-${subject}`,
    p_limit: 1,
    p_window_seconds: 60
  });

  assert.ok(anonDecision.error, "anon must not execute check_rate_limit");

  const anonTableRead = await anonClient.from("rate_limits").select("rate_key").limit(1);
  assert.ok(anonTableRead.error, "anon must not read rate_limits");
});

test("inventory RPC creates stock movement atomically and rejects wrong household user", async () => {
  const fixture = await createIntegrationFixture();
  const createdBatch = await serviceRoleClient.rpc("create_inventory_batch_with_activity", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.owner.id,
    p_product_id: fixture.product.id,
    p_product_name: "Riz integration",
    p_quantity: 2,
    p_unit: "pieces",
    p_storage_area: "dry",
    p_expiration_date: null,
    p_notes: "integration test",
    p_source: "manual"
  });

  assertNoSupabaseError(createdBatch.error, "create_inventory_batch_with_activity");
  assert.equal(createdBatch.data?.ok, true);
  assert.ok(createdBatch.data?.activityEventId);

  const storedBatch = await serviceRoleClient
    .from("inventory_batches")
    .select("id, household_id, product_id, quantity_remaining, status")
    .eq("household_id", fixture.household.id)
    .eq("product_id", fixture.product.id)
    .maybeSingle<{ id: string; household_id: string; product_id: string; quantity_remaining: number; status: string }>();

  assertNoSupabaseError(storedBatch.error, "inventory batch select");
  assert.equal(Number(storedBatch.data?.quantity_remaining), 2);
  assert.equal(storedBatch.data?.status, "active");

  const movement = await serviceRoleClient
    .from("inventory_movements")
    .select("type, quantity_delta, activity_event_id")
    .eq("household_id", fixture.household.id)
    .eq("product_id", fixture.product.id)
    .maybeSingle<{ type: string; quantity_delta: number; activity_event_id: string }>();

  assertNoSupabaseError(movement.error, "inventory movement select");
  assert.equal(movement.data?.type, "add");
  assert.equal(Number(movement.data?.quantity_delta), 2);
  assert.ok(movement.data?.activity_event_id);

  const forbiddenBatch = await serviceRoleClient.rpc("create_inventory_batch_with_activity", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.outsider.id,
    p_product_id: fixture.product.id,
    p_product_name: "Riz integration",
    p_quantity: 1,
    p_unit: "pieces",
    p_storage_area: "dry",
    p_expiration_date: null,
    p_notes: null,
    p_source: "manual"
  });

  assert.ok(forbiddenBatch.error, "non-member user must not create stock through service_role RPC");
});

test("shopping RPC mutates list in one transaction and writes completion history", async () => {
  const fixture = await createIntegrationFixture();
  const addedItem = await serviceRoleClient.rpc("apply_shopping_action", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.owner.id,
    p_action: "add_item",
    p_item_id: null,
    p_label: "Pommes integration",
    p_quantity: 3,
    p_unit: "pieces",
    p_category: "fresh",
    p_checked: null
  });

  assertNoSupabaseError(addedItem.error, "apply_shopping_action add_item");
  assert.equal(addedItem.data?.ok, true);
  assert.ok(addedItem.data?.itemId);

  const activeLists = await serviceRoleClient
    .from("shopping_lists")
    .select("id, is_active")
    .eq("household_id", fixture.household.id)
    .eq("is_active", true);

  assertNoSupabaseError(activeLists.error, "shopping active list select");
  assert.equal(activeLists.data?.length, 1);

  const toggledItem = await serviceRoleClient.rpc("apply_shopping_action", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.owner.id,
    p_action: "toggle_item",
    p_item_id: addedItem.data.itemId,
    p_label: null,
    p_quantity: null,
    p_unit: null,
    p_category: null,
    p_checked: true
  });

  assertNoSupabaseError(toggledItem.error, "apply_shopping_action toggle_item");
  assert.equal(toggledItem.data?.ok, true);

  const completedList = await serviceRoleClient.rpc("apply_shopping_action", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.owner.id,
    p_action: "complete_list",
    p_item_id: null,
    p_label: null,
    p_quantity: null,
    p_unit: null,
    p_category: null,
    p_checked: null
  });

  assertNoSupabaseError(completedList.error, "apply_shopping_action complete_list");
  assert.equal(completedList.data?.ok, true);
  assert.equal(completedList.data?.checkedCount, 1);

  const archivedList = await serviceRoleClient
    .from("shopping_lists")
    .select("id, is_active, archived_at")
    .eq("id", activeLists.data?.[0].id)
    .maybeSingle<{ id: string; is_active: boolean; archived_at: string | null }>();

  assertNoSupabaseError(archivedList.error, "shopping archived list select");
  assert.equal(archivedList.data?.is_active, false);
  assert.ok(archivedList.data?.archived_at);

  const historyEvent = await serviceRoleClient
    .from("activity_events")
    .select("type, can_undo, metadata")
    .eq("household_id", fixture.household.id)
    .eq("type", "shopping_finished")
    .maybeSingle<{ type: string; can_undo: boolean; metadata: Record<string, unknown> }>();

  assertNoSupabaseError(historyEvent.error, "shopping history event select");
  assert.equal(historyEvent.data?.can_undo, false);
  assert.equal(historyEvent.data?.metadata?.source, "shopping");
});

test("invitation RPC joins a user atomically and consumes the token", async () => {
  const fixture = await createIntegrationFixture();
  const token = `integration-${randomUUID()}`;
  const invite = await serviceRoleClient.rpc("create_invitation_token", {
    p_household_id: fixture.household.id,
    p_user_id: fixture.owner.id,
    p_token: token,
    p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });

  assertNoSupabaseError(invite.error, "create_invitation_token");
  assert.equal(invite.data?.ok, true);

  const joined = await serviceRoleClient.rpc("join_household_with_invitation", {
    p_token: token,
    p_user_id: fixture.outsider.id
  });

  assertNoSupabaseError(joined.error, "join_household_with_invitation");
  assert.equal(joined.data?.ok, true);
  assert.equal(joined.data?.alreadyMember, false);

  const membership = await serviceRoleClient
    .from("household_members")
    .select("id, role")
    .eq("household_id", fixture.household.id)
    .eq("user_id", fixture.outsider.id)
    .maybeSingle<{ id: string; role: string }>();

  assertNoSupabaseError(membership.error, "joined membership select");
  assert.equal(membership.data?.role, "member");

  const consumedToken = await serviceRoleClient
    .from("invitation_tokens")
    .select("consumed_at, consumed_by")
    .eq("token", token)
    .maybeSingle<{ consumed_at: string | null; consumed_by: string | null }>();

  assertNoSupabaseError(consumedToken.error, "consumed token select");
  assert.ok(consumedToken.data?.consumed_at);
  assert.equal(consumedToken.data?.consumed_by, fixture.outsider.id);
});

async function createIntegrationFixture(): Promise<IntegrationFixture> {
  const owner = await createAppUser("owner");
  const outsider = await createAppUser("outsider");
  const household = await insertRow<Household>(
    "households",
    {
      name: `Integration ${randomUUID()}`,
      created_by: owner.id
    },
    "id"
  );
  const member = await serviceRoleClient.from("household_members").insert({
    household_id: household.id,
    user_id: owner.id,
    role: "owner"
  });
  assertNoSupabaseError(member.error, "household member insert");
  const product = await insertRow<Product>(
    "products",
    {
      barcode: `int-${randomUUID()}`,
      name: "Produit integration",
      source: "manual",
      default_storage_area: "dry",
      default_unit: "pieces"
    },
    "id"
  );

  return { owner, outsider, household, product };
}

async function createAppUser(label: string) {
  return insertRow<AppUser>(
    "users",
    {
      auth_user_id: randomUUID(),
      email: `${label}-${randomUUID()}@integration.local`,
      display_name: `Integration ${label}`
    },
    "id, auth_user_id, email"
  );
}

async function insertRow<TRow extends Record<string, unknown>>(table: string, values: Record<string, unknown>, select: string) {
  const result = await serviceRoleClient.from(table).insert(values).select(select).maybeSingle<TRow>();
  assertNoSupabaseError(result.error, `${table} insert`);
  assert.ok(result.data, `${table} insert should return a row`);
  return result.data;
}

function assertNoSupabaseError(error: unknown, context: string): asserts error is null {
  assert.equal(error, null, `${context} failed: ${JSON.stringify(error)}`);
}

function readIntegrationEnv() {
  const url = process.env.SUPABASE_INTEGRATION_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_INTEGRATION_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_INTEGRATION_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error(
      [
        "Missing Supabase integration environment.",
        "Run a local Supabase stack, then set:",
        "- SUPABASE_INTEGRATION_URL",
        "- SUPABASE_INTEGRATION_SERVICE_ROLE_KEY",
        "- SUPABASE_INTEGRATION_ANON_KEY"
      ].join("\n")
    );
  }

  return { url, serviceRoleKey, anonKey };
}
