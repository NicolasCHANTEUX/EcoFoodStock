-- Align MVP1 database defaults with the application domain model.
-- Safe to run multiple times on an existing Supabase project.

create extension if not exists pgcrypto;

alter table if exists products
  alter column default_unit set default 'pieces';

alter table if exists inventory_batches
  alter column unit set default 'pieces';

alter table if exists inventory_movements
  alter column unit set default 'pieces';

update products
set default_unit = 'pieces'
where default_unit = 'unit';

update inventory_batches
set unit = 'pieces'
where unit = 'unit';

update inventory_movements
set unit = 'pieces'
where unit = 'unit';

create table if not exists invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table if exists invitation_tokens
  add column if not exists created_by uuid references users(id) on delete set null,
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by uuid references users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists invitation_tokens_household_idx
  on invitation_tokens (household_id);

create index if not exists invitation_tokens_active_idx
  on invitation_tokens (token, expires_at)
  where consumed_at is null;
