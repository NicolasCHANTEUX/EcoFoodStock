# Supabase migrations

This folder contains the versioned database history for EcoFoodStock.

## New or reset database

Use the Supabase CLI from the project root:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The first migration is a baseline built from `schema-bdd-ecofoodstock.sql`, then the following migrations apply compatibility patches, RLS policies, RPCs, and the distributed rate limit table/function.

## Existing database already patched manually

If the target database was previously created by manually running files from `sql/`, do not blindly push the baseline migration on top of it. The baseline creates enum types and tables that may already exist.

Recommended paths:

- For a clean environment: start from an empty Supabase project and run `supabase db push`.
- For the current manually managed project: compare the database with the migrations, then mark already-applied migrations as applied with Supabase CLI migration repair before using `db push` for future changes.

Keep `sql/` as human-readable source snapshots, but use `supabase/migrations/` as the deployable source of truth.
