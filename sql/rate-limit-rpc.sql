-- Distributed rate limiting backed by Supabase.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.rate_limits (
  rate_key text primary key,
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limits_expires_at_idx
  on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from PUBLIC;
revoke all on table public.rate_limits from anon;
revoke all on table public.rate_limits from authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

create or replace function public.check_rate_limit(
  p_scope text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_rate_key text;
  v_subject_hash text;
  v_attempts integer;
  v_window_start timestamptz;
  v_reset_at timestamptz;
begin
  if p_scope is null
    or btrim(p_scope) = ''
    or length(p_scope) > 80
    or p_subject is null
    or btrim(p_subject) = ''
    or length(p_subject) > 300
    or p_limit is null
    or p_limit <= 0
    or p_limit > 10000
    or p_window_seconds is null
    or p_window_seconds <= 0
    or p_window_seconds > 86400
  then
    return jsonb_build_object(
      'ok', false,
      'status', 400,
      'message', 'Invalid rate limit configuration'
    );
  end if;

  v_window := make_interval(secs => p_window_seconds);
  v_subject_hash := encode(digest(btrim(p_subject), 'sha256'), 'hex');
  v_rate_key := p_scope || ':' || v_subject_hash;

  delete from public.rate_limits
  where expires_at < v_now - interval '5 minutes';

  loop
    select attempts, window_start
    into v_attempts, v_window_start
    from public.rate_limits
    where rate_key = v_rate_key
    for update;

    if not found then
      begin
        insert into public.rate_limits (
          rate_key,
          scope,
          subject_hash,
          window_start,
          attempts,
          expires_at,
          updated_at
        )
        values (
          v_rate_key,
          p_scope,
          v_subject_hash,
          v_now,
          1,
          v_now + v_window,
          v_now
        );

        return jsonb_build_object(
          'ok', true,
          'allowed', true,
          'remaining', greatest(p_limit - 1, 0),
          'retryAfterSeconds', 0,
          'resetAt', v_now + v_window
        );
      exception when unique_violation then
        -- Another request created the row first; retry and lock it.
      end;
    else
      v_reset_at := v_window_start + v_window;

      if v_reset_at <= v_now then
        update public.rate_limits
        set attempts = 1,
          window_start = v_now,
          expires_at = v_now + v_window,
          updated_at = v_now
        where rate_key = v_rate_key;

        return jsonb_build_object(
          'ok', true,
          'allowed', true,
          'remaining', greatest(p_limit - 1, 0),
          'retryAfterSeconds', 0,
          'resetAt', v_now + v_window
        );
      end if;

      if v_attempts >= p_limit then
        return jsonb_build_object(
          'ok', true,
          'allowed', false,
          'remaining', 0,
          'retryAfterSeconds', greatest(1, ceiling(extract(epoch from (v_reset_at - v_now)))::integer),
          'resetAt', v_reset_at
        );
      end if;

      update public.rate_limits
      set attempts = v_attempts + 1,
        expires_at = v_reset_at,
        updated_at = v_now
      where rate_key = v_rate_key;

      return jsonb_build_object(
        'ok', true,
        'allowed', true,
        'remaining', greatest(p_limit - v_attempts - 1, 0),
        'retryAfterSeconds', 0,
        'resetAt', v_reset_at
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, integer, integer) from PUBLIC;
revoke execute on function public.check_rate_limit(text, text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
