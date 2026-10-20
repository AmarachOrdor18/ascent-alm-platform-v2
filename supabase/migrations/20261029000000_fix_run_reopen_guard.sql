-- Reopening a signed-off run always failed with "invalid input syntax for type json": '-' binds tighter than
-- '->', so data->'signOff' - v_reopen_keys was read as data -> ('signOff' - v_reopen_keys). Bracketed below;
-- the rest of the guard is unchanged.
CREATE OR REPLACE FUNCTION app.guard_run_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
    if ((new.data->'signOff') - v_reopen_keys) is distinct from ((old.data->'signOff') - v_reopen_keys) then
      raise exception 'Reopening cannot change how the run was signed off' using errcode = '42501';
    end if;
    -- The display name comes from the user's own record, never from the client.
    new.data := jsonb_set(new.data, '{signOff,reopenedBy}', to_jsonb(app.me()->>'name'));
    return new;
  end if;
  raise exception 'Run % is % and frozen - it cannot be changed', new.id, case v_before when 'SignedOff' then 'signed off' else 'reopened' end using errcode = '42501';
end $function$;
