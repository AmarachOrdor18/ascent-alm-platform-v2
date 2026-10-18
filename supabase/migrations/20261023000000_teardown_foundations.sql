-- Ascent ALM - teardown fixes, part 1 (foundations). Hand-written; apply with
--   node scripts/apply-migration.cjs supabase/migrations/20261023000000_teardown_foundations.sql
--
-- 1. In-app notifications: public.notifications (one row per recipient). Users read and mark their own;
--    rows are only ever created by the security-definer fan-out app.notify(), reached from the browser
--    through public.send_notification(), and by triggers (approval decided -> requester; affiliate Live).
-- 2. Six standard sources per affiliate (Loans, Deposits, Treasury, General ledger, Balance history,
--    Account history) - created where missing and switched back on; the single "Positions" source is
--    switched off (its loads stay readable in history).
-- 3. Column mappings may be saved by anyone who uploads for that affiliate (data.upload).
-- 4. Organisation setting marketData.slaDays (default 30): market data older than this is flagged stale.

-- ─── 1. Notifications ───────────────────────────────────────────────────────

create table if not exists public.notifications (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id text generated always as ((data->>'userId')) stored,
  affiliate_code text generated always as ((data->>'affiliateCode')) stored,
  read boolean generated always as (coalesce((data->>'read')::boolean, false)) stored
);
create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);
do $$ begin
  alter table public.notifications add constraint notifications_id_matches_data check (data->>'id' = id);
exception when duplicate_object then null; end $$;
drop trigger if exists notifications_touch on public.notifications;
create trigger notifications_touch before update on public.notifications for each row execute function app.touch_updated_at();
alter table public.notifications enable row level security;

drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = app.me()->>'id');
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = app.me()->>'id') with check (user_id = app.me()->>'id');
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = app.me()->>'id');
-- No insert policy: rows are created only by the security-definer functions below.

-- Only the read flag of one's own notification may change.
create or replace function app.guard_notification_update() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_owner_session() then
    return new;
  end if;
  if (new.data - 'read') is distinct from (old.data - 'read') then
    raise exception 'Only the read flag of a notification can change' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications
  for each row execute function app.guard_notification_update();

create or replace function app.notification_row(p_user_id text, p_affiliate_code text, p_kind text, p_title text, p_body text, p_link text)
returns jsonb language sql volatile as $$
  select jsonb_build_object(
    'id', 'NT-' || replace(gen_random_uuid()::text, '-', ''),
    'userId', p_user_id,
    'affiliateCode', p_affiliate_code,
    'kind', coalesce(p_kind, 'info'),
    'title', coalesce(p_title, ''),
    'body', coalesce(p_body, ''),
    'link', p_link,
    'read', false,
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

-- Fan-out with no caller checks - used by triggers and by app.notify.
--   p_affiliate_code null    -> every active user
--   p_affiliate_code 'GROUP' -> Group-level users (scoped to GROUP, or holding group.manage)
--   an affiliate code        -> that affiliate's users, plus Group-level users when p_group_users
create or replace function app.notify_internal(p_affiliate_code text, p_kind text, p_title text, p_body text, p_link text,
                                               p_group_users boolean default true, p_exclude_user text default null)
returns integer language plpgsql security definer set search_path = public, app as $$
declare
  v_count integer := 0;
  v_user record;
  v_row jsonb;
begin
  for v_user in
    select u.id, u.data->>'affiliateCode' as aff,
           coalesce(r.data->'permissions' ? 'group.manage', false) as group_manager
      from public.app_users u
      left join public.roles r on r.code = u.data->>'role'
     where coalesce((u.data->>'isActive')::boolean, true)
  loop
    continue when p_exclude_user is not null and v_user.id = p_exclude_user;
    if p_affiliate_code is null
       or (p_affiliate_code = 'GROUP' and (v_user.aff = 'GROUP' or v_user.group_manager))
       or (p_affiliate_code <> 'GROUP' and (v_user.aff = p_affiliate_code
                                            or (p_group_users and (v_user.aff = 'GROUP' or v_user.group_manager)))) then
      v_row := app.notification_row(v_user.id, p_affiliate_code, p_kind, p_title, p_body, p_link);
      insert into public.notifications (id, data) values (v_row->>'id', v_row);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- Called by the app (through public.send_notification): any signed-in user with access to that scope may
-- tell the users of that scope that something happened. The caller is never notified of their own action.
create or replace function app.notify(p_affiliate_code text, p_kind text, p_title text, p_body text, p_link text,
                                      p_group_users boolean default true)
returns integer language plpgsql security definer set search_path = public, app as $$
begin
  if app.me() is null or not app.has_perm('dashboard.view') then
    raise exception 'Not permitted: sign in to send notifications' using errcode = '42501';
  end if;
  if not app.affiliate_ok(p_affiliate_code) then
    raise exception 'Not permitted: no access to %', p_affiliate_code using errcode = '42501';
  end if;
  return app.notify_internal(p_affiliate_code, p_kind, left(p_title, 200), left(p_body, 2000), p_link, p_group_users, app.me()->>'id');
end $$;

create or replace function public.send_notification(p_affiliate_code text, p_kind text, p_title text, p_body text, p_link text,
                                                    p_group_users boolean default true)
returns integer language sql volatile as $$
  select app.notify(p_affiliate_code, p_kind, p_title, p_body, p_link, p_group_users)
$$;
revoke all on function public.send_notification(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.send_notification(text, text, text, text, text, boolean) to authenticated;

-- A decision on a request tells whoever raised it (rule approved/rejected, run sign-off decided, ...).
create or replace function app.notify_on_decision() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_what text;
  v_link text;
  v_row jsonb;
begin
  if old.data->>'status' is distinct from 'Pending'
     or new.data->>'status' not in ('Approved', 'Rejected')
     or coalesce(new.data->>'requestedById', '') = '' then
    return new;
  end if;
  v_what := case new.data->>'module'
              when 'Runs' then 'Run sign-off'
              when 'Business Rules' then 'Rule change'
              when 'Affiliates' then 'Affiliate request'
              else 'Request' end;
  v_link := case when new.data->>'module' = 'Runs' then '/execution/history?run=' || (new.data->>'entityId')
                 else '/controls?request=' || new.id end;
  v_row := app.notification_row(
    new.data->>'requestedById',
    new.data->>'affiliateCode',
    'approval.' || lower(new.data->>'status'),
    v_what || ' ' || lower(new.data->>'status') || ': ' || coalesce(new.data->>'entityLabel', ''),
    coalesce(new.data->>'decidedBy', 'An approver') || ' ' || lower(new.data->>'status') || ' it'
      || coalesce('. Reason: ' || nullif(new.data->>'decisionNote', ''), '.'),
    v_link);
  insert into public.notifications (id, data) values (v_row->>'id', v_row);
  return new;
end $$;
drop trigger if exists approvals_notify on public.approvals;
create trigger approvals_notify after update on public.approvals
  for each row execute function app.notify_on_decision();

-- An affiliate going Live tells its users and Group.
create or replace function app.notify_on_live() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.data->>'status' = 'Live' and old.data->>'status' is distinct from 'Live' then
    perform app.notify_internal(new.code, 'affiliate.live', (new.data->>'name') || ' is Live',
      'Runs, results and reports can now be produced for ' || (new.data->>'name') || '.', '/dashboard', true, null);
  end if;
  return new;
end $$;
drop trigger if exists affiliates_notify_live on public.affiliates;
create trigger affiliates_notify_live after update on public.affiliates
  for each row execute function app.notify_on_live();

grant select, update, delete on public.notifications to authenticated;
revoke all on public.notifications from anon;

-- ─── 2. Six standard sources per affiliate ─────────────────────────────────

with spec(slug, body) as (values
  ('LOANS', '{"id":"DS-__AFF__-LOANS","affiliateCode":"__AFF__","name":"Loans","domain":"Positions","contributor":"Loans","connectorType":"ManualUpload","connectorId":null,"owner":"Loans team","frequency":"Monthly","fields":[{"name":"id","type":"Text","required":true,"key":true,"aliases":["position id","record id","deal id","contract id"]},{"name":"accountNumber","type":"Text","required":false,"aliases":["account no","acct no","acct number","account"]},{"name":"accountClass","type":"Text","required":false,"aliases":[]},{"name":"branchCode","type":"Text","required":false,"aliases":[]},{"name":"category","type":"Text","required":true,"aliases":["asset liability","side","bs category"]},{"name":"productClass","type":"Text","required":false,"aliases":["product","product name","product type"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"amount","type":"Number","required":true,"aliases":["balance","outstanding balance","outstanding","principal outstanding"]},{"name":"legalEntityCode","type":"Text","required":false,"aliases":[]},{"name":"orgUnitCode","type":"Text","required":false,"aliases":["branch unit","business unit","cost centre","cost center"]},{"name":"glAccountCode","type":"Text","required":false,"aliases":["gl code","gl account","gl","ledger code"]},{"name":"commonCoaCode","type":"Text","required":false,"aliases":[]},{"name":"notes","type":"Text","required":false,"aliases":[]},{"name":"counterpartyId","type":"Text","required":false,"aliases":["customer id","cif","customer number","counterparty"]},{"name":"originationDate","type":"Date","required":false,"aliases":[]},{"name":"maturityDate","type":"Date","required":false,"aliases":["maturity","end date"]},{"name":"nextRepricingDate","type":"Date","required":false,"aliases":[]},{"name":"rateType","type":"Text","required":false,"aliases":[]},{"name":"interestRatePct","type":"Number","required":false,"aliases":["interest rate","rate"]},{"name":"rateIndexCode","type":"Text","required":false,"aliases":[]},{"name":"spreadOverIndexBps","type":"Number","required":false,"aliases":[]},{"name":"amortizationType","type":"Text","required":false,"aliases":[]},{"name":"paymentFrequencyMonths","type":"Number","required":false,"aliases":[]},{"name":"performingStatus","type":"Text","required":false,"aliases":[]},{"name":"daysPastDue","type":"Number","required":false,"aliases":[]},{"name":"provisionAmount","type":"Number","required":false,"aliases":[]},{"name":"lienAmount","type":"Number","required":false,"aliases":[]},{"name":"lienReason","type":"Text","required":false,"aliases":[]},{"name":"behaviouralTag","type":"Text","required":false,"aliases":[]},{"name":"monthlyCredit","type":"Number","required":false,"aliases":[]},{"name":"monthlyDebit","type":"Number","required":false,"aliases":[]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}'),
  ('DEPOSITS', '{"id":"DS-__AFF__-DEPOSITS","affiliateCode":"__AFF__","name":"Deposits","domain":"Positions","contributor":"Deposits","connectorType":"ManualUpload","connectorId":null,"owner":"Deposits team","frequency":"Monthly","fields":[{"name":"id","type":"Text","required":true,"key":true,"aliases":["position id","record id","deal id","contract id"]},{"name":"accountNumber","type":"Text","required":false,"aliases":["account no","acct no","acct number","account"]},{"name":"accountClass","type":"Text","required":false,"aliases":[]},{"name":"branchCode","type":"Text","required":false,"aliases":[]},{"name":"category","type":"Text","required":true,"aliases":["asset liability","side","bs category"]},{"name":"productClass","type":"Text","required":false,"aliases":["product","product name","product type"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"amount","type":"Number","required":true,"aliases":["balance","outstanding balance","outstanding","principal outstanding"]},{"name":"legalEntityCode","type":"Text","required":false,"aliases":[]},{"name":"orgUnitCode","type":"Text","required":false,"aliases":["branch unit","business unit","cost centre","cost center"]},{"name":"glAccountCode","type":"Text","required":false,"aliases":["gl code","gl account","gl","ledger code"]},{"name":"commonCoaCode","type":"Text","required":false,"aliases":[]},{"name":"notes","type":"Text","required":false,"aliases":[]},{"name":"counterpartyId","type":"Text","required":false,"aliases":["customer id","cif","customer number","counterparty"]},{"name":"originationDate","type":"Date","required":false,"aliases":[]},{"name":"maturityDate","type":"Date","required":false,"aliases":["maturity","end date"]},{"name":"nextRepricingDate","type":"Date","required":false,"aliases":[]},{"name":"rateType","type":"Text","required":false,"aliases":[]},{"name":"interestRatePct","type":"Number","required":false,"aliases":["interest rate","rate"]},{"name":"rateIndexCode","type":"Text","required":false,"aliases":[]},{"name":"spreadOverIndexBps","type":"Number","required":false,"aliases":[]},{"name":"amortizationType","type":"Text","required":false,"aliases":[]},{"name":"paymentFrequencyMonths","type":"Number","required":false,"aliases":[]},{"name":"performingStatus","type":"Text","required":false,"aliases":[]},{"name":"daysPastDue","type":"Number","required":false,"aliases":[]},{"name":"provisionAmount","type":"Number","required":false,"aliases":[]},{"name":"lienAmount","type":"Number","required":false,"aliases":[]},{"name":"lienReason","type":"Text","required":false,"aliases":[]},{"name":"behaviouralTag","type":"Text","required":false,"aliases":[]},{"name":"monthlyCredit","type":"Number","required":false,"aliases":[]},{"name":"monthlyDebit","type":"Number","required":false,"aliases":[]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}'),
  ('TREASURY', '{"id":"DS-__AFF__-TREASURY","affiliateCode":"__AFF__","name":"Treasury","domain":"Positions","contributor":"Treasury","connectorType":"ManualUpload","connectorId":null,"owner":"Treasury team","frequency":"Monthly","fields":[{"name":"id","type":"Text","required":true,"key":true,"aliases":["position id","record id","deal id","contract id"]},{"name":"accountNumber","type":"Text","required":false,"aliases":["account no","acct no","acct number","account"]},{"name":"accountClass","type":"Text","required":false,"aliases":[]},{"name":"branchCode","type":"Text","required":false,"aliases":[]},{"name":"category","type":"Text","required":true,"aliases":["asset liability","side","bs category"]},{"name":"productClass","type":"Text","required":false,"aliases":["product","product name","product type"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"amount","type":"Number","required":true,"aliases":["balance","outstanding balance","outstanding","principal outstanding"]},{"name":"legalEntityCode","type":"Text","required":false,"aliases":[]},{"name":"orgUnitCode","type":"Text","required":false,"aliases":["branch unit","business unit","cost centre","cost center"]},{"name":"glAccountCode","type":"Text","required":false,"aliases":["gl code","gl account","gl","ledger code"]},{"name":"commonCoaCode","type":"Text","required":false,"aliases":[]},{"name":"notes","type":"Text","required":false,"aliases":[]},{"name":"counterpartyId","type":"Text","required":false,"aliases":["customer id","cif","customer number","counterparty"]},{"name":"originationDate","type":"Date","required":false,"aliases":[]},{"name":"maturityDate","type":"Date","required":false,"aliases":["maturity","end date"]},{"name":"nextRepricingDate","type":"Date","required":false,"aliases":[]},{"name":"rateType","type":"Text","required":false,"aliases":[]},{"name":"interestRatePct","type":"Number","required":false,"aliases":["interest rate","rate"]},{"name":"rateIndexCode","type":"Text","required":false,"aliases":[]},{"name":"spreadOverIndexBps","type":"Number","required":false,"aliases":[]},{"name":"amortizationType","type":"Text","required":false,"aliases":[]},{"name":"paymentFrequencyMonths","type":"Number","required":false,"aliases":[]},{"name":"performingStatus","type":"Text","required":false,"aliases":[]},{"name":"daysPastDue","type":"Number","required":false,"aliases":[]},{"name":"provisionAmount","type":"Number","required":false,"aliases":[]},{"name":"lienAmount","type":"Number","required":false,"aliases":[]},{"name":"lienReason","type":"Text","required":false,"aliases":[]},{"name":"behaviouralTag","type":"Text","required":false,"aliases":[]},{"name":"monthlyCredit","type":"Number","required":false,"aliases":[]},{"name":"monthlyDebit","type":"Number","required":false,"aliases":[]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}'),
  ('GL', '{"id":"DS-__AFF__-GL","affiliateCode":"__AFF__","name":"General ledger","domain":"GeneralLedger","connectorType":"ManualUpload","connectorId":null,"owner":"Finance","frequency":"Monthly","fields":[{"name":"glAccountCode","type":"Text","required":true,"key":true,"aliases":["gl code","gl account","gl","ledger code"]},{"name":"orgUnitCode","type":"Text","required":false,"key":true,"aliases":["branch unit","business unit","cost centre","cost center"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"endingBalance","type":"Number","required":true,"aliases":["closing balance","balance","ending bal"]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}'),
  ('BALHIST', '{"id":"DS-__AFF__-BALHIST","affiliateCode":"__AFF__","name":"Balance history","domain":"BalanceHistory","connectorType":"ManualUpload","connectorId":null,"owner":"ALM team","frequency":"Monthly","fields":[{"name":"affiliateCode","type":"Text","required":false,"aliases":[]},{"name":"asOfDate","type":"Date","required":true,"key":true,"aliases":["as at","as of","as at date","business date","report date","value date"]},{"name":"productCode","type":"Text","required":true,"key":true,"aliases":[]},{"name":"customerType","type":"Text","required":false,"key":true,"aliases":[]},{"name":"currency","type":"Text","required":true,"key":true,"aliases":["ccy","currency code"]},{"name":"tenorBand","type":"Text","required":false,"key":true,"aliases":[]},{"name":"balance","type":"Number","required":true,"aliases":["closing balance","outstanding balance"]},{"name":"ratePercent","type":"Number","required":false,"aliases":["yield","rate pct","rate percent"]},{"name":"accountCount","type":"Number","required":false,"aliases":[]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}'),
  ('ACCTHIST', '{"id":"DS-__AFF__-ACCTHIST","affiliateCode":"__AFF__","name":"Account history","domain":"AccountHistory","connectorType":"ManualUpload","connectorId":null,"owner":"ALM team","frequency":"Monthly","fields":[{"name":"affiliateCode","type":"Text","required":false,"aliases":[]},{"name":"accountNumber","type":"Text","required":true,"key":true,"aliases":["account no","acct no","acct number","account"]},{"name":"asOfDate","type":"Date","required":true,"key":true,"aliases":["as at","as of","as at date","business date","report date","value date"]},{"name":"productCode","type":"Text","required":true,"aliases":[]},{"name":"currency","type":"Text","required":true,"aliases":["ccy","currency code"]},{"name":"balance","type":"Number","required":true,"aliases":["closing balance","outstanding balance"]},{"name":"maturityDate","type":"Date","required":false,"aliases":["maturity","end date"]},{"name":"scheduledBalance","type":"Number","required":false,"aliases":[]},{"name":"rolledOver","type":"YesNo","required":false,"aliases":[]},{"name":"withdrawnEarly","type":"YesNo","required":false,"aliases":[]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-23T00:00:00.000Z","createdBy":"migration"}')
)
insert into public.data_sources (id, data)
select 'DS-' || a.code || '-' || spec.slug, replace(spec.body, '__AFF__', a.code)::jsonb
  from public.affiliates a cross join spec
 where a.code <> 'GROUP'
on conflict (id) do nothing;

update public.data_sources
   set data = data || '{"isActive": true}'::jsonb
 where affiliate_code <> 'GROUP'
   and id ~ '^DS-.+-(LOANS|DEPOSITS|TREASURY|GL|BALHIST|ACCTHIST)$'
   and coalesce((data->>'isActive')::boolean, true) = false;

-- The single whole-book source is replaced by the three contributor sources; its loads stay in history.
update public.data_sources
   set data = data || '{"isActive": false}'::jsonb
 where affiliate_code <> 'GROUP'
   and id ~ '^DS-.+-POSITIONS$';

-- ─── 3. Column mapping by uploaders ────────────────────────────────────────

drop policy if exists data_sources_update on public.data_sources;
create policy data_sources_update on public.data_sources for update to authenticated
  using (app.affiliate_write_ok(affiliate_code) and app.has_any_perm(array['data.configure', 'data.upload', 'group.manage', 'affiliate.manage']))
  with check (app.affiliate_write_ok(affiliate_code) and app.has_any_perm(array['data.configure', 'data.upload', 'group.manage', 'affiliate.manage']));

-- ─── 4. Market data freshness SLA ──────────────────────────────────────────

insert into public.settings (id, data) values
  ('GROUP:marketData.slaDays', '{"id":"GROUP:marketData.slaDays","affiliateCode":"GROUP","key":"marketData.slaDays","value":30,"overridable":false,"updatedBy":"migration","updatedAt":"2026-10-23T00:00:00.000Z"}'::jsonb)
on conflict (id) do nothing;

grant execute on all functions in schema app to authenticated;
notify pgrst, 'reload schema';
