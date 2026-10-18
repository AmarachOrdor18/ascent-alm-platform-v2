-- ─── Users: everyone signed in can see the directory; only users.manage changes it ─────────────
-- A user may update their own row (name, last sign-in, password-change bookkeeping) but never their
-- own role, scope or active flag - that would be self-granted privilege.

create policy app_users_read on public.app_users for select to authenticated
  using (app.has_perm('dashboard.view') or auth_user_id = auth.uid());
create policy app_users_insert on public.app_users for insert to authenticated
  with check (app.has_perm('users.manage'));
create policy app_users_update on public.app_users for update to authenticated
  using (app.has_perm('users.manage') or auth_user_id = auth.uid())
  with check (app.has_perm('users.manage') or auth_user_id = auth.uid());
create policy app_users_delete on public.app_users for delete to authenticated
  using (app.has_perm('users.manage'));

create or replace function app.guard_self_escalation() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_perm('users.manage') and (
       new.data->>'role' is distinct from old.data->>'role'
    or new.data->>'affiliateCode' is distinct from old.data->>'affiliateCode'
    or new.data->>'isActive' is distinct from old.data->>'isActive'
    or new.auth_user_id is distinct from old.auth_user_id) then
    raise exception 'Only a user manager can change a role, scope or active flag';
  end if;
  return new;
end $$;
create trigger app_users_guard before update on public.app_users
  for each row execute function app.guard_self_escalation();
create trigger app_users_touch before update on public.app_users
  for each row execute function app.touch_updated_at();
alter table public.app_users enable row level security;

-- ─── Approvals: anyone may raise; only a different person with approvals.approve may decide ──────

create policy approvals_read on public.approvals for select to authenticated
  using (app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code));
create policy approvals_insert on public.approvals for insert to authenticated
  with check (
    app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code)
    and data->>'status' = 'Pending'
    and data->>'requestedBy' = app.me()->>'name');
create policy approvals_update on public.approvals for update to authenticated
  using (app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code))
  with check (app.has_perm('dashboard.view') and app.affiliate_ok(affiliate_code));
create policy approvals_delete on public.approvals for delete to authenticated
  using (app.has_perm('admin.manage'));

-- Maker-checker, enforced by the database rather than the screen: a decision must be made by someone
-- holding approvals.approve, recorded under their own name, and never by the person who raised it.
-- Only the requester (or an approver) may withdraw; nobody may rewrite a request that is no longer pending.
create or replace function app.guard_approval_decision() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  me_name text := app.me()->>'name';
begin
  if old.data->>'status' <> 'Pending' then
    raise exception 'Request % is already %', old.id, old.data->>'status';
  end if;
  if new.data->>'requestedBy' is distinct from old.data->>'requestedBy' then
    raise exception 'The requester of an approval cannot be changed';
  end if;
  if new.data->>'status' in ('Approved', 'Rejected') then
    if not app.has_perm('approvals.approve') then
      raise exception 'Deciding a request needs the approvals.approve permission';
    end if;
    if me_name = old.data->>'requestedBy' then
      raise exception 'Segregation of duties: the maker of a request cannot also be its checker';
    end if;
    if new.data->>'decidedBy' is distinct from me_name then
      raise exception 'A decision must be recorded under the deciding user''s own name';
    end if;
  elsif new.data->>'status' = 'Withdrawn' then
    if me_name <> old.data->>'requestedBy' and not app.has_perm('approvals.approve') then
      raise exception 'Only the requester or an approver can withdraw a request';
    end if;
  elsif me_name <> old.data->>'requestedBy' then
    raise exception 'Only the requester can amend a pending request';
  end if;
  return new;
end $$;
create trigger approvals_guard before update on public.approvals
  for each row execute function app.guard_approval_decision();

-- ─── Audit trail: append-only for everyone, administrators and the service role included ─────────

create policy audit_events_read on public.audit_events for select to authenticated
  using (app.has_any_perm(array['audit.view', 'admin.manage', 'group.manage']));
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check (data->>'userId' = app.me()->>'id');

create or replace function app.audit_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit trail is append-only: % is not allowed', tg_op;
end $$;
create trigger audit_events_no_update before update on public.audit_events
  for each row execute function app.audit_is_append_only();
create trigger audit_events_no_delete before delete on public.audit_events
  for each row execute function app.audit_is_append_only();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.audit_is_append_only();

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Row-level security does the real gating; these only let the API roles reach the tables at all.
-- anon (signed-out) gets nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete, truncate on public.audit_events from authenticated;
revoke all on all tables in schema public from anon;
