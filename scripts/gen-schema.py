"""Generates supabase/migrations/20261017000000_init.sql from one table list, so every table gets the
same shape: an id, the app's full record as `data jsonb`, indexed columns generated from that record,
and row-level security keyed to the signed-in user's role permissions and affiliate scope.

Run from the repo root:  python scripts/gen-schema.py
"""

T, B, I = 'text', 'boolean', 'integer'

# (table, (primary-key column, json field), [(column, json field, type)], affiliate column or None,
#  write permissions - None means the policies are hand-written in schema-footer.sql)
TABLES = [
    ('affiliates', ('code', 'code'), [('status', 'status', T), ('region', 'region', T), ('functional_currency', 'functionalCurrency', T)], 'code', ['group.manage']),
    ('dimension_members', ('id', 'id'), [('dimension', 'dimension', T), ('code', 'code', T), ('parent_code', 'parentCode', T), ('affiliate_code', 'affiliateCode', T)], 'affiliate_code', ['data.configure', 'admin.manage']),
    ('positions', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('as_of_date', 'asOfDate', T), ('batch_id', 'batchId', T), ('currency', 'currency', T), ('category', 'category', T), ('org_unit_code', 'orgUnitCode', T), ('product_code', 'productCode', T), ('counterparty_id', 'counterpartyId', T)], 'affiliate_code', ['data.configure']),
    ('batches', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('domain', 'domain', T), ('as_of_date', 'asOfDate', T), ('status', 'status', T)], 'affiliate_code', ['data.configure']),
    ('staged_batches', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('domain', 'domain', T), ('as_of_date', 'asOfDate', T)], 'affiliate_code', ['data.configure']),
    ('rules', ('id', 'id'), [('kind', 'kind', T), ('folder', 'folder', T), ('affiliate_code', 'affiliateCode', T), ('is_active', 'isActive', B), ('version', 'version', I)], 'affiliate_code', ['rules.edit', 'data.configure']),
    ('rule_history', ('id', 'id'), [('rule_id', 'ruleId', T), ('version', 'version', I)], None, ['rules.edit', 'data.configure']),
    ('runs', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('as_of_date', 'asOfDate', T), ('status', 'status', T), ('run_created_at', 'createdAt', T)], 'affiliate_code', ['run.execute']),
    ('run_results', ('id', 'id'), [('run_id', 'runId', T), ('element', 'element', T)], None, ['run.execute']),
    ('run_schedules', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('template_run_id', 'templateRunId', T), ('is_active', 'isActive', B)], 'affiliate_code', ['run.execute']),
    ('limit_configs', ('id', 'id'), [('metric_key', 'metricKey', T), ('affiliate_code', 'affiliateCode', T), ('is_active', 'isActive', B)], 'affiliate_code', ['limits.manage', 'run.execute', 'risk.configure']),
    ('temporary_limits', ('id', 'id'), [('limit_id', 'limitId', T), ('expires_on', 'expiresOn', T)], None, ['limits.manage', 'run.execute', 'risk.configure']),
    ('breach_notes', ('id', 'id'), [('breach_id', 'breachId', T), ('recorded_at', 'recordedAt', T)], None, ['limits.manage', 'run.execute', 'risk.configure']),
    ('connectors', ('id', 'id'), [('vendor', 'vendor', T), ('status', 'status', T), ('is_active', 'isActive', B)], None, ['data.configure', 'group.manage']),
    ('approvals', ('id', 'id'), [('status', 'status', T), ('module', 'module', T), ('affiliate_code', 'affiliateCode', T), ('requested_at', 'requestedAt', T), ('requested_by', 'requestedBy', T)], 'affiliate_code', None),
    ('remediation_issues', ('id', 'id'), [('stage', 'stage', T), ('severity', 'severity', T), ('affiliate_code', 'affiliateCode', T), ('raised_at', 'raisedAt', T)], 'affiliate_code', ['data.configure', 'risk.configure', 'limits.manage', 'run.execute']),
    ('notification_rules', ('id', 'id'), [('event', 'event', T), ('is_active', 'isActive', B), ('affiliate_code', 'affiliateCode', T)], 'affiliate_code', ['admin.manage']),
    ('risk_entries', ('id', 'id'), [('category', 'category', T), ('affiliate_code', 'affiliateCode', T)], 'affiliate_code', ['risk.configure']),
    ('alco_meetings', ('id', 'id'), [('status', 'status', T), ('scheduled_for', 'scheduledFor', T), ('affiliate_code', 'affiliateCode', T)], 'affiliate_code', ['reporting.generate', 'run.execute']),
    ('regulatory_returns', ('id', 'id'), [('regulator', 'regulator', T), ('affiliate_code', 'affiliateCode', T), ('status', 'status', T), ('due_date', 'dueDate', T)], 'affiliate_code', ['reporting.generate', 'run.execute']),
    ('report_packs', ('id', 'id'), [('kind', 'kind', T), ('affiliate_code', 'affiliateCode', T), ('status', 'status', T)], 'affiliate_code', ['reporting.generate', 'run.execute']),
    ('roles', ('code', 'code'), [], None, ['admin.manage']),
    ('audit_events', ('id', 'id'), [('module', 'module', T), ('user_id', 'userId', T), ('recorded_at', 'recordedAt', T)], None, None),
    ('yield_curves', ('id', 'id'), [('code', 'code', T), ('currency', 'currency', T), ('is_active', 'isActive', B)], None, ['data.configure', 'rules.edit']),
    ('currencies', ('code', 'code'), [('role', 'role', T), ('is_active', 'isActive', B)], None, ['data.configure']),
    ('fx_rates', ('id', 'id'), [('base', 'base', T), ('quote', 'quote', T), ('as_of_date', 'asOfDate', T)], None, ['data.configure']),
    ('economic_indicators', ('id', 'id'), [('code', 'code', T), ('country_code', 'countryCode', T), ('is_active', 'isActive', B)], None, ['data.configure', 'risk.configure']),
    ('holiday_calendars', ('id', 'id'), [('code', 'code', T), ('country_code', 'countryCode', T), ('is_active', 'isActive', B)], None, ['data.configure']),
    ('snapshots', ('id', 'id'), [('parent_batch_id', 'parentBatchId', T), ('parent_run_id', 'parentRunId', T), ('affiliate_code', 'affiliateCode', T), ('status', 'status', T)], 'affiliate_code', ['data.configure']),
    ('balance_history', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('upload_id', 'uploadId', T)], 'affiliate_code', ['data.configure']),
    ('account_history', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('upload_id', 'uploadId', T)], 'affiliate_code', ['data.configure']),
    ('model_runs', ('id', 'id'), [('affiliate_code', 'affiliateCode', T), ('model_type', 'modelType', T), ('status', 'status', T)], 'affiliate_code', ['rules.edit']),
]

# Created by schema-header.sql because the permission helpers need them first.
PRECREATED = {'roles'}


def generated(col, field, typ):
    expr = f"(data->>'{field}')"
    if typ != T:
        expr = f"{expr}::{typ}"
    return f"  {col} {typ} generated always as ({expr}) stored"


def table_sql(name, pk, cols, aff, write):
    pk_col, pk_field = pk
    out = []
    if name not in PRECREATED:
        lines = [
            f"  {pk_col} text primary key",
            "  data jsonb not null",
            "  created_at timestamptz not null default now()",
            "  updated_at timestamptz not null default now()",
        ] + [generated(*c) for c in cols if c[0] != pk_col]
        out.append(f"create table if not exists public.{name} (\n" + ",\n".join(lines) + "\n);")
        for c in cols:
            if c[0] != pk_col:
                out.append(f"create index if not exists {name}_{c[0]}_idx on public.{name} ({c[0]});")
    # The id column and the record's own id can never disagree.
    out.append(f"alter table public.{name} add constraint {name}_id_matches_data check (data->>'{pk_field}' = {pk_col});")
    out.append(f"create trigger {name}_touch before update on public.{name} for each row execute function app.touch_updated_at();")
    out.append(f"alter table public.{name} enable row level security;")
    if write is not None:
        scope = f" and app.affiliate_ok({aff})" if aff else ""
        can_write = "app.has_any_perm(array[" + ", ".join(f"'{p}'" for p in write) + f"]){scope}"
        out.append(f"create policy {name}_read on public.{name} for select to authenticated using (app.has_perm('dashboard.view'){scope});")
        out.append(f"create policy {name}_insert on public.{name} for insert to authenticated with check ({can_write});")
        out.append(f"create policy {name}_update on public.{name} for update to authenticated using ({can_write}) with check ({can_write});")
        out.append(f"create policy {name}_delete on public.{name} for delete to authenticated using ({can_write});")
    return "\n".join(out)


def main():
    parts = [open('scripts/schema-header.sql', encoding='utf-8').read()]
    for name, pk, cols, aff, write in TABLES:
        parts.append(f"-- {name}\n" + table_sql(name, pk, cols, aff, write) + "\n")
    parts.append(open('scripts/schema-footer.sql', encoding='utf-8').read())
    with open('supabase/migrations/20261017000000_init.sql', 'w', encoding='utf-8', newline='\n') as f:
        f.write("\n".join(parts))
    print(f"{len(TABLES) + 1} tables (incl. app_users) written to supabase/migrations/20261017000000_init.sql")


if __name__ == '__main__':
    main()
