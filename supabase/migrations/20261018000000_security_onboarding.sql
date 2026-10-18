-- Ascent ALM - Phase 2: security hardening + onboarding state model. Hand-written (not generated):
-- 20261017000000_init.sql stays as history and everything below is applied on top of it.
--
--   A. app_users: a user manager can only manage users they are entitled to (no escalation by an
--      Affiliate Administrator, no self-promotion to Group scope).
--   B. Group-level rows (no affiliate, or GROUP) are writable only by Group-level users; global reference
--      tables likewise.
--   C. Child tables that had no affiliate column (run_results, rule_history, temporary_limits,
--      breach_notes, audit_events) get one, filled by trigger, so reads are affiliate-scoped too.
--   E. Maker-checker compares user ids, not display names.
--   F. An affiliate goes Live only through an approved Activate request, enforced by the database.
--   Roles: APPROVER, affiliate.manage, Affiliate Administrators may edit their own affiliate's settings.
--   Onboarding state (public.onboarding) and scoped settings (public.settings).

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- A Group-level user: scoped to GROUP, or holding group.manage.
create or replace function app.is_group_user() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.me()->>'affiliateCode' = 'GROUP', false) or app.has_perm('group.manage')
$$;

-- Write scope (stricter than the read scope app.affiliate_ok): Group-level rows (no affiliate, or GROUP)
-- only by Group-level users; an affiliate's rows by Group-level users or that affiliate's own users.
create or replace function app.affiliate_write_ok(code text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select case
    when code is null or code = 'GROUP' then app.is_group_user()
    else app.is_group_user() or code = app.me()->>'affiliateCode'
  end
$$;

-- True when `role_code`'s permissions include admin.manage or group.manage.
create or replace function app.role_is_privileged(role_code text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select r.data->'permissions' ?| array['admin.manage', 'group.manage'] from public.roles r where r.code = role_code),
    false)
$$;

-- May the signed-in user create / change / remove this user record? An Administrator (admin.manage) may
-- manage anyone; any other user manager only users of their own affiliate holding a non-privileged role.
create or replace function app.can_manage_user(target jsonb) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_perm('users.manage') and (
    app.has_perm('admin.manage')
    or (
      target->>'affiliateCode' is not distinct from app.me()->>'affiliateCode'
      and not app.role_is_privileged(target->>'role')
    )
  )
$$;

-- ─── A. app_users ───────────────────────────────────────────────────────────

drop policy if exists app_users_read on public.app_users;
drop policy if exists app_users_insert on public.app_users;
drop policy if exists app_users_update on public.app_users;
drop policy if exists app_users_delete on public.app_users;

-- Group-level users see the whole directory; anyone else their own affiliate's users plus themselves.
create policy app_users_read on public.app_users for select to authenticated
  using (
    auth_user_id = auth.uid()
    or (app.has_perm('dashboard.view') and (app.is_group_user() or affiliate_code = app.me()->>'affiliateCode')));
create policy app_users_insert on public.app_users for insert to authenticated
  with check (app.can_manage_user(data));
create policy app_users_update on public.app_users for update to authenticated
  using (auth_user_id = auth.uid() or app.can_manage_user(data))
  with check (auth_user_id = auth.uid() or app.can_manage_user(data));
create policy app_users_delete on public.app_users for delete to authenticated
  using (app.can_manage_user(data));

-- Role, scope, active flag and sign-in link change only by someone who may manage the user both as it
-- was and as it will be - so nobody promotes themselves (or anyone) past their own reach. Every other
-- field (name, last sign-in, onboardingSeenAt, toursSeen, ...) stays self-editable.
create or replace function app.guard_self_escalation() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_owner_session() then
    return new;
  end if;
  if new.data->>'role' is distinct from old.data->>'role'
    or new.data->>'affiliateCode' is distinct from old.data->>'affiliateCode'
    or new.data->>'isActive' is distinct from old.data->>'isActive'
    or new.auth_user_id is distinct from old.auth_user_id then
    if not app.has_perm('users.manage') then
      raise exception 'Only a user manager can change a role, scope or active flag' using errcode = '42501';
    end if;
    if not app.has_perm('admin.manage') and app.role_is_privileged(new.data->>'role') then
      raise exception 'Not permitted: only an Administrator can grant an administrative role' using errcode = '42501';
    end if;
    if not (app.can_manage_user(old.data) and app.can_manage_user(new.data)) then
      raise exception 'Not permitted: you can only manage non-administrative users of your own affiliate' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Provisioning (create_login / set_login_password) follows exactly the same rule as the table policies.
create or replace function app.assert_can_provision(p_user jsonb) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if app.is_owner_session() then
    return;
  end if;
  if not app.has_perm('users.manage') then
    raise exception 'Not permitted: managing sign-ins needs the users.manage permission' using errcode = '42501';
  end if;
  if not app.has_perm('admin.manage') and app.role_is_privileged(p_user->>'role') then
    raise exception 'Not permitted: only an Administrator can grant an administrative role' using errcode = '42501';
  end if;
  if not app.can_manage_user(p_user) then
    raise exception 'Not permitted: you can only provision users for your own affiliate' using errcode = '42501';
  end if;
end $$;

-- ─── B. Write scope on every affiliate-scoped table ─────────────────────────
-- Every insert/update/delete policy that scoped by app.affiliate_ok() now scopes by app.affiliate_write_ok();
-- read policies keep affiliate_ok (Group-level rows stay readable by everyone).

do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
       and (coalesce(qual, '') like '%affiliate_ok(%' or coalesce(with_check, '') like '%affiliate_ok(%')
  loop
    v_using := replace(p.qual, 'affiliate_ok(', 'affiliate_write_ok(');
    v_check := replace(p.with_check, 'affiliate_ok(', 'affiliate_write_ok(');
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    v_sql := format('create policy %I on %I.%I for %s to authenticated', p.policyname, p.schemaname, p.tablename, p.cmd);
    if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;

-- Global reference tables (no affiliate column): writes additionally need a Group-level user.
do $$
declare
  p record;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename in ('connectors', 'yield_curves', 'fx_rates', 'currencies', 'economic_indicators',
                         'holiday_calendars', 'roles')
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    v_sql := format('create policy %I on %I.%I for %s to authenticated', p.policyname, p.schemaname, p.tablename, p.cmd);
    if p.qual is not null then v_sql := v_sql || ' using ((' || p.qual || ') and app.is_group_user())'; end if;
    if p.with_check is not null then v_sql := v_sql || ' with check ((' || p.with_check || ') and app.is_group_user())'; end if;
    execute v_sql;
  end loop;
end $$;

-- ─── C. Affiliate column on child tables ────────────────────────────────────
-- A plain column, always (re)computed by a BEFORE trigger - whatever a client sends for it is overwritten.

alter table public.run_results add column if not exists affiliate_code text;
alter table public.rule_history add column if not exists affiliate_code text;
alter table public.temporary_limits add column if not exists affiliate_code text;
alter table public.breach_notes add column if not exists affiliate_code text;
alter table public.audit_events add column if not exists affiliate_code text;
create index if not exists run_results_affiliate_code_idx on public.run_results (affiliate_code);
create index if not exists rule_history_affiliate_code_idx on public.rule_history (affiliate_code);
create index if not exists temporary_limits_affiliate_code_idx on public.temporary_limits (affiliate_code);
create index if not exists breach_notes_affiliate_code_idx on public.breach_notes (affiliate_code);
create index if not exists audit_events_affiliate_code_idx on public.audit_events (affiliate_code);

create or replace function app.set_run_result_affiliate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  new.affiliate_code := (select r.affiliate_code from public.runs r where r.id = new.data->>'runId');
  return new;
end $$;

create or replace function app.set_rule_history_affiliate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if coalesce(new.data->'snapshot', '{}'::jsonb) ? 'affiliateCode' then
    new.affiliate_code := new.data->'snapshot'->>'affiliateCode';
  else
    new.affiliate_code := (select r.affiliate_code from public.rules r where r.id = new.data->>'ruleId');
  end if;
  return new;
end $$;

create or replace function app.set_temporary_limit_affiliate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  new.affiliate_code := (select l.affiliate_code from public.limit_configs l where l.id = new.data->>'limitId');
  return new;
end $$;

-- breachId is the evaluated limit's id (pages/Limits.tsx). A note records the affiliate it was written
-- for when the limit is a Group default applied to an affiliate; otherwise the limit's own affiliate.
create or replace function app.set_breach_note_affiliate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  new.affiliate_code := coalesce(
    nullif(new.data->>'affiliateCode', ''),
    (select l.affiliate_code from public.limit_configs l where l.id = new.data->>'breachId'));
  return new;
end $$;

-- The acting user's affiliate; a direct owner connection (seed scripts) falls back to the event's userId.
create or replace function app.set_audit_event_affiliate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  new.affiliate_code := coalesce(
    app.me()->>'affiliateCode',
    (select u.affiliate_code from public.app_users u where u.id = new.data->>'userId'));
  return new;
end $$;

drop trigger if exists run_results_affiliate on public.run_results;
create trigger run_results_affiliate before insert or update on public.run_results
  for each row execute function app.set_run_result_affiliate();
drop trigger if exists rule_history_affiliate on public.rule_history;
create trigger rule_history_affiliate before insert or update on public.rule_history
  for each row execute function app.set_rule_history_affiliate();
drop trigger if exists temporary_limits_affiliate on public.temporary_limits;
create trigger temporary_limits_affiliate before insert or update on public.temporary_limits
  for each row execute function app.set_temporary_limit_affiliate();
drop trigger if exists breach_notes_affiliate on public.breach_notes;
create trigger breach_notes_affiliate before insert or update on public.breach_notes
  for each row execute function app.set_breach_note_affiliate();
drop trigger if exists audit_events_affiliate on public.audit_events;
create trigger audit_events_affiliate before insert on public.audit_events
  for each row execute function app.set_audit_event_affiliate();

-- Backfill (the triggers above fire on these no-op updates).
update public.run_results set data = data;
update public.rule_history set data = data;
update public.temporary_limits set data = data;
update public.breach_notes set data = data;
alter table public.audit_events disable trigger audit_events_no_update;
update public.audit_events e set affiliate_code = u.affiliate_code
  from public.app_users u where u.id = e.data->>'userId' and e.affiliate_code is null;
alter table public.audit_events enable trigger audit_events_no_update;

-- Policies on the new column.
do $$
declare
  t text;
  perms text;
begin
  foreach t in array array['run_results', 'rule_history', 'temporary_limits', 'breach_notes'] loop
    perms := case t
      when 'run_results' then 'array[''run.execute'']'
      when 'rule_history' then 'array[''rules.edit'', ''data.configure'']'
      else 'array[''limits.manage'', ''run.execute'', ''risk.configure'']'
    end;
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_perm(''dashboard.view'') and app.affiliate_ok(affiliate_code))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_any_perm(%s) and app.affiliate_write_ok(affiliate_code))', t || '_insert', t, perms);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_any_perm(%s) and app.affiliate_write_ok(affiliate_code)) with check (app.has_any_perm(%s) and app.affiliate_write_ok(affiliate_code))', t || '_update', t, perms, perms);
    execute format('create policy %I on public.%I for delete to authenticated using (app.has_any_perm(%s) and app.affiliate_write_ok(affiliate_code))', t || '_delete', t, perms);
  end loop;
end $$;

drop policy if exists audit_events_read on public.audit_events;
drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_read on public.audit_events for select to authenticated
  using (app.has_any_perm(array['audit.view', 'admin.manage', 'group.manage']) and app.affiliate_ok(affiliate_code));
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check (data->>'userId' = app.me()->>'id' and app.affiliate_write_ok(affiliate_code));

-- ─── E. Maker-checker by user id ────────────────────────────────────────────

-- Existing requests: the requester's id where the display name identifies exactly one user. A seed
-- request ('system-seed') has no user and keeps no id - a null id is never "the current user".
alter table public.approvals disable trigger approvals_guard;
update public.approvals a
   set data = a.data || jsonb_build_object('requestedById', m.id)
  from (select u.data->>'name' as name, min(u.id) as id from public.app_users u
         group by u.data->>'name' having count(*) = 1) m
 where m.name = a.data->>'requestedBy' and not (a.data ? 'requestedById');
update public.approvals a
   set data = a.data || jsonb_build_object('decidedById', m.id)
  from (select u.data->>'name' as name, min(u.id) as id from public.app_users u
         group by u.data->>'name' having count(*) = 1) m
 where m.name = a.data->>'decidedBy' and not (a.data ? 'decidedById');
alter table public.approvals enable trigger approvals_guard;

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert to authenticated
  with check (
    app.has_perm('dashboard.view') and app.affiliate_write_ok(affiliate_code)
    and data->>'status' = 'Pending'
    and data->>'requestedById' = app.me()->>'id');

create or replace function app.guard_approval_decision() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  me_id text := app.me()->>'id';
  me_name text := app.me()->>'name';
  is_requester boolean := (app.me()->>'id') is not null and (app.me()->>'id') = old.data->>'requestedById';
begin
  if old.data->>'status' <> 'Pending' then
    raise exception 'Request % is already %', old.id, old.data->>'status';
  end if;
  if new.data->>'requestedBy' is distinct from old.data->>'requestedBy'
    or new.data->>'requestedById' is distinct from old.data->>'requestedById' then
    raise exception 'The requester of an approval cannot be changed';
  end if;
  if new.data->>'status' in ('Approved', 'Rejected') then
    if not app.has_perm('approvals.approve') then
      raise exception 'Deciding a request needs the approvals.approve permission';
    end if;
    if is_requester then
      raise exception 'Segregation of duties: the maker of a request cannot also be its checker';
    end if;
    if new.data->>'decidedById' is distinct from me_id then
      raise exception 'A decision must be recorded under the deciding user''s own id';
    end if;
    -- The display name is taken from the decider's own record, never from the client.
    new.data := jsonb_set(new.data, '{decidedBy}', to_jsonb(me_name));
  elsif new.data->>'status' = 'Withdrawn' then
    if not is_requester and not app.has_perm('approvals.approve') then
      raise exception 'Only the requester or an approver can withdraw a request';
    end if;
  elsif not is_requester then
    raise exception 'Only the requester can amend a pending request';
  end if;
  return new;
end $$;

-- ─── F. Activation through approval only ────────────────────────────────────

-- An approved Affiliates/Activate request is what moves the affiliate Live (from Testing, or back from
-- Suspended). The transaction-local flag tells the affiliates guard this change is the sanctioned one.
create or replace function app.apply_activation_approval() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.data->>'status' = 'Approved'
     and old.data->>'status' is distinct from 'Approved'
     and new.data->>'module' = 'Affiliates'
     and new.data->>'action' = 'Activate' then
    perform set_config('app.activating', new.data->>'entityId', true);
    update public.affiliates
       set data = jsonb_set(data, '{status}', '"Live"')
     where code = new.data->>'entityId'
       and data->>'status' in ('Testing', 'Suspended');
    perform set_config('app.activating', '', true);
  end if;
  return new;
end $$;

drop trigger if exists approvals_activate on public.approvals;
create trigger approvals_activate after update on public.approvals
  for each row execute function app.apply_activation_approval();

-- Fields an Affiliate Administrator (affiliate.manage without group.manage) may change on their own
-- affiliate. Identity and governance fields (code, status, functionalCurrency, regulator,
-- inheritGroupRules, legalEntityCode, ...) stay with Group.
create or replace function app.affiliate_self_editable_fields() returns text[]
language sql immutable as $$
  select array['name', 'feeds', 'internalThresholds', 'limitsConfirmed', 'reportingTimezone', 'holidayCalendarId',
               'requiredContributors', 'contactName', 'contactEmail', 'contactPhone', 'description']
$$;

create or replace function app.guard_affiliate_write() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_activating boolean := coalesce(current_setting('app.activating', true), '') = new.code;
  v_key text;
  v_new jsonb;
  v_old jsonb;
  v_limit record;
  v_amber numeric;
  v_red numeric;
begin
  if app.is_owner_session() then
    return new;
  end if;

  if new.data->>'status' = 'Live'
     and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'Live')
     and not v_activating then
    raise exception 'An affiliate goes Live only through an approved Activate request - raise one from Affiliate Settings for an approver to decide'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or v_activating or app.has_perm('group.manage') then
    return new;
  end if;

  -- Affiliate Administrator editing their own affiliate (the update policy already limits the row).
  if (old.data - app.affiliate_self_editable_fields()) is distinct from (new.data - app.affiliate_self_editable_fields()) then
    raise exception 'Not permitted: an Affiliate Administrator can change only this affiliate''s name, data sources, thresholds, reporting timezone, holiday calendar and contact details'
      using errcode = '42501';
  end if;

  -- Thresholds may be tightened freely; loosening the organisation default needs an approval.
  for v_key, v_new in select key, value from jsonb_each(coalesce(new.data->'internalThresholds', '{}'::jsonb)) loop
    v_old := old.data->'internalThresholds'->v_key;
    continue when v_old is not distinct from v_new;
    select l.data->>'direction' as direction,
           (l.data->>'amberThreshold')::numeric as amber,
           (l.data->>'redThreshold')::numeric as red
      into v_limit
      from public.limit_configs l
     where l.affiliate_code is null and l.metric_key = v_key and coalesce(l.is_active, true)
     order by l.id
     limit 1;
    continue when not found;
    v_amber := (v_new->>'amberPercent')::numeric;
    v_red := (v_new->>'redPercent')::numeric;
    if (v_limit.direction = 'higher-is-better' and (v_amber < v_limit.amber or v_red < v_limit.red))
       or (v_limit.direction = 'lower-is-better' and (v_amber > v_limit.amber or v_red > v_limit.red)) then
      raise exception 'The % threshold (amber %, red %) is looser than the organisation default (amber %, red %). Loosening an organisation default needs an approval - raise an Override request for a Group approver, or keep it at or tighter than the default.',
        v_key, v_amber, v_red, v_limit.amber, v_limit.red
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists affiliates_guard on public.affiliates;
create trigger affiliates_guard before insert or update on public.affiliates
  for each row execute function app.guard_affiliate_write();

drop policy if exists affiliates_insert on public.affiliates;
drop policy if exists affiliates_update on public.affiliates;
drop policy if exists affiliates_delete on public.affiliates;
create policy affiliates_insert on public.affiliates for insert to authenticated
  with check (app.has_perm('group.manage'));
create policy affiliates_update on public.affiliates for update to authenticated
  using (app.has_perm('group.manage') or (app.has_perm('affiliate.manage') and code = app.me()->>'affiliateCode'))
  with check (app.has_perm('group.manage') or (app.has_perm('affiliate.manage') and code = app.me()->>'affiliateCode'));
create policy affiliates_delete on public.affiliates for delete to authenticated
  using (app.has_perm('group.manage'));

-- ─── Roles ──────────────────────────────────────────────────────────────────

update public.roles
   set data = jsonb_set(data, '{permissions}', (data->'permissions') || '["affiliate.manage"]'::jsonb)
 where code in ('ADMIN', 'AFFILIATE_ADMIN') and not (data->'permissions' ? 'affiliate.manage');
update public.roles set data = jsonb_set(data, '{name}', '"ALM Analyst"')
 where code = 'RISK_ANALYST' and data->>'name' = 'Risk Analyst';
insert into public.roles (code, data) values ('APPROVER', jsonb_build_object(
  'code', 'APPROVER',
  'name', 'Approver',
  'description', 'Checker for maker-checker requests - reviews and approves or rejects changes raised by others; read-only elsewhere.',
  'permissions', jsonb_build_array('dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'data.view',
                                   'approvals.approve', 'commentary.review')))
on conflict (code) do nothing;

-- ─── Onboarding state ───────────────────────────────────────────────────────

create table if not exists public.onboarding (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  affiliate_code text generated always as ((data->>'affiliateCode')) stored,
  status text generated always as ((data->>'status')) stored
);
create index if not exists onboarding_affiliate_code_idx on public.onboarding (affiliate_code);
alter table public.onboarding add constraint onboarding_id_matches_data check (data->>'id' = id);
alter table public.onboarding add constraint onboarding_id_shape check (
  (id = 'ORG' and data->>'scope' = 'Organisation' and data->>'affiliateCode' = 'GROUP')
  or (id = 'AFF:' || (data->>'affiliateCode') and data->>'scope' = 'Affiliate' and data->>'affiliateCode' <> 'GROUP'));
alter table public.onboarding add constraint onboarding_status_valid check (
  data->>'status' in ('NotStarted', 'InProgress', 'Complete'));
create trigger onboarding_touch before update on public.onboarding for each row execute function app.touch_updated_at();
alter table public.onboarding enable row level security;

-- Organisation row: group.manage. An affiliate's row: group.manage, or that affiliate's own affiliate.manage.
create or replace function app.onboarding_write_ok(code text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_perm('group.manage')
      or (code is not null and code <> 'GROUP'
          and app.has_perm('affiliate.manage') and code = app.me()->>'affiliateCode')
$$;

create policy onboarding_read on public.onboarding for select to authenticated
  using (app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code));
create policy onboarding_insert on public.onboarding for insert to authenticated
  with check (app.onboarding_write_ok(affiliate_code));
create policy onboarding_update on public.onboarding for update to authenticated
  using (app.onboarding_write_ok(affiliate_code)) with check (app.onboarding_write_ok(affiliate_code));
create policy onboarding_delete on public.onboarding for delete to authenticated
  using (app.onboarding_write_ok(affiliate_code));

-- ─── Scoped settings ────────────────────────────────────────────────────────

create table if not exists public.settings (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  affiliate_code text generated always as ((data->>'affiliateCode')) stored,
  key text generated always as ((data->>'key')) stored
);
create index if not exists settings_affiliate_code_idx on public.settings (affiliate_code);
create index if not exists settings_key_idx on public.settings (key);
alter table public.settings add constraint settings_id_matches_data check (data->>'id' = id);
alter table public.settings add constraint settings_id_shape check (id = (data->>'affiliateCode') || ':' || (data->>'key'));
create trigger settings_touch before update on public.settings for each row execute function app.touch_updated_at();
alter table public.settings enable row level security;

create or replace function app.settings_write_ok(code text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_perm('group.manage')
      or (code is not null and code <> 'GROUP'
          and app.has_perm('affiliate.manage') and code = app.me()->>'affiliateCode')
$$;

create policy settings_read on public.settings for select to authenticated
  using (app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code));
create policy settings_insert on public.settings for insert to authenticated
  with check (app.settings_write_ok(affiliate_code));
create policy settings_update on public.settings for update to authenticated
  using (app.settings_write_ok(affiliate_code)) with check (app.settings_write_ok(affiliate_code));
create policy settings_delete on public.settings for delete to authenticated
  using (app.settings_write_ok(affiliate_code));

-- An affiliate may override an organisation setting only where the organisation marked it overridable
-- (or set no organisation value at all). Group managers may set anything.
create or replace function app.guard_setting_override() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_group jsonb;
begin
  if app.is_owner_session() or app.has_perm('group.manage') or new.data->>'affiliateCode' = 'GROUP' then
    return new;
  end if;
  select s.data into v_group from public.settings s where s.id = 'GROUP:' || (new.data->>'key');
  if v_group is not null and coalesce((v_group->>'overridable')::boolean, false) = false then
    raise exception 'The organisation setting % is not overridable by an affiliate', new.data->>'key'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger settings_guard before insert or update on public.settings
  for each row execute function app.guard_setting_override();

-- ─── Grants ─────────────────────────────────────────────────────────────────

grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on public.onboarding, public.settings to authenticated;
revoke all on public.onboarding, public.settings from anon;

notify pgrst, 'reload schema';
