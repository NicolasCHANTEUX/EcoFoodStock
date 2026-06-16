-- Schema BDD initial - EcoFoodStock
-- PostgreSQL / Supabase

create extension if not exists pgcrypto;

-- Enums

create type app_mode as enum ('general_public', 'athlete');
create type member_role as enum ('owner', 'admin', 'member');
create type storage_area as enum ('fresh', 'frozen', 'dry', 'other');
create type batch_status as enum ('active', 'consumed', 'wasted', 'expired', 'removed');
create type movement_type as enum ('add', 'consume', 'cook', 'waste', 'adjust', 'undo', 'shopping_transfer');
create type shopping_item_status as enum ('suggested', 'active', 'checked', 'transferred', 'archived');
create type activity_type as enum ('product_added', 'product_consumed', 'product_wasted', 'product_adjusted', 'recipe_cooked', 'shopping_finished', 'undo');
create type recipe_feedback_type as enum ('like', 'dislike', 'favorite');
create type export_status as enum ('pending', 'ready', 'failed', 'expired');

-- Users and households

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  email text unique not null,
  display_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  legal_terms_accepted_at timestamptz,
  legal_terms_version text,
  privacy_policy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon foyer',
  invite_code text unique,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitation_tokens_household_idx
  on invitation_tokens (household_id);

create index invitation_tokens_active_idx
  on invitation_tokens (token, expires_at)
  where consumed_at is null;

create table user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  app_mode app_mode not null default 'general_public',
  household_size integer not null default 1 check (household_size >= 1),
  diet text not null default 'omnivore',
  allergies text[] not null default '{}',
  disliked_ingredients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_health_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  sex text check (sex in ('female', 'male', 'other')),
  height_cm integer check (height_cm between 80 and 260),
  weight_kg numeric(5,2) check (weight_kg between 20 and 400),
  birthdate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  calories_kcal integer,
  protein_g numeric(7,2),
  carbs_g numeric(7,2),
  fat_g numeric(7,2),
  fiber_g numeric(7,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Product catalog

create table products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  name text not null,
  brand text,
  category text,
  image_url text,
  source text not null default 'manual', -- manual, open_food_facts
  default_storage_area storage_area not null default 'other',
  default_unit text not null default 'pieces',
  is_raw_fresh boolean not null default false,
  is_seasonal boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_nutrition (
  product_id uuid primary key references products(id) on delete cascade,
  per_unit text not null default '100g',
  calories_kcal numeric(8,2),
  protein_g numeric(8,2),
  carbs_g numeric(8,2),
  fat_g numeric(8,2),
  fiber_g numeric(8,2),
  sugar_g numeric(8,2),
  salt_g numeric(8,2),
  updated_at timestamptz not null default now()
);

-- Inventory

create table inventory_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity_initial numeric(10,3) not null check (quantity_initial > 0),
  quantity_remaining numeric(10,3) not null check (quantity_remaining >= 0),
  unit text not null default 'pieces',
  storage_area storage_area not null default 'other',
  expiration_date date,
  status batch_status not null default 'active',
  added_by uuid references users(id) on delete set null,
  source text not null default 'manual', -- scan, manual, shopping, undo
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_batches_household_status_idx
  on inventory_batches (household_id, status);

create index inventory_batches_expiration_idx
  on inventory_batches (household_id, expiration_date)
  where status = 'active';

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  inventory_batch_id uuid references inventory_batches(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  type movement_type not null,
  quantity_delta numeric(10,3) not null,
  unit text not null default 'pieces',
  reason text,
  recipe_id uuid,
  activity_event_id uuid,
  undo_of_movement_id uuid references inventory_movements(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Recipes

create table recipes (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  source text not null default 'manual',
  title text not null,
  image_url text,
  prep_time_minutes integer,
  servings integer,
  cuisine_tags text[] not null default '{}',
  diet_tags text[] not null default '{}',
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  ingredient_name text not null,
  quantity numeric(10,3),
  unit text,
  optional boolean not null default false
);

create table recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  type recipe_feedback_type not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id, type)
);

create table blocked_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ingredient_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, ingredient_name)
);

create table cooked_recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  recipe_id uuid references recipes(id) on delete set null,
  servings_cooked numeric(6,2),
  activity_event_id uuid,
  created_at timestamptz not null default now()
);

-- Shopping

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null default 'Liste de courses',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  label text not null,
  quantity numeric(10,3),
  unit text,
  category storage_area not null default 'other',
  status shopping_item_status not null default 'active',
  source text not null default 'manual', -- manual, habit, recipe_missing, nutrition_boost
  source_recipe_id uuid references recipes(id) on delete set null,
  added_by uuid references users(id) on delete set null,
  checked_by uuid references users(id) on delete set null,
  checked_at timestamptz,
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_list_status_idx
  on shopping_items (shopping_list_id, status);

-- Activity timeline

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  type activity_type not null,
  title text not null,
  description text,
  product_id uuid references products(id) on delete set null,
  recipe_id uuid references recipes(id) on delete set null,
  can_undo boolean not null default false,
  undone_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table inventory_movements
  add constraint inventory_movements_activity_fk
  foreign key (activity_event_id) references activity_events(id) on delete set null;

alter table cooked_recipes
  add constraint cooked_recipes_activity_fk
  foreign key (activity_event_id) references activity_events(id) on delete set null;

-- Notifications

create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  expiration_alert_days integer not null default 2 check (expiration_alert_days between 0 and 7),
  expiration_alert_enabled boolean not null default true,
  shopping_reminder_enabled boolean not null default false,
  weekly_summary_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  platform text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  scheduled_for timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Data exports and privacy

create table data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  format text not null check (format in ('csv', 'pdf')),
  status export_status not null default 'pending',
  file_url text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Useful views

create view active_inventory_summary as
select
  ib.household_id,
  ib.product_id,
  p.name,
  p.brand,
  p.category,
  p.image_url,
  ib.storage_area,
  min(ib.expiration_date) as nearest_expiration_date,
  sum(ib.quantity_remaining) as total_quantity_remaining,
  ib.unit
from inventory_batches ib
join products p on p.id = ib.product_id
where ib.status = 'active'
  and ib.quantity_remaining > 0
group by
  ib.household_id,
  ib.product_id,
  p.name,
  p.brand,
  p.category,
  p.image_url,
  ib.storage_area,
  ib.unit;

create view expiring_inventory_batches as
select
  ib.*,
  p.name as product_name,
  p.brand as product_brand
from inventory_batches ib
join products p on p.id = ib.product_id
where ib.status = 'active'
  and ib.expiration_date is not null
  and ib.expiration_date <= current_date + interval '3 days';
