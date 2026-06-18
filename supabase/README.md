# Supabase migrations

This folder contains the versioned database history for EcoFoodStock.

## New or reset database

Use the Supabase CLI from the project root:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The first migration is a baseline built from `schema-bdd-ecofoodstock.sql`, then the following migrations apply compatibility patches, RLS policies, RPCs, the distributed rate limit table/function, and persistent Open Food Facts cache columns.

## Existing database already patched manually

If the target database was previously created by manually running files from `sql/`, do not blindly push the baseline migration on top of it. The baseline creates enum types and tables that may already exist.

Recommended paths:

- For a clean environment: start from an empty Supabase project and run `supabase db push`.
- For the current manually managed project: compare the database with the migrations, then mark already-applied migrations as applied with Supabase CLI migration repair before using `db push` for future changes.

Keep `sql/` as human-readable source snapshots, but use `supabase/migrations/` as the deployable source of truth.

If the server logs `function digest(text, unknown) does not exist` from `check_rate_limit`, apply `20260618_170_rate_limit_pgcrypto_search_path.sql`. It refreshes the rate-limit RPC so it can resolve `pgcrypto` from Supabase's `extensions` schema.

## Local integration tests

These tests start from a local Supabase database reset by the CLI, then call the real RPCs through Supabase JS.

```bash
supabase start
supabase db reset
supabase status -o env
```

Export the local values from `supabase status -o env`:

```bash
export SUPABASE_INTEGRATION_URL=http://127.0.0.1:54321
export SUPABASE_INTEGRATION_ANON_KEY=<ANON_KEY>
export SUPABASE_INTEGRATION_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
npm run test:integration:supabase
```

Variable mapping:

- `SUPABASE_INTEGRATION_URL`: local API URL, usually `API_URL` from `supabase status -o env` (`http://127.0.0.1:54321` by default).
- `SUPABASE_INTEGRATION_ANON_KEY`: local `ANON_KEY`.
- `SUPABASE_INTEGRATION_SERVICE_ROLE_KEY`: local `SERVICE_ROLE_KEY`.

These variables are only for local/CI integration tests. Do not use production Supabase keys for this test suite: the tests insert data and expect an isolated local database.

The GitHub Actions workflow runs the same flow automatically in the `Supabase integration` job.
