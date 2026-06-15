-- Transactional application-data deletion for account removal.
-- Supabase Auth user deletion still happens from the API after this function succeeds.

create or replace function delete_application_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_ids uuid[];
  v_households_to_delete uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or p_user_id is null then
      raise exception 'Authentication required';
    end if;

    if not exists (
      select 1
      from users u
      where u.id = p_user_id
        and u.auth_user_id = auth.uid()
    ) then
      raise exception 'Forbidden account access';
    end if;
  end if;

  select coalesce(array_agg(distinct household_id), '{}')
  into v_household_ids
  from household_members
  where user_id = p_user_id;

  select coalesce(array_agg(household_id), '{}')
  into v_households_to_delete
  from (
    select household_id
    from household_members
    where household_id = any(v_household_ids)
    group by household_id
    having count(*) <= 1
  ) single_member_households;

  if array_length(v_households_to_delete, 1) is not null then
    delete from invitation_tokens
    where household_id = any(v_households_to_delete);

    delete from households
    where id = any(v_households_to_delete);
  end if;

  delete from household_members
  where user_id = p_user_id
    and (
      array_length(v_households_to_delete, 1) is null
      or household_id <> all(v_households_to_delete)
    );

  update households
  set created_by = null
  where created_by = p_user_id;

  delete from users
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'deletedHouseholds', coalesce(array_length(v_households_to_delete, 1), 0)
  );
end;
$$;

revoke execute on function public.delete_application_account_data(uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.delete_application_account_data(uuid)
  to service_role;
