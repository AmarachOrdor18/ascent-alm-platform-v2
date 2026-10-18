-- Saves are upserts (INSERT ... ON CONFLICT DO UPDATE), and Postgres runs BEFORE INSERT triggers before it
-- detects the conflict. The Live guard read every upsert as a brand-new row going Live, so saving an
-- affiliate that was already Live - the GROUP organisation row in onboarding step 1 - was refused.
-- An INSERT now counts as "going Live" only when no Live row with that code exists yet.

create or replace function app.guard_affiliate_write() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_activating boolean := coalesce(current_setting('app.activating', true), '') = new.code;
  v_already_live boolean;
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

  if tg_op = 'INSERT' then
    select coalesce(a.data->>'status' = 'Live', false) into v_already_live
      from public.affiliates a where a.code = new.code;
  else
    v_already_live := old.data->>'status' = 'Live';
  end if;

  if new.data->>'status' = 'Live' and not coalesce(v_already_live, false) and not v_activating then
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

-- The same upsert is checked against the INSERT policy too, so an Affiliate Admin saving their own
-- (already existing) affiliate was refused. They may write their own row; the trigger above still limits
-- which fields change.
drop policy if exists affiliates_insert on public.affiliates;
create policy affiliates_insert on public.affiliates for insert to authenticated
  with check (app.has_perm('group.manage') or (app.has_perm('affiliate.manage') and code = app.me()->>'affiliateCode'));
