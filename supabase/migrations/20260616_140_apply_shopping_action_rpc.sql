-- Transactional shopping list mutations.
-- Versioned in supabase/migrations; keep this file as a readable source snapshot.

create or replace function public.apply_shopping_action(
  p_household_id uuid,
  p_user_id uuid,
  p_action text,
  p_item_id uuid default null,
  p_label text default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_category text default null,
  p_checked boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_list_id uuid;
  v_item_id uuid;
  v_checked_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_household_id is null then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'Household is required');
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not exists (
      select 1
      from users u
      where u.id = p_user_id
        and u.auth_user_id = auth.uid()
    ) then
      raise exception 'Forbidden user context';
    end if;
  end if;

  if not exists (
    select 1
    from household_members hm
    where hm.user_id = p_user_id
      and hm.household_id = p_household_id
  ) then
    raise exception 'Forbidden household access';
  end if;

  if p_action is null or p_action not in (
    'add_item',
    'toggle_item',
    'toggle_all',
    'delete_item',
    'complete_list',
    'archive_list'
  ) then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'Unsupported shopping action');
  end if;

  perform 1
  from public.households h
  where h.id = p_household_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'message', 'Household not found');
  end if;

  select sl.id
  into v_list_id
  from public.shopping_lists sl
  where sl.household_id = p_household_id
    and sl.is_active = true
  order by sl.created_at desc
  limit 1
  for update;

  if p_action = 'add_item' then
    if p_label is null or btrim(p_label) = '' or length(btrim(p_label)) > 200 then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Shopping item label is required');
    end if;

    if p_quantity is null or p_quantity <= 0 then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Quantity must be positive');
    end if;

    if p_unit is null or btrim(p_unit) = '' or length(btrim(p_unit)) > 40 then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Shopping item unit is required');
    end if;

    if p_category is null or p_category not in ('fresh', 'frozen', 'dry', 'other') then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Invalid shopping item category');
    end if;

    if v_list_id is null then
      insert into public.shopping_lists (household_id, is_active, name)
      values (p_household_id, true, 'Liste active')
      returning id into v_list_id;
    end if;

    insert into public.shopping_items (
      shopping_list_id,
      label,
      quantity,
      unit,
      category,
      status,
      source,
      added_by,
      updated_at
    )
    values (
      v_list_id,
      btrim(p_label),
      p_quantity,
      btrim(p_unit),
      p_category::storage_area,
      'active',
      'manual',
      p_user_id,
      v_now
    )
    returning id into v_item_id;

    return jsonb_build_object('ok', true, 'status', 200, 'action', p_action, 'shoppingListId', v_list_id, 'itemId', v_item_id);
  end if;

  if v_list_id is null then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'No active shopping list');
  end if;

  if p_action = 'toggle_item' then
    if p_item_id is null or p_checked is null then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Shopping item and checked status are required');
    end if;

    update public.shopping_items
    set status = case when p_checked then 'checked'::shopping_item_status else 'active'::shopping_item_status end,
      checked_at = case when p_checked then v_now else null end,
      checked_by = case when p_checked then p_user_id else null end,
      updated_at = v_now
    where id = p_item_id
      and shopping_list_id = v_list_id
      and status in ('active', 'checked')
    returning id into v_item_id;

    if v_item_id is null then
      return jsonb_build_object('ok', false, 'status', 404, 'message', 'Shopping item not found');
    end if;

    return jsonb_build_object('ok', true, 'status', 200, 'action', p_action, 'shoppingListId', v_list_id, 'itemId', v_item_id);
  end if;

  if p_action = 'toggle_all' then
    if p_checked is null then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Checked status is required');
    end if;

    update public.shopping_items
    set status = case when p_checked then 'checked'::shopping_item_status else 'active'::shopping_item_status end,
      checked_at = case when p_checked then v_now else null end,
      checked_by = case when p_checked then p_user_id else null end,
      updated_at = v_now
    where shopping_list_id = v_list_id
      and status in ('active', 'checked');

    return jsonb_build_object('ok', true, 'status', 200, 'action', p_action, 'shoppingListId', v_list_id);
  end if;

  if p_action = 'delete_item' then
    if p_item_id is null then
      return jsonb_build_object('ok', false, 'status', 400, 'message', 'Shopping item is required');
    end if;

    delete from public.shopping_items
    where id = p_item_id
      and shopping_list_id = v_list_id
      and status in ('active', 'checked')
    returning id into v_item_id;

    if v_item_id is null then
      return jsonb_build_object('ok', false, 'status', 404, 'message', 'Shopping item not found');
    end if;

    return jsonb_build_object('ok', true, 'status', 200, 'action', p_action, 'shoppingListId', v_list_id, 'itemId', v_item_id);
  end if;

  select count(*)
  into v_checked_count
  from public.shopping_items si
  where si.shopping_list_id = v_list_id
    and si.status = 'checked';

  update public.shopping_items
  set status = 'archived',
    updated_at = v_now
  where shopping_list_id = v_list_id
    and status = 'active';

  update public.shopping_lists
  set is_active = false,
    archived_at = v_now
  where id = v_list_id;

  if v_checked_count > 0 then
    insert into public.activity_events (
      household_id,
      user_id,
      type,
      title,
      description,
      can_undo,
      metadata
    )
    values (
      p_household_id,
      p_user_id,
      'shopping_finished',
      'Courses terminees',
      v_checked_count::text || ' article(s) coches',
      false,
      jsonb_build_object(
        'source', 'shopping',
        'shopping_list_id', v_list_id,
        'completed_at', v_now
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'action', p_action,
    'shoppingListId', v_list_id,
    'completedAt', v_now,
    'checkedCount', v_checked_count
  );
end;
$$;

revoke execute on function public.apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean) from PUBLIC;
revoke execute on function public.apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean) from anon;
revoke execute on function public.apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean) from authenticated;
grant execute on function public.apply_shopping_action(uuid, uuid, text, uuid, text, numeric, text, text, boolean) to service_role;
