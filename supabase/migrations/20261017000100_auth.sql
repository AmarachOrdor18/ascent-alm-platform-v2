-- Ascent ALM - sign-in provisioning on Supabase Auth.
--
-- There is no service-role key in the browser, so a user manager cannot call the Auth admin API to create
-- someone else's login. These SECURITY DEFINER functions do it inside the database instead, after checking
-- the caller's own permissions: they write the auth.users + auth.identities rows Supabase Auth expects for
-- an email/password account, and link the app_users record to it.
--
-- pgcrypto lives in the `extensions` schema on Supabase, hence the search_path below.

-- True when the call came straight from a database owner connection (the seed script), not through the
-- API: PostgREST always sets request.jwt.claims, a direct connection never does.
create or replace function app.is_owner_session() returns boolean
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '') is null
$$;

-- The provisioning rules a non-owner caller must satisfy. A user manager without admin.manage (an
-- Affiliate Administrator) may only provision users for their own affiliate and never with a role that
-- carries admin.manage or group.manage.
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
    if exists (
      select 1 from public.roles r
       where r.code = p_user->>'role'
         and r.data->'permissions' ?| array['admin.manage', 'group.manage']) then
      raise exception 'Not permitted: only an Administrator can grant an administrative role'
        using errcode = '42501';
    end if;
  end if;
end $$;

-- Creates an email/password login (email already confirmed) plus its app_users row, and returns the
-- new auth user id. p_user is the app's User record; its passwordHash, if any, is discarded.
create or replace function app.create_login(p_email text, p_password text, p_user jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, app, extensions, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid := gen_random_uuid();
  v_data jsonb;
begin
  perform app.assert_can_provision(p_user);

  if v_email is null or v_email = '' then
    raise exception 'An email address is required';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'The password must be at least 8 characters';
  end if;
  if coalesce(p_user->>'id', '') = '' then
    raise exception 'The user record has no id';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'A sign-in already exists for %', v_email using errcode = '23505';
  end if;
  if exists (select 1 from public.app_users where email = v_email) then
    raise exception 'A user with email % already exists', v_email using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_user->>'name', 'app_user_id', p_user->>'id'),
    false, false, false,
    now(), now()
  );

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', null, now(), now()
  );

  v_data := (p_user - 'passwordHash') || jsonb_build_object('email', v_email);
  insert into public.app_users (id, data, auth_user_id) values (p_user->>'id', v_data, v_uid);

  return v_uid;
end $$;

-- Sets another user's password (an administrator's reset). Users change their own password through
-- Supabase Auth directly (auth.updateUser), not through this.
create or replace function app.set_login_password(p_app_user_id text, p_password text) returns void
language plpgsql volatile security definer set search_path = public, app, extensions, auth as $$
declare
  v_user public.app_users;
begin
  select * into v_user from public.app_users where id = p_app_user_id;
  if not found then
    raise exception 'No user %', p_app_user_id;
  end if;
  perform app.assert_can_provision(v_user.data);
  if v_user.auth_user_id is null then
    raise exception 'User % has no sign-in to reset', p_app_user_id;
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'The password must be at least 8 characters';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = v_user.auth_user_id;
end $$;

revoke all on function app.create_login(text, text, jsonb) from public, anon;
revoke all on function app.set_login_password(text, text) from public, anon;
revoke all on function app.assert_can_provision(jsonb) from public, anon;
grant execute on function app.create_login(text, text, jsonb) to authenticated;
grant execute on function app.set_login_password(text, text) to authenticated;
grant execute on function app.is_owner_session() to authenticated;
grant execute on function app.assert_can_provision(jsonb) to authenticated;

-- The API only exposes the public schema, so the browser reaches these through thin public wrappers
-- (supabase.rpc('create_login', ...)). They run as the caller; the checks live in the app.* functions.
create or replace function public.create_login(p_email text, p_password text, p_user jsonb) returns uuid
language sql volatile as $$ select app.create_login(p_email, p_password, p_user) $$;

create or replace function public.set_login_password(p_app_user_id text, p_password text) returns void
language sql volatile as $$ select app.set_login_password(p_app_user_id, p_password) $$;

revoke all on function public.create_login(text, text, jsonb) from public, anon;
revoke all on function public.set_login_password(text, text) from public, anon;
grant execute on function public.create_login(text, text, jsonb) to authenticated;
grant execute on function public.set_login_password(text, text) to authenticated;

notify pgrst, 'reload schema';
