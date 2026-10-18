-- In-app platform reset for the Organisation Admin (Admin > Reset platform).
--
-- app.seed_rows holds the shipped starting configuration (written by scripts/seed-supabase.ts), so a
-- reset can restore it without running a script: everything users entered is erased, the shipped rows
-- are put back, and every login that is not a seed account is removed.

create table if not exists app.seed_rows (
  tbl  text not null,
  pk   text not null,
  data jsonb not null,
  primary key (tbl, pk)
);
revoke all on app.seed_rows from public, anon, authenticated;

create or replace function app.reset_platform(p_mode text) returns void
language plpgsql security definer set search_path = public, app, auth as $$
declare
  wipe text[] := array[
    'run_results', 'runs', 'run_schedules', 'positions', 'batches', 'staged_batches', 'snapshots',
    'balance_history', 'account_history', 'model_runs', 'rule_history', 'rules', 'approvals',
    'remediation_issues', 'notification_rules', 'notifications', 'risk_entries', 'alco_meetings',
    'regulatory_returns', 'report_packs', 'limit_configs', 'temporary_limits', 'breach_notes',
    'dimension_members', 'data_sources', 'fx_rates', 'yield_curves', 'economic_indicators',
    'holiday_calendars', 'currencies', 'connectors', 'onboarding', 'settings', 'affiliates', 'audit_events'];
  t text;
  r record;
  pkcol text;
  seed_users text[];
begin
  if coalesce(app.me()->>'role', '') <> 'ADMIN' then
    raise exception 'Only an Organisation Admin can reset the platform';
  end if;

  if p_mode = 'onboarding' then
    delete from public.onboarding where id = 'ORG';
    return;
  elsif p_mode <> 'all' then
    raise exception 'Unknown reset mode %', p_mode;
  end if;

  if not exists (select 1 from app.seed_rows) then
    raise exception 'The shipped configuration has not been recorded yet - run scripts/seed-supabase.ts once';
  end if;

  -- Triggers (append-only audit, maker-checker, activation) guard normal use, not a full wipe.
  foreach t in array wipe || array['app_users'] loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  foreach t in array wipe loop
    execute format('delete from public.%I', t);
  end loop;

  for r in select * from app.seed_rows where tbl <> 'app_users' loop
    pkcol := case when r.tbl in ('affiliates', 'currencies', 'roles') then 'code' else 'id' end;
    execute format('insert into public.%I (%I, data) values ($1, $2) on conflict (%I) do update set data = excluded.data',
                   r.tbl, pkcol, pkcol)
      using r.pk, r.data;
  end loop;

  -- Logins that are not seed accounts go entirely; seed accounts forget their scope and as-of date.
  select array_agg(pk) into seed_users from app.seed_rows where tbl = 'app_users';
  delete from auth.users where id in (
    select auth_user_id from public.app_users where id <> all(seed_users) and auth_user_id is not null);
  delete from public.app_users where id <> all(seed_users);
  update public.app_users set data = data - 'workingContext';

  foreach t in array wipe || array['app_users'] loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end;
$$;

create or replace function public.reset_platform(p_mode text) returns void
language sql security definer set search_path = public, app as $$
  select app.reset_platform(p_mode);
$$;
revoke all on function app.reset_platform(text) from public, anon;
revoke all on function public.reset_platform(text) from public, anon;
grant execute on function public.reset_platform(text) to authenticated;
