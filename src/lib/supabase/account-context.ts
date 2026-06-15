import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountContext = {
  authenticated: boolean;
  authUserId?: string;
  appUserId?: string;
  householdId?: string;
  email?: string;
  displayName?: string | null;
  onboardingCompleted?: boolean;
};

type AuthUserMetadata = {
  display_name?: unknown;
  full_name?: unknown;
  fullName?: unknown;
  name?: unknown;
  preferred_name?: unknown;
  legal_terms_accepted_at?: unknown;
  legal_terms_version?: unknown;
  privacy_policy_version?: unknown;
};

export function isProductionEnvironment() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function canUseDemoMode() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.VERCEL_ENV !== "production" &&
    isEnabled(process.env.ECOFOODSTOCK_ENABLE_DEMO_MODE)
  );
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export async function userBelongsToHousehold(
  supabase: SupabaseClient,
  appUserId: string | undefined,
  householdId: string | undefined
) {
  if (!appUserId || !householdId) {
    return false;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", appUserId)
    .eq("household_id", householdId)
    .limit(1)
    .maybeSingle<{ household_id: string }>();

  return !error && Boolean(data?.household_id);
}

export async function resolveAccountContext(request: Request, supabase: SupabaseClient): Promise<AccountContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!accessToken) {
    return { authenticated: false };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const authUserId = userData.user?.id;

  if (userError || !authUserId) {
    return { authenticated: false };
  }

  const authUserEmail = userData.user?.email ?? `${authUserId}@missing.local`;
  const metadata = userData.user?.user_metadata as AuthUserMetadata | undefined;
  const metadataDisplayName = getMetadataDisplayName(metadata, authUserEmail);

  const { data: existingUser } = await supabase
    .from("users")
    .select("id, email, display_name, onboarding_completed")
    .eq("auth_user_id", authUserId)
    .maybeSingle<{ id: string; email: string | null; display_name: string | null; onboarding_completed: boolean }>();

  let appUserId = existingUser?.id;
  let email = existingUser?.email ?? authUserEmail;
  let displayName = getValidDisplayName(existingUser?.display_name, email) ?? metadataDisplayName;
  let onboardingCompleted = existingUser?.onboarding_completed ?? false;

  if (!appUserId) {
    let createUserResult = await supabase
      .from("users")
      .insert(buildAppUserInsert(authUserId, authUserEmail, displayName, metadata))
      .select("id, email, display_name, onboarding_completed")
      .maybeSingle<{ id: string; email: string | null; display_name: string | null; onboarding_completed: boolean }>();

    if (createUserResult.error && isMissingLegalConsentColumn(createUserResult.error.message)) {
      createUserResult = await supabase
        .from("users")
        .insert({
          auth_user_id: authUserId,
          email: authUserEmail,
          display_name: displayName
        })
        .select("id, email, display_name, onboarding_completed")
        .maybeSingle<{ id: string; email: string | null; display_name: string | null; onboarding_completed: boolean }>();
    }

    const { data: createdUser } = createUserResult;
    appUserId = createdUser?.id;
    email = createdUser?.email ?? authUserEmail;
    displayName = getValidDisplayName(createdUser?.display_name, email) ?? displayName;
    onboardingCompleted = createdUser?.onboarding_completed ?? false;
  } else if (!getValidDisplayName(existingUser?.display_name, email) && metadataDisplayName) {
    await supabase.from("users").update({ display_name: metadataDisplayName }).eq("id", appUserId);
    displayName = metadataDisplayName;
  }

  if (!appUserId) {
    return { authenticated: true, authUserId, email, displayName };
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", appUserId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    authenticated: true,
    authUserId,
    appUserId,
    householdId: membership?.household_id ?? undefined,
    email,
    displayName,
    onboardingCompleted
  };
}

export async function ensureUserHousehold(supabase: SupabaseClient, context: AccountContext) {
  if (context.householdId) {
    return context.householdId;
  }

  if (!context.appUserId) {
    return undefined;
  }

  const { data: existingMembership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", context.appUserId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ household_id: string }>();

  if (existingMembership?.household_id) {
    return existingMembership.household_id;
  }

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      name: "Mon foyer",
      created_by: context.appUserId
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (householdError || !household?.id) {
    throw householdError ?? new Error("Unable to create user household");
  }

  const { error: memberError } = await supabase.from("household_members").insert({
    household_id: household.id,
    user_id: context.appUserId,
    role: "owner"
  });

  if (memberError) {
    throw memberError;
  }

  return household.id;
}

function buildAppUserInsert(
  authUserId: string,
  authUserEmail: string,
  displayName: string | null | undefined,
  metadata: AuthUserMetadata | undefined
) {
  const insertPayload: Record<string, string | null> = {
    auth_user_id: authUserId,
    email: authUserEmail,
    display_name: displayName ?? null
  };
  const legalTermsAcceptedAt = normalizeIsoDate(getStringMetadata(metadata?.legal_terms_accepted_at));
  const legalTermsVersion = getStringMetadata(metadata?.legal_terms_version);
  const privacyPolicyVersion = getStringMetadata(metadata?.privacy_policy_version);

  if (legalTermsAcceptedAt) {
    insertPayload.legal_terms_accepted_at = legalTermsAcceptedAt;
  }

  if (legalTermsVersion) {
    insertPayload.legal_terms_version = legalTermsVersion;
  }

  if (privacyPolicyVersion) {
    insertPayload.privacy_policy_version = privacyPolicyVersion;
  }

  return insertPayload;
}

function getStringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getValidDisplayName(value: string | null | undefined, email: string | null | undefined) {
  const displayName = value?.trim();
  const normalizedEmail = email?.trim().toLowerCase();

  if (!displayName || (normalizedEmail && displayName.toLowerCase() === normalizedEmail)) {
    return null;
  }

  return displayName;
}

function getMetadataDisplayName(metadata: AuthUserMetadata | undefined, email: string) {
  const candidates = [
    metadata?.full_name,
    metadata?.display_name,
    metadata?.fullName,
    metadata?.name,
    metadata?.preferred_name
  ];
  const normalizedEmail = email.trim().toLowerCase();

  for (const candidate of candidates) {
    const value = getStringMetadata(candidate);

    if (value && value.toLowerCase() !== normalizedEmail) {
      return value;
    }
  }

  return null;
}

function normalizeIsoDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function isMissingLegalConsentColumn(message: string) {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("legal_terms_accepted_at") ||
    lowerMessage.includes("legal_terms_version") ||
    lowerMessage.includes("privacy_policy_version")
  );
}
