-- Transactional stock entry creation.
-- Versioned in supabase/migrations; keep this file as a readable source snapshot.

create or replace function create_inventory_batch_with_activity(
  p_household_id uuid,
  p_user_id uuid,
  p_product_id uuid,
  p_product_name text,
  p_quantity numeric,
  p_unit text,
  p_storage_area text,
  p_expiration_date date default null,
  p_notes text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch jsonb;
  v_batch_id uuid;
  v_activity_id uuid;
  v_movement jsonb;
begin
  if p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'Quantity must be positive');
  end if;

  if p_user_id is null then
    raise exception 'Authentication required';
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

  insert into inventory_batches (
    household_id,
    product_id,
    quantity_initial,
    quantity_remaining,
    unit,
    storage_area,
    expiration_date,
    added_by,
    notes,
    source
  )
  values (
    p_household_id,
    p_product_id,
    p_quantity,
    p_quantity,
    p_unit,
    p_storage_area::storage_area,
    p_expiration_date,
    p_user_id,
    p_notes,
    p_source
  )
  returning id, to_jsonb(inventory_batches.*) into v_batch_id, v_batch;

  insert into activity_events (
    household_id,
    user_id,
    type,
    title,
    description,
    product_id,
    can_undo,
    metadata
  )
  values (
    p_household_id,
    p_user_id,
    'product_added',
    '+' || p_quantity::text || ' ' || p_product_name || ' ajouté au stock',
    p_quantity::text || ' ' || p_unit || ' - ajout ' || case when p_source = 'scan' then 'via scan' else 'manuel' end,
    p_product_id,
    true,
    jsonb_build_object('source', p_source, 'inventory_batch_id', v_batch_id)
  )
  returning id into v_activity_id;

  insert into inventory_movements (
    household_id,
    inventory_batch_id,
    product_id,
    user_id,
    type,
    quantity_delta,
    unit,
    reason,
    activity_event_id,
    metadata
  )
  values (
    p_household_id,
    v_batch_id,
    p_product_id,
    p_user_id,
    'add',
    p_quantity,
    p_unit,
    case when p_source = 'scan' then 'Ajout depuis scan' else 'Ajout manuel' end,
    v_activity_id,
    jsonb_build_object('source', p_source, 'activity_event_id', v_activity_id)
  )
  returning to_jsonb(inventory_movements.*) into v_movement;

  return jsonb_build_object(
    'ok', true,
    'batch', v_batch,
    'movement', v_movement,
    'product', jsonb_build_object('id', p_product_id, 'name', p_product_name),
    'activityEventId', v_activity_id
  );
end;
$$;

revoke execute on function public.create_inventory_batch_with_activity(uuid, uuid, uuid, text, numeric, text, text, date, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.create_inventory_batch_with_activity(uuid, uuid, uuid, text, numeric, text, text, date, text, text)
  to service_role;
