-- Ascent ALM - Phase 3: roles 8 → 5 (approved simplification). Hand-written; applied on top of
-- 20261018000000_security_onboarding.sql with `node scripts/apply-migration.cjs <this file>`.
--
--   ADMIN            "Organisation Admin"
--   AFFILIATE_ADMIN  "Affiliate Admin"
--   RISK_ANALYST     "ALM Analyst"   - absorbs Treasury User
--   APPROVER         "Approver"      - absorbs Control Tester; gains audit.view
--   EXECUTIVE_VIEWER "Viewer"        - absorbs Reporting User; gains reporting.generate
--
-- Users on a retired role are moved to the role that replaced it, then the three retired role rows go.
-- Existing permission customisations are kept: the shipped permissions are added, never removed.
-- Onboarding (public.onboarding) and settings (public.settings) need no schema change for Phase 3 - the
-- organisation's cycle/FTP/market-data defaults are rows in public.settings ('GROUP:<key>').

-- ─── Role definitions ───────────────────────────────────────────────────────

with shipped(code, name, description, permissions) as (values
  ('ADMIN', 'Organisation Admin',
   'Sets up and runs the organisation - affiliates, defaults, users and roles, configuration and audit.',
   '["dashboard.view","risk.view","treasury.view","reporting.view","data.view","admin.manage","group.manage","affiliate.manage","users.manage","data.configure","risk.configure","rules.edit","run.execute","reporting.generate","approvals.approve","audit.view"]'::jsonb),
  ('AFFILIATE_ADMIN', 'Affiliate Admin',
   'Sets up and runs one affiliate - its data sources, users, thresholds and processes. Never Group-wide.',
   '["dashboard.view","risk.view","treasury.view","reporting.view","data.view","data.configure","users.manage","affiliate.manage","run.execute","limits.manage"]'::jsonb),
  ('RISK_ANALYST', 'ALM Analyst',
   'Loads data, maintains assumptions and rules, runs liquidity, IRRBB, FTP and stress, and prepares reports.',
   '["dashboard.view","risk.view","treasury.view","reporting.view","data.view","risk.configure","rules.edit","run.execute","reporting.generate","commentary.write"]'::jsonb),
  ('APPROVER', 'Approver',
   'Reviews and approves or rejects changes and results raised by others; can read the audit trail.',
   '["dashboard.view","risk.view","treasury.view","reporting.view","data.view","approvals.approve","commentary.review","audit.view"]'::jsonb),
  ('EXECUTIVE_VIEWER', 'Viewer',
   'Read-only access to results and reports, and can generate report packs to share.',
   '["dashboard.view","risk.view","treasury.view","reporting.view","reporting.generate","commentary.review"]'::jsonb)
)
insert into public.roles (code, data)
select s.code, jsonb_build_object('code', s.code, 'name', s.name, 'description', s.description, 'permissions', s.permissions)
  from shipped s
on conflict (code) do update
  set data = public.roles.data
           || jsonb_build_object('name', excluded.data->'name', 'description', excluded.data->'description')
           || jsonb_build_object('permissions', (
                select jsonb_agg(distinct p)
                  from jsonb_array_elements_text(coalesce(public.roles.data->'permissions', '[]'::jsonb)
                                                 || (excluded.data->'permissions')) as p));

-- ─── Move users off the retired roles ───────────────────────────────────────

update public.app_users set data = jsonb_set(data, '{role}', '"RISK_ANALYST"') where data->>'role' = 'TREASURY_USER';
update public.app_users set data = jsonb_set(data, '{role}', '"APPROVER"') where data->>'role' = 'CONTROL_TESTER';
update public.app_users set data = jsonb_set(data, '{role}', '"EXECUTIVE_VIEWER"') where data->>'role' = 'REPORTING_USER';

delete from public.roles where code in ('TREASURY_USER', 'CONTROL_TESTER', 'REPORTING_USER');

notify pgrst, 'reload schema';
