-- Transactional inventory action for consume / waste / adjust.
-- Versioned in supabase/migrations; keep this file as a readable source snapshot.

create or replace function apply_inventory_action(
  p_household_id uuid,
  p_user_id uuid,
  p_product_id uuid,
  p_action text,
  p_quantity numeric,
  p_storage_area text default null,
  p_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch inventory_batches%rowtype;
  v_product_name text;
  v_activity_id uuid;
  v_remaining numeric(10,3) := round(greatest(p_quantity, 0)::numeric, 3);
  v_total_available numeric(10,3);
  v_applied numeric(10,3);
  v_next_remaining numeric(10,3);
  v_status batch_status;
  v_movement_type movement_type;
  v_activity_type activity_type;
  v_title_suffix text;
  v_description_suffix text;
  v_reason text;
  v_updated_batch jsonb;
  v_movement jsonb;
  v_batches jsonb := '[]'::jsonb;
  v_movements jsonb := '[]'::jsonb;
begin
  if p_action not in ('consume', 'waste', 'adjust') then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'Invalid inventory action');
  end if;

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

  select coalesce(sum(quantity_remaining), 0)
  into v_total_available
  from (
    select quantity_remaining
    from inventory_batches
    where household_id = p_household_id
      and product_id = p_product_id
      and status = 'active'
      and quantity_remaining > 0
      and (p_storage_area is null or storage_area::text = p_storage_area)
      and (p_unit is null or unit = p_unit)
    for update
  ) locked_batches;

  if v_total_available <= 0 then
    return jsonb_build_object('ok', false, 'status', 404, 'message', 'No active batch found for this product');
  end if;

  if p_quantity > v_total_available then
    return jsonb_build_object(
      'ok', false,
      'status', 409,
      'message', 'Requested quantity is greater than available stock',
      'availableQuantity', v_total_available
    );
  end if;

  select name
  into v_product_name
  from products
  where id = p_product_id;

  if p_action = 'waste' then
    v_status := 'wasted';
    v_movement_type := 'waste';
    v_activity_type := 'product_wasted';
    v_title_suffix := 'jeté';
    v_description_suffix := 'sorti du stock';
    v_reason := 'Sortie du stock (jeté)';
  elsif p_action = 'adjust' then
    v_status := 'removed';
    v_movement_type := 'adjust';
    v_activity_type := 'product_adjusted';
    v_title_suffix := 'ajusté';
    v_description_suffix := 'ajusté manuellement';
    v_reason := 'Ajustement manuel';
  else
    v_status := 'consumed';
    v_movement_type := 'consume';
    v_activity_type := 'product_consumed';
    v_title_suffix := 'consommé';
    v_description_suffix := 'retiré du stock';
    v_reason := 'Sortie du stock (consommé)';
  end if;

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
    v_activity_type,
    coalesce(v_product_name, p_product_id::text) || ' ' || v_title_suffix,
    p_quantity::text || ' ' || coalesce(p_unit, 'pieces') || ' ' || v_description_suffix,
    p_product_id,
    true,
    jsonb_build_object(
      'source', 'inventory_action',
      'action', p_action,
      'requested_quantity', p_quantity,
      'storage_area', p_storage_area,
      'unit', p_unit
    )
  )
  returning id into v_activity_id;

  for v_batch in
    select *
    from inventory_batches
    where household_id = p_household_id
      and product_id = p_product_id
      and status = 'active'
      and quantity_remaining > 0
      and (p_storage_area is null or storage_area::text = p_storage_area)
      and (p_unit is null or unit = p_unit)
    order by expiration_date asc nulls last, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_applied := least(v_remaining, v_batch.quantity_remaining);
    v_next_remaining := round((v_batch.quantity_remaining - v_applied)::numeric, 3);

    update inventory_batches
    set
      quantity_remaining = v_next_remaining,
      status = case when v_next_remaining = 0 then v_status else status end,
      updated_at = now()
    where id = v_batch.id
    returning to_jsonb(inventory_batches.*) into v_updated_batch;

    insert into inventory_movements (
      household_id,
      user_id,
      inventory_batch_id,
      product_id,
      type,
      quantity_delta,
      unit,
      reason,
      activity_event_id,
      metadata
    )
    values (
      p_household_id,
      p_user_id,
      v_batch.id,
      p_product_id,
      v_movement_type,
      -v_applied,
      v_batch.unit,
      v_reason,
      v_activity_id,
      jsonb_build_object('source', 'inventory_action', 'action', p_action, 'activity_event_id', v_activity_id)
    )
    returning to_jsonb(inventory_movements.*) into v_movement;

    v_batches := v_batches || jsonb_build_array(v_updated_batch);
    v_movements := v_movements || jsonb_build_array(v_movement);
    v_remaining := round((v_remaining - v_applied)::numeric, 3);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batches', v_batches,
    'movements', v_movements,
    'appliedQuantity', p_quantity,
    'activityEventId', v_activity_id
  );
end;
$$;

revoke execute on function public.apply_inventory_action(uuid, uuid, uuid, text, numeric, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.apply_inventory_action(uuid, uuid, uuid, text, numeric, text, text)
  to service_role;
