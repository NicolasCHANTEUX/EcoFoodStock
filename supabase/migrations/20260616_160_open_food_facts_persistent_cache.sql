-- Persistent Open Food Facts enrichment cache for known catalog products.
-- Safe to run multiple times.

alter table public.products
  add column if not exists off_last_fetched_at timestamptz,
  add column if not exists off_fetch_status text not null default 'unknown',
  add column if not exists off_quantity_text text,
  add column if not exists off_quantity_value numeric(10,3),
  add column if not exists off_quantity_unit text,
  add column if not exists off_storage_area storage_area;

alter table public.products
  drop constraint if exists products_off_fetch_status_check;

alter table public.products
  add constraint products_off_fetch_status_check
  check (off_fetch_status in ('unknown', 'found', 'not_found', 'error'));

alter table public.products
  drop constraint if exists products_off_quantity_unit_check;

alter table public.products
  add constraint products_off_quantity_unit_check
  check (off_quantity_unit is null or off_quantity_unit in ('g', 'ml', 'pieces'));

create index if not exists products_off_cache_idx
  on public.products (barcode, off_fetch_status, off_last_fetched_at)
  where barcode is not null;
