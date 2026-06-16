-- Atomic invitation join flow.
-- Safe to run multiple times after align-units-and-invitation-tokens.sql.

create unique index if not exists household_members_household_user_unique
  on public.household_members (household_id, user_id);

create or replace function public.join_household_with_invitation(
  p_token text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
  v_now timestamptz := now();
  v_existing_member_id uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Token requis');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Utilisateur non authentifie');
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or not exists (
      select 1
      from public.users u
      where u.id = p_user_id
        and u.auth_user_id = auth.uid()
    ) then
      raise exception 'forbidden join_household_with_invitation request'
        using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Utilisateur non authentifie');
  end if;

  select it.id, it.household_id, it.expires_at, it.consumed_at
  into v_token
  from public.invitation_tokens it
  where it.token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'Token invalide');
  end if;

  if v_token.consumed_at is not null then
    return jsonb_build_object('ok', false, 'status', 410, 'error', 'Token deja utilise');
  end if;

  if v_token.expires_at is not null and v_token.expires_at < v_now then
    return jsonb_build_object('ok', false, 'status', 410, 'error', 'Token expire');
  end if;

  select hm.id
  into v_existing_member_id
  from public.household_members hm
  where hm.household_id = v_token.household_id
    and hm.user_id = p_user_id
  for update;

  if v_existing_member_id is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 200,
      'message', 'already',
      'householdId', v_token.household_id,
      'alreadyMember', true
    );
  end if;

  begin
    insert into public.household_members (household_id, user_id, role)
    values (v_token.household_id, p_user_id, 'member');
  exception when unique_violation then
    return jsonb_build_object(
      'ok', true,
      'status', 200,
      'message', 'already',
      'householdId', v_token.household_id,
      'alreadyMember', true
    );
  end;

  update public.invitation_tokens
  set consumed_at = v_now,
      consumed_by = p_user_id
  where id = v_token.id;

  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'householdId', v_token.household_id,
    'alreadyMember', false
  );
end;
$$;

revoke execute on function public.join_household_with_invitation(text, uuid) from PUBLIC;
revoke execute on function public.join_household_with_invitation(text, uuid) from anon;
revoke execute on function public.join_household_with_invitation(text, uuid) from authenticated;
grant execute on function public.join_household_with_invitation(text, uuid) to service_role;
