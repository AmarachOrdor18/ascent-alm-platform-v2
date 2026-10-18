-- Ascent ALM - "who can fix this?" Hand-written; apply with
--   node scripts/apply-migration.cjs supabase/migrations/20261023000100_who_can_fix.sql
--
-- Readiness shows, for every unresolved item, the people who hold the permission to clear it - never one
-- named owner. An affiliate user cannot read Group users' rows (app_users RLS), so the answer comes from a
-- security-definer function that returns names and role names only.
--   p_permission     one permission, or several separated by | (any of them)
--   p_affiliate_code null or GROUP = a Group item (Group-level users only); else that affiliate's users
--                    plus Group-level users.

create or replace function app.who_can_fix(p_permission text, p_affiliate_code text)
returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'name', u.data->>'name',
           'role', u.data->>'role',
           'roleName', coalesce(r.data->>'name', u.data->>'role'),
           'affiliateCode', u.data->>'affiliateCode')
         order by (u.data->>'affiliateCode' = 'GROUP'), u.data->>'name'), '[]'::jsonb)
    from public.app_users u
    join public.roles r on r.code = u.data->>'role'
   where app.me() is not null
     and coalesce((u.data->>'isActive')::boolean, true)
     and r.data->'permissions' ?| string_to_array(p_permission, '|')
     and (
       (u.data->>'affiliateCode' = 'GROUP' or r.data->'permissions' ? 'group.manage')
       or (p_affiliate_code is not null and p_affiliate_code <> 'GROUP' and u.data->>'affiliateCode' = p_affiliate_code)
     )
$$;

create or replace function public.who_can_fix(p_permission text, p_affiliate_code text)
returns jsonb language sql stable as $$ select app.who_can_fix(p_permission, p_affiliate_code) $$;
revoke all on function public.who_can_fix(text, text) from public, anon;
grant execute on function public.who_can_fix(text, text) to authenticated;
grant execute on function app.who_can_fix(text, text) to authenticated;

notify pgrst, 'reload schema';
