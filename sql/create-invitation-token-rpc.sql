-- Atomic invitation token creation.
-- Safe to run multiple times after align-units-and-invitation-tokens.sql.

create or replace function public.create_invitation_token(
  p_household_id uuid,
  p_user_id uuid,
  p_token text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
begin
  if p_household_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Foyer ou utilisateur manquant');
  end if;

  if p_token is null or btrim(p_token) = '' or length(p_token) > 200 then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Token invalide');
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Date d''expiration invalide');
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or not exists (
      select 1
      from public.users u
      where u.id = p_user_id
        and u.auth_user_id = auth.uid()
    ) then
      raise exception 'forbidden create_invitation_token request'
        using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = p_user_id
      and hm.role in ('owner', 'admin')
  ) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'Droits insuffisants');
  end if;

  begin
    insert into public.invitation_tokens (token, household_id, created_by, expires_at)
    values (p_token, p_household_id, p_user_id, p_expires_at)
    returning id, token, household_id, expires_at
    into v_token;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Token deja existant');
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 200,
    'token', v_token.token,
    'householdId', v_token.household_id,
    'expires_at', v_token.expires_at
  );
end;
$$;

revoke execute on function public.create_invitation_token(uuid, uuid, text, timestamptz) from PUBLIC;
revoke execute on function public.create_invitation_token(uuid, uuid, text, timestamptz) from anon;
revoke execute on function public.create_invitation_token(uuid, uuid, text, timestamptz) from authenticated;
grant execute on function public.create_invitation_token(uuid, uuid, text, timestamptz) to service_role;
