-- Approving an Affiliates/Activate request only flipped affiliates already in Testing or Suspended:
-- `update … where data->>'status' in ('Testing','Suspended')`. A brand-new affiliate is 'Onboarding'
-- from first save (lib/affiliateFactory.ts) and stays there straight through the welcome readiness
-- flow, which raises the Activate request from that state. The approval then succeeded - the request
-- row went Approved, no error anywhere - while the activation update matched zero rows, so the
-- affiliate stayed not-Live with the request already decided. ('Testing' is only ever entered through
-- the manual button in Affiliate Settings, and an Affiliate Administrator cannot even set it - status
-- is not in app.affiliate_self_editable_fields() - so the welcome flow cannot land in 'Testing' first.)
--
-- 'Onboarding' joins the statuses an approved Activate request may make Live. The Live guard is
-- untouched: this path still runs only under the app.activating flag the approval trigger sets.

create or replace function app.apply_activation_approval() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.data->>'status' = 'Approved'
     and old.data->>'status' is distinct from 'Approved'
     and new.data->>'module' = 'Affiliates'
     and new.data->>'action' = 'Activate' then
    perform set_config('app.activating', new.data->>'entityId', true);
    update public.affiliates
       set data = jsonb_set(data, '{status}', '"Live"')
     where code = new.data->>'entityId'
       and data->>'status' in ('Onboarding', 'Testing', 'Suspended');
    perform set_config('app.activating', '', true);
  end if;
  return new;
end $$;
