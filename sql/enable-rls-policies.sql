-- RLS baseline for EcoFoodStock.
-- Apply this in Supabase SQL editor after the main schema and previous migrations.
-- The server API can still use the service role, but browser/client access is now constrained by user/household membership.

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_current_app_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and p_user_id = public.current_app_user_id()
$$;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    join public.users u on u.id = hm.user_id
    where hm.household_id = p_household_id
      and u.auth_user_id = auth.uid()
  )
$$;

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    join public.users u on u.id = hm.user_id
    where hm.household_id = p_household_id
      and hm.role in ('owner', 'admin')
      and u.auth_user_id = auth.uid()
  )
$$;

create or replace function public.can_access_shopping_list(p_shopping_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shopping_lists sl
    where sl.id = p_shopping_list_id
      and public.is_household_member(sl.household_id)
  )
$$;

grant execute on function public.current_app_user_id() to anon, authenticated;
grant execute on function public.is_current_app_user(uuid) to anon, authenticated;
grant execute on function public.is_household_member(uuid) to anon, authenticated;
grant execute on function public.is_household_admin(uuid) to anon, authenticated;
grant execute on function public.can_access_shopping_list(uuid) to anon, authenticated;

alter table if exists public.users enable row level security;
alter table if exists public.households enable row level security;
alter table if exists public.household_members enable row level security;
alter table if exists public.invitation_tokens enable row level security;
alter table if exists public.user_preferences enable row level security;
alter table if exists public.user_health_profiles enable row level security;
alter table if exists public.nutrition_goals enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.product_nutrition enable row level security;
alter table if exists public.inventory_batches enable row level security;
alter table if exists public.inventory_movements enable row level security;
alter table if exists public.recipes enable row level security;
alter table if exists public.recipe_ingredients enable row level security;
alter table if exists public.recipe_feedback enable row level security;
alter table if exists public.blocked_ingredients enable row level security;
alter table if exists public.cooked_recipes enable row level security;
alter table if exists public.shopping_lists enable row level security;
alter table if exists public.shopping_items enable row level security;
alter table if exists public.activity_events enable row level security;
alter table if exists public.notification_preferences enable row level security;
alter table if exists public.push_subscriptions enable row level security;
alter table if exists public.notification_events enable row level security;
alter table if exists public.data_exports enable row level security;

-- Grants are intentionally broad for authenticated users; RLS policies below do the filtering.
grant usage on schema public to anon, authenticated;

grant select on public.products, public.product_nutrition, public.recipes, public.recipe_ingredients to anon, authenticated;

grant select, insert, update, delete on
  public.users,
  public.households,
  public.household_members,
  public.invitation_tokens,
  public.user_preferences,
  public.user_health_profiles,
  public.nutrition_goals,
  public.inventory_batches,
  public.inventory_movements,
  public.recipe_feedback,
  public.blocked_ingredients,
  public.cooked_recipes,
  public.shopping_lists,
  public.shopping_items,
  public.activity_events,
  public.notification_preferences,
  public.push_subscriptions,
  public.notification_events,
  public.data_exports
to authenticated;

grant select on public.active_inventory_summary, public.expiring_inventory_batches to authenticated;

-- Views must run as the caller so underlying RLS policies are respected.
alter view if exists public.active_inventory_summary set (security_invoker = true);
alter view if exists public.expiring_inventory_batches set (security_invoker = true);

drop policy if exists "Users can read own app user" on public.users;
create policy "Users can read own app user"
on public.users for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "Users can insert own app user" on public.users;
create policy "Users can insert own app user"
on public.users for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists "Users can update own app user" on public.users;
create policy "Users can update own app user"
on public.users for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists "Members can read households" on public.households;
create policy "Members can read households"
on public.households for select
to authenticated
using (public.is_household_member(id));

drop policy if exists "Users can create households for themselves" on public.households;
create policy "Users can create households for themselves"
on public.households for insert
to authenticated
with check (created_by = public.current_app_user_id());

drop policy if exists "Members can update households" on public.households;
create policy "Members can update households"
on public.households for update
to authenticated
using (public.is_household_member(id))
with check (public.is_household_member(id));

drop policy if exists "Members can read household memberships" on public.household_members;
create policy "Members can read household memberships"
on public.household_members for select
to authenticated
using (public.is_current_app_user(user_id) or public.is_household_member(household_id));

drop policy if exists "Admins can read invitation tokens" on public.invitation_tokens;
create policy "Admins can read invitation tokens"
on public.invitation_tokens for select
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists "Admins can create invitation tokens" on public.invitation_tokens;
create policy "Admins can create invitation tokens"
on public.invitation_tokens for insert
to authenticated
with check (public.is_household_admin(household_id) and created_by = public.current_app_user_id());

drop policy if exists "Admins can update invitation tokens" on public.invitation_tokens;
create policy "Admins can update invitation tokens"
on public.invitation_tokens for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists "Admins can delete invitation tokens" on public.invitation_tokens;
create policy "Admins can delete invitation tokens"
on public.invitation_tokens for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists "Users can manage own preferences" on public.user_preferences;
create policy "Users can manage own preferences"
on public.user_preferences for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can manage own health profile" on public.user_health_profiles;
create policy "Users can manage own health profile"
on public.user_health_profiles for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can manage own nutrition goals" on public.nutrition_goals;
create policy "Users can manage own nutrition goals"
on public.nutrition_goals for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Catalog products are readable" on public.products;
create policy "Catalog products are readable"
on public.products for select
to anon, authenticated
using (true);

drop policy if exists "Catalog nutrition is readable" on public.product_nutrition;
create policy "Catalog nutrition is readable"
on public.product_nutrition for select
to anon, authenticated
using (true);

drop policy if exists "Members can manage inventory batches" on public.inventory_batches;
create policy "Members can manage inventory batches"
on public.inventory_batches for all
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can read inventory movements" on public.inventory_movements;
create policy "Members can read inventory movements"
on public.inventory_movements for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can insert inventory movements" on public.inventory_movements;
create policy "Members can insert inventory movements"
on public.inventory_movements for insert
to authenticated
with check (public.is_household_member(household_id));

drop policy if exists "Recipes are readable" on public.recipes;
create policy "Recipes are readable"
on public.recipes for select
to anon, authenticated
using (true);

drop policy if exists "Recipe ingredients are readable" on public.recipe_ingredients;
create policy "Recipe ingredients are readable"
on public.recipe_ingredients for select
to anon, authenticated
using (true);

drop policy if exists "Users can manage own recipe feedback" on public.recipe_feedback;
create policy "Users can manage own recipe feedback"
on public.recipe_feedback for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can manage own blocked ingredients" on public.blocked_ingredients;
create policy "Users can manage own blocked ingredients"
on public.blocked_ingredients for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Members can manage cooked recipes" on public.cooked_recipes;
create policy "Members can manage cooked recipes"
on public.cooked_recipes for all
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can manage shopping lists" on public.shopping_lists;
create policy "Members can manage shopping lists"
on public.shopping_lists for all
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can manage shopping items" on public.shopping_items;
create policy "Members can manage shopping items"
on public.shopping_items for all
to authenticated
using (public.can_access_shopping_list(shopping_list_id))
with check (public.can_access_shopping_list(shopping_list_id));

drop policy if exists "Members can manage activity events" on public.activity_events;
create policy "Members can manage activity events"
on public.activity_events for all
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Users can manage own notification preferences" on public.notification_preferences;
create policy "Users can manage own notification preferences"
on public.notification_preferences for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
on public.push_subscriptions for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can read relevant notification events" on public.notification_events;
create policy "Users can read relevant notification events"
on public.notification_events for select
to authenticated
using (
  public.is_current_app_user(user_id)
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists "Users can manage own notification events" on public.notification_events;
create policy "Users can manage own notification events"
on public.notification_events for insert
to authenticated
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can update own notification events" on public.notification_events;
create policy "Users can update own notification events"
on public.notification_events for update
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));

drop policy if exists "Users can manage own data exports" on public.data_exports;
create policy "Users can manage own data exports"
on public.data_exports for all
to authenticated
using (public.is_current_app_user(user_id))
with check (public.is_current_app_user(user_id));
