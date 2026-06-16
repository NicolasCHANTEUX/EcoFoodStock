-- Transactional undo for inventory activity events.
-- Apply in Supabase, then /api/history/undo will use this RPC automatically.

create or replace function undo_activity_event(p_event_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_undo_event_id uuid;
  v_movement record;
  v_batch record;
  v_effective_batch_id uuid;
  v_inserted_movement_id uuid;
  v_inverse numeric(10,3);
  v_new_quantity numeric(10,3);
  v_movement_count integer := 0;
  v_undo_movements jsonb := '[]'::jsonb;
begin
  select id, household_id, type, title, can_undo, undone_at, metadata
    into v_event
  from activity_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found';
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
      and hm.household_id = v_event.household_id
  ) then
      raise exception 'Forbidden household access';
  end if;

  if not v_event.can_undo then
    raise exception 'Event cannot be undone';
  end if;

  if v_event.undone_at is not null then
    raise exception 'Event already undone';
  end if;

  insert into activity_events (
    household_id,
    user_id,
    type,
    title,
    description,
    can_undo,
    metadata
  )
  values (
    v_event.household_id,
    p_user_id,
    'undo',
    'Action annulée: ' || v_event.title,
    'Annulation de l''action ' || v_event.title,
    false,
    jsonb_build_object('undo_of_event_id', p_event_id)
  )
  returning id into v_undo_event_id;

  for v_movement in
    select *
    from inventory_movements
    where activity_event_id = p_event_id
    order by created_at asc, id asc
  loop
    v_movement_count := v_movement_count + 1;
    v_inverse := -v_movement.quantity_delta;
    v_effective_batch_id := v_movement.inventory_batch_id;

    if v_effective_batch_id is not null then
      select id, quantity_remaining, status
        into v_batch
      from inventory_batches
      where id = v_effective_batch_id
      for update;

      if found then
        v_new_quantity := greatest(0, v_batch.quantity_remaining + v_inverse);

        update inventory_batches
        set
          quantity_remaining = v_new_quantity,
          status = case
            when v_new_quantity > 0 then 'active'::batch_status
            when v_inverse < 0 then 'removed'::batch_status
            else status
          end,
          updated_at = now()
        where id = v_effective_batch_id;
      else
        v_effective_batch_id := null;
      end if;
    end if;

    if v_effective_batch_id is null and v_inverse > 0 and v_movement.product_id is not null then
      insert into inventory_batches (
        household_id,
        product_id,
        quantity_initial,
        quantity_remaining,
        unit,
        storage_area,
        status,
        source,
        added_by
      )
      values (
        coalesce(v_movement.household_id, v_event.household_id),
        v_movement.product_id,
        v_inverse,
        v_inverse,
        coalesce(v_movement.unit, 'pieces'),
        'other',
        'active',
        'undo_recreated',
        p_user_id
      )
      returning id into v_effective_batch_id;
    end if;

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
      undo_of_movement_id,
      metadata
    )
    values (
      coalesce(v_movement.household_id, v_event.household_id),
      v_effective_batch_id,
      v_movement.product_id,
      p_user_id,
      'undo',
      v_inverse,
      coalesce(v_movement.unit, 'pieces'),
      'Undo of movement ' || v_movement.id,
      v_undo_event_id,
      v_movement.id,
      jsonb_build_object('undo_of_activity_event', p_event_id)
    )
    returning id into v_inserted_movement_id;

    v_undo_movements := v_undo_movements || jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'originalMovement', v_movement.id,
        'undoMovement', v_inserted_movement_id
      )
    );
  end loop;

  if v_movement_count = 0 then
    raise exception 'No inventory movements found for event';
  end if;

  update activity_events
  set undone_at = now(), can_undo = false
  where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'undoneEventId', v_undo_event_id,
    'movements', v_undo_movements
  );
end;
$$;

revoke execute on function public.undo_activity_event(uuid, uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.undo_activity_event(uuid, uuid)
  to service_role;
