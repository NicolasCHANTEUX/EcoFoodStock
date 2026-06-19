type SupabaseSecretConfig = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function assertServerOnlySupabaseServiceRoleConfig(config: SupabaseSecretConfig = process.env) {
  const publicServiceRoleKey = config.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = config.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (publicServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must never be exposed with a NEXT_PUBLIC_ prefix");
  }

  if (!serviceRoleKey) {
    return;
  }

  if (serviceRoleKey.toLowerCase().includes("your-service-role-key")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured with a real server-only key");
  }

  if (anonKey && serviceRoleKey === anonKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be different from NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
