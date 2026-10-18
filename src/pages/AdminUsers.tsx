import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth, ROLE_LIST, canonicalRole, isActiveRole } from '@/context/AuthContext';
import { BulkUserUpload, CreatedLoginsNotice, type CreatedLogin } from '@/components/users/UserProvisioning';
import {
  useAffiliates,
  useUsers,
  useSaveUser,
  useRoles,
  useSaveRole,
  useCreateLogin,
  useResetLoginPassword,
} from '@/lib/hooks';
import { hashPassword } from '@/lib/passwordHash';
import { isSupabaseMode } from '@/lib/supabase';
import type { ActiveRoleCode, Role, RoleCode, User } from '@/engine/types';

const PERMISSION_GROUPS: Array<{ label: string; permissions: string[] }> = [
  {
    label: 'View',
    permissions: ['dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'data.view', 'audit.view'],
  },
  { label: 'Configure', permissions: ['data.configure', 'risk.configure', 'rules.edit'] },
  {
    label: 'Execute & generate',
    permissions: ['data.upload', 'run.execute', 'reporting.generate', 'reporting.manage', 'approvals.approve'],
  },
  {
    label: 'Manage',
    permissions: ['admin.manage', 'group.manage', 'affiliate.manage', 'limits.manage', 'users.manage'],
  },
  { label: 'Commentary', permissions: ['commentary.write', 'commentary.review'] },
];

// Roles carrying one of these (any admin role) are never assignable by someone without `admin.manage`.
const DANGEROUS_PERMISSIONS = ['admin.manage', 'group.manage', 'affiliate.manage'];

function newId(): string {
  return `U-${Date.now().toString(36).toUpperCase()}`;
}

const BLANK_USER: User = {
  id: '',
  name: '',
  email: '',
  passwordHash: '',
  role: 'RISK_ANALYST',
  affiliateCode: 'GROUP',
  isActive: true,
  mfaEnrolled: false,
  createdAt: '',
  lastLoginAt: null,
};

export function AdminUsers({
  embedded = false,
  forcedAffiliateCode,
}: { embedded?: boolean; forcedAffiliateCode?: string } = {}) {
  const { hasPermission, user: signedIn } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const { data: affiliates = [] } = useAffiliates();
  const { data: roles } = useRoles();
  const saveRole = useSaveRole();
  // The five role templates, in their fixed display order; the live table supplies any admin-edited permissions.
  const roleList = ROLE_LIST.map((r) => roles?.find((live) => live.code === r.code) ?? r);
  const save = useSaveUser();
  const createLogin = useCreateLogin();
  const resetPassword = useResetLoginPassword();
  // Role definitions need admin.manage; day-to-day provisioning also opens up to users.manage.
  const canEditRoles = hasPermission('admin.manage');
  const canManageUsers = canEditRoles || hasPermission('users.manage');

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [affiliateFilter, setAffiliateFilter] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCreated, setBulkCreated] = useState<CreatedLogin[]>([]);

  // Embedded inside a specific affiliate's Settings page, that affiliate is the whole point of the
  // view - even an Admin who could otherwise see everyone should see only this one affiliate here.
  const scopedUsers = forcedAffiliateCode
    ? users.filter((u) => u.affiliateCode === forcedAffiliateCode)
    : canEditRoles
      ? users
      : users.filter((u) => u.affiliateCode === signedIn?.affiliateCode);

  // The filter dropdown itself is only useful group-wide - embedded/single-affiliate views are
  // already scoped to one affiliate and have nothing left to filter between.
  const filteredUsers =
    !forcedAffiliateCode && affiliateFilter
      ? scopedUsers.filter((u) => u.affiliateCode === affiliateFilter)
      : scopedUsers;

  const assignableRoles = canEditRoles
    ? roleList
    : roleList.filter((r) => !r.permissions.some((p) => DANGEROUS_PERMISSIONS.includes(p)));
  // Bulk upload: an Affiliate Admin adds Analysts, Approvers and Viewers only - never another admin.
  const bulkRoles = assignableRoles
    .map((r) => r.code)
    .filter((c): c is ActiveRoleCode => isActiveRole(c) && (canEditRoles || !['ADMIN', 'AFFILIATE_ADMIN'].includes(c)));

  const assignableAffiliates = forcedAffiliateCode
    ? affiliates.filter((a) => a.code === forcedAffiliateCode)
    : canEditRoles
      ? affiliates
      : affiliates.filter((a) => a.code === signedIn?.affiliateCode);

  const active = filteredUsers.filter((u) => u.isActive);
  const withoutMfa = active.filter((u) => !u.mfaEnrolled);
  const byRole = useMemo(() => {
    const m = new Map<RoleCode, number>();
    for (const u of filteredUsers) m.set(canonicalRole(u.role), (m.get(canonicalRole(u.role)) ?? 0) + 1);
    return m;
  }, [filteredUsers]);

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    filteredUsers,
    10,
    ['name', 'email', 'affiliateCode'],
  );

  const columns: ResultColumn<User>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <span>
          <span className="font-medium text-navy-900">{u.name}</span>
          {u.id === signedIn?.id && <span className="ml-2 text-[11px] text-gray-400">you</span>}
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => <span className="font-mono text-[12px]">{u.email}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <StatusBadge status={roleList.find((r) => r.code === canonicalRole(u.role))?.name ?? u.role} tone="neutral" />
      ),
    },
    { key: 'scope', header: 'Scope', render: (u) => <span className="font-mono text-[12px]">{u.affiliateCode}</span> },
    {
      key: 'mfa',
      header: 'MFA',
      render: (u) =>
        u.mfaEnrolled ? (
          <StatusBadge status="Enrolled" tone="success" />
        ) : (
          <StatusBadge status="Not enrolled" tone="warning" />
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <StatusBadge status={u.isActive ? 'Active' : 'Disabled'} tone={u.isActive ? 'success' : 'neutral'} />
      ),
    },
    {
      key: 'last',
      header: 'Last signed in',
      render: (u) => (
        <span className="text-[12px] text-gray-500">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}
        </span>
      ),
    },
  ];

  return (
    <>
      {!embedded && (
        <ModuleHeader
          title="Users & Roles"
          description="The register the application gates on - what a role can do here is what it can do everywhere."
          asOfDate={null}
          metrics={[
            {
              label: 'Users',
              value: String(users.length),
              about: 'Every account in the register, regardless of status.',
            },
            {
              label: 'Active',
              value: String(active.length),
              about: 'Accounts that can currently sign in - a disabled account is kept, not deleted.',
            },
            {
              label: 'Without MFA',
              value: String(withoutMfa.length),
              tone: withoutMfa.length > 0 ? 'warning' : 'success',
              about: 'Active accounts not enrolled in multi-factor authentication.',
            },
            {
              label: 'Roles in use',
              value: `${byRole.size} of ${roleList.length}`,
              about: 'How many of the defined roles actually have a user assigned to them.',
            },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                disabled={!canManageUsers}
                className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Bulk upload
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={!canManageUsers}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                New user
              </button>
            </>
          }
        />
      )}
      {embedded && (
        <div className="mb-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            disabled={!canManageUsers}
            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Bulk upload
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!canManageUsers}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New user
          </button>
        </div>
      )}

      {(bulkOpen || bulkCreated.length > 0) && (
        <div className="mb-4 space-y-3">
          <CreatedLoginsNotice created={bulkCreated} onDone={() => setBulkCreated([])} />
          {bulkOpen && (
            <BulkUserUpload
              fixedAffiliateCode={forcedAffiliateCode ?? (canEditRoles ? undefined : signedIn?.affiliateCode)}
              affiliates={assignableAffiliates}
              roles={bulkRoles}
              existingEmails={users.map((u) => u.email.toLowerCase())}
              onCancel={() => setBulkOpen(false)}
              onCreated={(created) => {
                setBulkOpen(false);
                setBulkCreated(created);
              }}
            />
          )}
        </div>
      )}

      <section className="mb-6 table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Users</h2>
          {!forcedAffiliateCode && assignableAffiliates.length > 1 && (
            <div className="mb-3">
              <label htmlFor="user-affiliate-filter" className="mb-1 block text-[12px] font-medium text-gray-600">
                Affiliate
              </label>
              <select
                id="user-affiliate-filter"
                value={affiliateFilter}
                onChange={(e) => setAffiliateFilter(e.target.value)}
                className="w-full max-w-xs rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none"
              >
                <option value="">All affiliates</option>
                {canEditRoles && <option value="GROUP">Ecobank Group</option>}
                {assignableAffiliates
                  .filter((a) => a.code !== 'GROUP')
                  .map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <TableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            exportData={() => filteredUsers}
            exportFilename="users"
            density={density}
            onDensityChange={setDensity}
          />
        </div>
        <ResultTable
          rows={paged}
          columns={columns}
          rowKey={(u) => u.id}
          emptyMessage={isLoading ? 'Loading…' : 'No users in the register.'}
          renderDetail={(u) => {
            const role = roleList.find((r) => r.code === canonicalRole(u.role));
            return (
              <div className="space-y-3 text-[12px]">
                <p className="text-gray-600">{role?.description ?? 'No description for this role.'}</p>
                <div>
                  <p className="mb-1 font-bold uppercase tracking-wider text-gray-400">
                    Permissions ({role?.permissions.length ?? 0})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(role?.permissions ?? []).map((p) => (
                      <span
                        key={p}
                        className="rounded border border-gray-200 px-2 py-0.5 font-mono text-[11px] text-gray-600"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditing(u)}
                    disabled={!canManageUsers}
                    className="rounded border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!canManageUsers || u.id === signedIn?.id}
                    title={u.id === signedIn?.id ? 'You cannot disable your own account' : undefined}
                    onClick={() => void save.mutateAsync({ ...u, isActive: !u.isActive })}
                    className="rounded border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                  >
                    {u.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            );
          }}
        />
        <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-[13px] font-bold uppercase tracking-widest text-navy-900">Roles</h2>
        <p className="mb-4 text-[12px] text-gray-500">
          Five role templates. Pick one per user - what the role can do follows automatically.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roleList.map((r) => (
            <div key={r.code} className="rounded-lg border border-gray-100 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-bold text-navy-900">{r.name}</p>
                <span className="text-[12px] text-gray-400">{byRole.get(r.code) ?? 0} user(s)</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{r.description}</p>
            </div>
          ))}
        </div>
        {canEditRoles && (
          <details className="mt-4 border-t border-gray-50 pt-3">
            <summary className="cursor-pointer text-[12px] font-bold text-navy-700">
              Advanced - edit role permissions
            </summary>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
              Changing a template changes it for every user who holds that role. Navigation, action buttons and run
              controls all read this same set, live.
            </p>
            <ul className="mt-2 divide-y divide-gray-50">
              {roleList.map((r) => (
                <li key={r.code} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="font-medium text-navy-900">{r.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-gray-400">{r.permissions.length} permissions</span>
                    <button
                      type="button"
                      onClick={() => setEditingRole(r)}
                      className="font-bold text-navy-700 hover:underline"
                    >
                      Edit permissions
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {editing && (
        <UserEditor
          user={editing}
          affiliates={assignableAffiliates}
          roles={assignableRoles}
          allowGroupScope={canEditRoles}
          existingEmails={users.filter((u) => u.id !== editing.id).map((u) => u.email.toLowerCase())}
          onCancel={() => setEditing(null)}
          onSave={async (next, password) => {
            await save.mutateAsync(next);
            // On Supabase the credential lives in Supabase Auth, not on the record - reset it there.
            if (isSupabaseMode && password !== '') await resetPassword.mutateAsync({ user: next, password });
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <UserEditor
          user={{
            ...BLANK_USER,
            id: newId(),
            createdAt: new Date().toISOString(),
            affiliateCode:
              forcedAffiliateCode ??
              (canEditRoles ? BLANK_USER.affiliateCode : (signedIn?.affiliateCode ?? BLANK_USER.affiliateCode)),
          }}
          affiliates={assignableAffiliates}
          roles={assignableRoles}
          allowGroupScope={canEditRoles && !forcedAffiliateCode}
          existingEmails={users.map((u) => u.email.toLowerCase())}
          isNew
          onCancel={() => setCreating(false)}
          onSave={async (next, password) => {
            // On Supabase a new user is a real sign-in: auth user, identity and app_users row together.
            if (isSupabaseMode) await createLogin.mutateAsync({ user: next, password });
            else await save.mutateAsync(next);
            setCreating(false);
          }}
        />
      )}

      {editingRole && (
        <RoleEditor
          role={editingRole}
          onCancel={() => setEditingRole(null)}
          onSave={async (next) => {
            await saveRole.mutateAsync(next);
            setEditingRole(null);
          }}
        />
      )}
    </>
  );
}

function RoleEditor({
  role,
  onCancel,
  onSave,
}: {
  role: Role;
  onCancel: () => void;
  onSave: (r: Role) => Promise<void>;
}) {
  const [permissions, setPermissions] = useState<string[]>(role.permissions);

  const toggle = (p: string) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  return (
    <div data-tour="drawer" className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-[15px] font-bold text-navy-900">{role.name}</h2>
        <p className="mb-4 text-[12px] leading-relaxed text-gray-500">{role.description}</p>

        <div className="space-y-4">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.label}>
              <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{g.label}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {g.permissions.map((p) => (
                  <label
                    key={p}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={() => toggle(p)}
                      className="accent-gold-500"
                    />
                    <span className="font-mono text-[12px] text-navy-900">{p}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            data-tour="drawer-close"
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave({ ...role, permissions })}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
          >
            Save permissions
          </button>
        </div>
      </div>
    </div>
  );
}

function UserEditor({
  user,
  affiliates,
  roles,
  existingEmails,
  isNew,
  allowGroupScope,
  onCancel,
  onSave,
}: {
  user: User;
  affiliates: Array<{ code: string; name: string }>;
  roles: Role[];
  existingEmails: string[];
  isNew?: boolean;
  allowGroupScope: boolean;
  onCancel: () => void;
  onSave: (u: User, password: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(user);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A Supabase sign-in's email is its login identity; changing it here would leave the two out of step.
  const emailLocked = isSupabaseMode && !isNew;
  const set = (patch: Partial<User>) => setDraft((d) => ({ ...d, ...patch }));

  const emailTaken = draft.email.trim() !== '' && existingEmails.includes(draft.email.trim().toLowerCase());
  const canSave =
    draft.name.trim() !== '' &&
    draft.email.trim() !== '' &&
    !emailTaken &&
    (!isNew || password.trim() !== '') &&
    (!isSupabaseMode || password.trim() === '' || password.trim().length >= 8);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (isSupabaseMode) {
        await onSave({ ...draft, passwordHash: '' }, password.trim());
      } else {
        const passwordHash = password.trim() !== '' ? await hashPassword(password.trim()) : draft.passwordHash;
        await onSave({ ...draft, passwordHash }, password.trim());
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The user could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-tour="drawer" className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[15px] font-bold text-navy-900">{isNew ? 'New user' : draft.name}</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="mb-1 block text-[12px] font-medium text-gray-600">
              Name
            </label>
            <input
              id="u-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="u-email" className="mb-1 block text-[12px] font-medium text-gray-600">
              Email
            </label>
            <input
              id="u-email"
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              readOnly={emailLocked}
              title={emailLocked ? 'The sign-in email cannot be changed here' : undefined}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500"
            />
            {emailTaken && <p className="mt-1 text-[11px] text-danger">Already in use by another user.</p>}
          </div>
          <fieldset className="md:col-span-2">
            <legend className="mb-1 block text-[12px] font-medium text-gray-600">Role</legend>
            <div className="space-y-1.5">
              {roles.map((r) => (
                <label
                  key={r.code}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${canonicalRole(draft.role) === r.code ? 'border-navy-700 bg-navy-50' : 'border-gray-200'}`}
                >
                  <input
                    type="radio"
                    name="u-role"
                    value={r.code}
                    checked={canonicalRole(draft.role) === r.code}
                    onChange={() => set({ role: r.code as RoleCode })}
                    aria-label={r.name}
                    className="mt-0.5 accent-gold-500"
                  />
                  <span>
                    <span className="block text-[13px] font-bold text-navy-900">{r.name}</span>
                    <span className="block text-[12px] leading-snug text-gray-500">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="u-scope" className="mb-1 block text-[12px] font-medium text-gray-600">
              Affiliate scope
            </label>
            <select
              id="u-scope"
              value={draft.affiliateCode}
              disabled={!allowGroupScope}
              title={allowGroupScope ? undefined : 'Your account can only provision users for its own affiliate'}
              onChange={(e) => set({ affiliateCode: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none disabled:opacity-70"
            >
              {allowGroupScope && <option value="GROUP">Ecobank Group</option>}
              {affiliates
                .filter((a) => a.code !== 'GROUP')
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="u-password" className="mb-1 block text-[12px] font-medium text-gray-600">
              Password
            </label>
            <input
              id="u-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isNew
                  ? isSupabaseMode
                    ? 'Required, at least 8 characters'
                    : 'Required'
                  : 'Leave blank to keep current password'
              }
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none"
            />
          </div>
        </div>

        <label htmlFor="u-mfa" className="mt-4 flex items-center gap-2 text-[12px] text-gray-600">
          <input
            id="u-mfa"
            type="checkbox"
            checked={draft.mfaEnrolled}
            onChange={(e) => set({ mfaEnrolled: e.target.checked })}
            className="accent-gold-500"
          />
          Multi-factor authentication enrolled
        </label>

        {saveError && (
          <p role="alert" className="mt-4 text-[12px] text-danger">
            {saveError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            data-tour="drawer-close"
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : isNew ? 'Create user' : 'Save user'}
          </button>
        </div>
      </div>
    </div>
  );
}
