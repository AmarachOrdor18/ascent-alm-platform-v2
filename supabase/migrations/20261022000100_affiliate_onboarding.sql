-- Ascent ALM - guided Affiliate Admin onboarding. Hand-written; apply with
--   node scripts/apply-migration.cjs supabase/migrations/20261022000100_affiliate_onboarding.sql
--
-- The affiliate's guided setup (/welcome/affiliate) saves progress to the existing onboarding row
-- 'AFF:<code>' and raises the existing Affiliates/Activate approval - no new tables. One rule tightens:
-- an Affiliate Admin cannot create or promote another admin. Any role carrying affiliate.manage now
-- counts as administrative, so only an Organisation Admin (admin.manage) can grant it - including by
-- assigning an existing user as an affiliate's Affiliate Admin.

create or replace function app.role_is_privileged(role_code text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select r.data->'permissions' ?| array['admin.manage', 'group.manage', 'affiliate.manage'] from public.roles r where r.code = role_code),
    false)
$$;

create or replace function app.assert_can_provision(p_user jsonb) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if app.is_owner_session() then
    return;
  end if;
  if not app.has_perm('users.manage') then
    raise exception 'Not permitted: managing sign-ins needs the users.manage permission'
      using errcode = '42501';
  end if;
  if not app.has_perm('admin.manage') then
    if p_user->>'affiliateCode' is distinct from app.me()->>'affiliateCode' then
      raise exception 'Not permitted: you can only provision users for your own affiliate'
        using errcode = '42501';
    end if;
    if app.role_is_privileged(p_user->>'role') then
      raise exception 'Not permitted: only an Organisation Admin can grant an administrative role'
        using errcode = '42501';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
