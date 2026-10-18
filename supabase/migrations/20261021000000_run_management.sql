-- Ascent ALM - Run management: run series, versions and sign-off. Hand-written, applied on top of
-- 20261020000000_data_sources.sql.
--
--   A run "series" is one scope (affiliate, or GROUP) at one as-of date; each execution within it is a
--   version (v1, v2, ...). A version moves Open -> PendingSignOff -> SignedOff through a Runs/SignOff
--   approval request decided by someone else, and a signed-off version may be Reopened with a reason.
--   Signed-off and reopened versions - and their results - are frozen.
--
--   A. Generated columns on runs: series_key, version, sign_off_status.
--   B. approvals AFTER UPDATE: a decided Runs/SignOff request moves the run (SignedOff, or back to Open).
--   C. runs BEFORE INSERT/UPDATE/DELETE guard: frozen versions; sign-off only through B; reopen rules.
--   D. run_results BEFORE INSERT/UPDATE/DELETE guard: refuse when the run is SignedOff/Reopened.
-- The local (IndexedDB) repository mirrors B-D (src/lib/runSeries.ts runUpdateRefusal, localRepository.ts).

-- ─── A. Generated columns ───────────────────────────────────────────────────

alter table public.runs add column if not exists series_key text
  generated always as (coalesce(data->>'seriesKey', (data->>'affiliateCode') || '|' || (data->>'asOfDate'))) stored;
alter table public.runs add column if not exists version integer
  generated always as (coalesce((data->>'version')::integer, 1)) stored;
alter table public.runs add column if not exists sign_off_status text
  generated always as (coalesce(data->'signOff'->>'status', 'Open')) stored;
create index if not exists runs_series_key_idx on public.runs (series_key);
create index if not exists runs_sign_off_status_idx on public.runs (sign_off_status);

-- ─── B. Sign-off through approval only ──────────────────────────────────────

-- The transaction-local flag app.signing_off (= the run id) tells the runs guard that this change is the
-- sanctioned one, the same pattern as app.activating for affiliates.
create or replace function app.apply_run_sign_off() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_run record;
  v_now text := coalesce(new.data->>'decidedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
begin
  if new.data->>'module' is distinct from 'Runs'
     or new.data->>'action' is distinct from 'SignOff'
     or old.data->>'status' is distinct from 'Pending'
     or new.data->>'status' = 'Pending' then
    return new;
  end if;

  select r.id, r.data into v_run from public.runs r where r.id = new.data->>'entityId';
  if not found or coalesce(v_run.data->'signOff'->>'status', 'Open') <> 'PendingSignOff' then
    return new;
  end if;

  if new.data->>'status' = 'Approved' then
    -- Maker-checker on the run itself: whoever executed it cannot sign it off.
    if v_run.data->>'createdById' is not null and v_run.data->>'createdById' = new.data->>'decidedById' then
      raise exception 'Segregation of duties: whoever executed a run cannot also sign it off' using errcode = '42501';
    end if;
    perform set_config('app.signing_off', v_run.id, true);
    update public.runs
       set data = jsonb_set(data, '{signOff}', coalesce(data->'signOff', '{}'::jsonb) || jsonb_build_object(
             'status', 'SignedOff',
             'approvalId', new.id,
             'signedOffAt', v_now,
             'signedOffBy', new.data->>'decidedBy',
             'signedOffById', new.data->>'decidedById'))
     where id = v_run.id;
    perform set_config('app.signing_off', '', true);
  elsif new.data->>'status' in ('Rejected', 'Withdrawn') then
    perform set_config('app.signing_off', v_run.id, true);
    update public.runs
       set data = jsonb_set(data, '{signOff}', coalesce(data->'signOff', '{}'::jsonb) || jsonb_build_object(
             'status', 'Open',
             'rejectedAt', v_now,
             'rejectedBy', coalesce(new.data->>'decidedBy', new.data->>'requestedBy'),
             'rejectReason', coalesce(new.data->>'decisionNote',
                                      case when new.data->>'status' = 'Withdrawn' then 'Request withdrawn' end)))
     where id = v_run.id;
    perform set_config('app.signing_off', '', true);
  end if;
  return new;
end $$;

drop trigger if exists approvals_run_sign_off on public.approvals;
create trigger approvals_run_sign_off after update on public.approvals
  for each row execute function app.apply_run_sign_off();

-- ─── C. Runs guard ──────────────────────────────────────────────────────────

create or replace function app.guard_run_write() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_flag boolean;
  v_before text;
  v_after text;
  v_reopen_keys text[] := array['status', 'reopenedAt', 'reopenedById', 'reopenedBy', 'reopenReason'];
begin
  if app.is_owner_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.data->'signOff'->>'status', 'Open') in ('SignedOff', 'Reopened', 'PendingSignOff') then
      raise exception 'Run % is %: signed-off, reopened and pending versions cannot be deleted',
        old.id, coalesce(old.data->'signOff'->>'status', 'Open') using errcode = '42501';
    end if;
    return old;
  end if;

  v_after := coalesce(new.data->'signOff'->>'status', 'Open');

  if tg_op = 'INSERT' then
    -- An upsert of an existing row fires this first; the UPDATE branch below then judges the change.
    if exists (select 1 from public.runs r where r.id = new.id) then
      return new;
    end if;
    if v_after in ('SignedOff', 'Reopened') then
      raise exception 'A run can only be signed off through an approved sign-off request' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  v_flag := coalesce(current_setting('app.signing_off', true), '') = new.id;
  if v_flag then
    return new;
  end if;
  v_before := coalesce(old.data->'signOff'->>'status', 'Open');

  if v_after = 'SignedOff' and v_before <> 'SignedOff' then
    raise exception 'A run can only be signed off through an approved sign-off request' using errcode = '42501';
  end if;
  if v_before = 'PendingSignOff' and v_after <> 'PendingSignOff' then
    raise exception 'Run % is awaiting sign-off - the request must be approved, rejected or withdrawn in Approvals', new.id
      using errcode = '42501';
  end if;
  if v_after = 'Reopened' and v_before not in ('Reopened', 'SignedOff') then
    raise exception 'Only a signed-off version can be reopened' using errcode = '42501';
  end if;
  if v_before not in ('SignedOff', 'Reopened') then
    return new;
  end if;

  -- Frozen version: nothing but the reopen transition and recording its successor may change.
  if (new.data - 'signOff' - 'supersededByRunId') is distinct from (old.data - 'signOff' - 'supersededByRunId') then
    raise exception 'Run % is % and frozen - it cannot be changed', new.id, case v_before when 'SignedOff' then 'signed off' else 'reopened' end using errcode = '42501';
  end if;
  if new.data->'supersededByRunId' is distinct from old.data->'supersededByRunId'
     and coalesce(old.data->>'supersededByRunId', '') <> '' then
    raise exception 'Run % already records the version that superseded it', new.id using errcode = '42501';
  end if;
  if new.data->'signOff' is not distinct from old.data->'signOff' then
    return new;
  end if;
  if v_before = 'SignedOff' and v_after = 'Reopened' then
    if not app.has_perm('run.execute') or not app.affiliate_write_ok(old.affiliate_code) then
      raise exception 'Reopening a run needs run.execute for its scope' using errcode = '42501';
    end if;
    if coalesce(btrim(new.data->'signOff'->>'reopenReason'), '') = '' then
      raise exception 'Reopening a signed-off run needs a reason' using errcode = '42501';
    end if;
    if new.data->'signOff'->>'reopenedById' is distinct from app.me()->>'id' then
      raise exception 'A reopen must be recorded under the reopening user''s own id' using errcode = '42501';
    end if;
    if (new.data->'signOff' - v_reopen_keys) is distinct from (old.data->'signOff' - v_reopen_keys) then
      raise exception 'Reopening cannot change how the run was signed off' using errcode = '42501';
    end if;
    -- The display name comes from the user's own record, never from the client.
    new.data := jsonb_set(new.data, '{signOff,reopenedBy}', to_jsonb(app.me()->>'name'));
    return new;
  end if;
  raise exception 'Run % is % and frozen - it cannot be changed', new.id, case v_before when 'SignedOff' then 'signed off' else 'reopened' end using errcode = '42501';
end $$;

drop trigger if exists runs_guard on public.runs;
create trigger runs_guard before insert or update or delete on public.runs
  for each row execute function app.guard_run_write();

-- ─── D. Run results guard ───────────────────────────────────────────────────

create or replace function app.guard_run_result_write() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_run_id text := case when tg_op = 'DELETE' then old.data->>'runId' else new.data->>'runId' end;
  v_status text;
begin
  if app.is_owner_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select coalesce(r.data->'signOff'->>'status', 'Open') into v_status from public.runs r where r.id = v_run_id;
  if v_status in ('SignedOff', 'Reopened') then
    raise exception 'Run % is % - its results are frozen', v_run_id, case v_status when 'SignedOff' then 'signed off' else 'reopened' end using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.data->>'runId' is distinct from new.data->>'runId' then
    select coalesce(r.data->'signOff'->>'status', 'Open') into v_status from public.runs r where r.id = old.data->>'runId';
    if v_status in ('SignedOff', 'Reopened') then
      raise exception 'Run % is % - its results are frozen', old.data->>'runId', case v_status when 'SignedOff' then 'signed off' else 'reopened' end using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists run_results_guard on public.run_results;
create trigger run_results_guard before insert or update or delete on public.run_results
  for each row execute function app.guard_run_result_write();

grant execute on all functions in schema app to authenticated;

notify pgrst, 'reload schema';
