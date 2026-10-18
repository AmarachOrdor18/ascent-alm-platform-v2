-- Teardown fixes part 2 (spec §5.1): capability cascades. An Affiliate Admin can do everything an ALM Analyst
-- can, for their own affiliate - configure rules and assumptions, calibrate behavioural models, run, generate
-- reports, write commentary. Scope stays enforced by RLS: every rules / model_runs / rule_history write policy
-- already checks app.affiliate_write_ok(affiliate_code) (20261018000000_security_onboarding.sql), so an
-- Affiliate Admin writes only their own affiliate's rows, never a Group default (affiliate_code null) or
-- another affiliate's. Approving stays with the Approver and Organisation Admin roles (approvals.approve).

update public.roles r
   set data = jsonb_set(
         r.data,
         '{permissions}',
         r.data->'permissions' || coalesce((
           select jsonb_agg(p)
             from unnest(array['rules.edit', 'risk.configure', 'reporting.generate', 'commentary.write']) as p
            where not (r.data->'permissions' ? p)
         ), '[]'::jsonb))
 where r.code = 'AFFILIATE_ADMIN';

-- Belt and braces: approvals.approve only on the two deciding roles.
update public.roles r
   set data = jsonb_set(r.data, '{permissions}', (r.data->'permissions') - 'approvals.approve')
 where r.code not in ('ADMIN', 'APPROVER')
   and r.data->'permissions' ? 'approvals.approve';
