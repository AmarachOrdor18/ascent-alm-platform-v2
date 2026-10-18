-- Ascent ALM - simpler data sources and upload rights. Hand-written; apply with
--   node scripts/apply-migration.cjs supabase/migrations/20261022000000_data_sources_simplify.sql
--
-- 1. Two sources per affiliate: one "Positions" source for the whole book (any department; a department
--    column is optional) and the "General ledger". The older per-department positions, counterparties and
--    history sources are switched off (kept, with their loads, for the record). Counterparties are read from
--    the positions file; behavioural history is uploaded from Data -> History for models.
-- 2. One Group "Market data" source (one file or workbook with FX rates, yield curves and policy rates);
--    the separate FX / curves / indicators sources are switched off.
-- 3. Only the Organisation Admin (group.manage) adds data sources. Editing an existing one is unchanged.
-- 4. New permission data.upload: ALM Analysts (and both admin roles) may upload, admit, reject and withdraw
--    files for their own affiliate. Approver and Viewer stay read-only. Affiliates never write market data
--    (unchanged: market-data tables stay Group-only).

-- ─── 4. data.upload on the roles that load data ─────────────────────────────

update public.roles
   set data = jsonb_set(data, '{permissions}', (data->'permissions') || '["data.upload"]'::jsonb)
 where code in ('ADMIN', 'AFFILIATE_ADMIN', 'RISK_ANALYST')
   and not (data->'permissions' ? 'data.upload');

-- Every write policy on the data-loading tables that accepts data.configure now also accepts data.upload.
do $$
declare
  p record;
  q text;
  wc text;
  stmt text;
begin
  for p in
    select * from pg_policies
     where schemaname = 'public'
       and tablename = any (array['positions', 'batches', 'staged_batches', 'balance_history', 'account_history',
                                  'dimension_members', 'fx_rates', 'yield_curves', 'economic_indicators'])
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
       and coalesce(qual, '') || coalesce(with_check, '') like '%data.configure%'
       and coalesce(qual, '') || coalesce(with_check, '') not like '%data.upload%'
  loop
    q := replace(p.qual, 'ARRAY[''data.configure''::text', 'ARRAY[''data.upload''::text, ''data.configure''::text');
    wc := replace(p.with_check, 'ARRAY[''data.configure''::text', 'ARRAY[''data.upload''::text, ''data.configure''::text');
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    stmt := format('create policy %I on public.%I for %s to authenticated', p.policyname, p.tablename, lower(p.cmd));
    if q is not null then stmt := stmt || ' using (' || q || ')'; end if;
    if wc is not null then stmt := stmt || ' with check (' || wc || ')'; end if;
    execute stmt;
  end loop;
end $$;

-- ─── 3. Only the Organisation Admin adds sources ────────────────────────────

drop policy if exists data_sources_insert on public.data_sources;
create policy data_sources_insert on public.data_sources for insert to authenticated
  with check (app.affiliate_write_ok(affiliate_code) and app.has_perm('group.manage'));

-- ─── 2. Group market data: one source ───────────────────────────────────────

insert into public.data_sources (id, data) values
  ('DS-GROUP-MARKET', '{"id":"DS-GROUP-MARKET","affiliateCode":"GROUP","name":"Market data","domain":"MarketData","connectorType":"ManualUpload","connectorId":null,"owner":"Group Treasury","frequency":"Monthly","fields":[{"name":"dataType","type":"Text","required":false,"aliases":["type","data type","kind","sheet"]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]},{"name":"base","type":"Text","required":false,"aliases":["base currency","from currency","from"]},{"name":"quote","type":"Text","required":false,"aliases":["quote currency","to currency","to"]},{"name":"rate","type":"Number","required":false,"aliases":["fx rate","mid rate","exchange rate"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"curveCode","type":"Text","required":false,"aliases":["curve","curve name","index"]},{"name":"tenorDays","type":"Number","required":false,"aliases":["tenor","term days","days"]},{"name":"ratePercent","type":"Number","required":false,"aliases":["yield","rate pct","rate percent"]},{"name":"indicatorCode","type":"Text","required":false,"aliases":["indicator","series","series code"]},{"name":"countryCode","type":"Text","required":false,"aliases":["country"]},{"name":"value","type":"Number","required":false,"aliases":["observation","reading"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-22T00:00:00.000Z","createdBy":"migration"}'::jsonb)
on conflict (id) do nothing;

update public.data_sources
   set data = data || '{"isActive": false}'::jsonb
 where id in ('DS-GROUP-FX', 'DS-GROUP-CURVES', 'DS-GROUP-INDICATORS');

-- ─── 1. Affiliates: positions (whole book) + general ledger ────────────────

insert into public.data_sources (id, data)
select 'DS-' || a.code || '-POSITIONS', replace('{"id":"DS-__AFF__-POSITIONS","affiliateCode":"__AFF__","name":"Positions","domain":"Positions","connectorType":"ManualUpload","connectorId":null,"owner":"ALM team","frequency":"Monthly","fields":[{"name":"id","type":"Text","required":true,"key":true,"aliases":["position id","record id","deal id","contract id"]},{"name":"accountNumber","type":"Text","required":false,"aliases":["account no","acct no","acct number","account"]},{"name":"accountClass","type":"Text","required":false,"aliases":[]},{"name":"branchCode","type":"Text","required":false,"aliases":[]},{"name":"category","type":"Text","required":true,"aliases":["asset liability","side","bs category"]},{"name":"productClass","type":"Text","required":false,"aliases":["product","product name","product type"]},{"name":"currency","type":"Text","required":false,"aliases":["ccy","currency code"]},{"name":"amount","type":"Number","required":true,"aliases":["balance","outstanding balance","outstanding","principal outstanding"]},{"name":"legalEntityCode","type":"Text","required":false,"aliases":[]},{"name":"orgUnitCode","type":"Text","required":false,"aliases":["branch unit","business unit","cost centre","cost center"]},{"name":"glAccountCode","type":"Text","required":false,"aliases":["gl code","gl account","gl","ledger code"]},{"name":"commonCoaCode","type":"Text","required":false,"aliases":[]},{"name":"notes","type":"Text","required":false,"aliases":[]},{"name":"counterpartyId","type":"Text","required":false,"aliases":["customer id","cif","customer number","counterparty"]},{"name":"originationDate","type":"Date","required":false,"aliases":[]},{"name":"maturityDate","type":"Date","required":false,"aliases":["maturity","end date"]},{"name":"nextRepricingDate","type":"Date","required":false,"aliases":[]},{"name":"rateType","type":"Text","required":false,"aliases":[]},{"name":"interestRatePct","type":"Number","required":false,"aliases":["interest rate","rate"]},{"name":"rateIndexCode","type":"Text","required":false,"aliases":[]},{"name":"spreadOverIndexBps","type":"Number","required":false,"aliases":[]},{"name":"amortizationType","type":"Text","required":false,"aliases":[]},{"name":"paymentFrequencyMonths","type":"Number","required":false,"aliases":[]},{"name":"performingStatus","type":"Text","required":false,"aliases":[]},{"name":"daysPastDue","type":"Number","required":false,"aliases":[]},{"name":"provisionAmount","type":"Number","required":false,"aliases":[]},{"name":"lienAmount","type":"Number","required":false,"aliases":[]},{"name":"lienReason","type":"Text","required":false,"aliases":[]},{"name":"behaviouralTag","type":"Text","required":false,"aliases":[]},{"name":"monthlyCredit","type":"Number","required":false,"aliases":[]},{"name":"monthlyDebit","type":"Number","required":false,"aliases":[]},{"name":"asOfDate","type":"Date","required":false,"aliases":["as at","as of","as at date","business date","report date","value date"]},{"name":"department","type":"Text","required":false,"aliases":["dept","contributor","business line"]}],"businessDateField":"asOfDate","autoAdmit":false,"isActive":true,"createdAt":"2026-10-22T00:00:00.000Z","createdBy":"migration"}', '__AFF__', a.code)::jsonb
  from public.affiliates a
 where a.code <> 'GROUP'
on conflict (id) do nothing;

update public.data_sources
   set data = data || '{"isActive": false}'::jsonb
 where affiliate_code <> 'GROUP'
   and id ~ '^DS-.+-(LOANS|DEPOSITS|TREASURY|CPTY|BALHIST|ACCTHIST)$';

-- Affiliates' own feed list: positions and general ledger only (market data is Group's).
update public.affiliates
   set data = jsonb_set(data, '{feeds}', coalesce((
         select jsonb_agg(f) from jsonb_array_elements(data->'feeds') f
          where f->>'domain' in ('Positions', 'GeneralLedger')), '[]'::jsonb))
 where code <> 'GROUP' and jsonb_typeof(data->'feeds') = 'array';

notify pgrst, 'reload schema';
