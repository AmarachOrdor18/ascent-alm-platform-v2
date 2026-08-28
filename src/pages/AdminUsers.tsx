import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth, ROLES } from '@/context/AuthContext';
import { useAffiliates, useUsers, useSaveUser, useRoles, useSaveRole } from '@/lib/hooks';
import { hashPassword } from '@/lib/passwordHash';
import type { Role, RoleCode, User } from '@/engine/types';

const DEFAULT_ROLE_LIST = Object.values(ROLES);

const PERMISSION_GROUPS: Array<{ label: string; permissions: string[] }> = [
  { label: 'View', permissions: ['dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'data.view', 'audit.view'] },
  { label: 'Configure', permissions: ['data.configure', 'risk.configure', 'rules.edit'] },
  { label: 'Execute & generate', permissions: ['run.execute', 'reporting.generate', 'reporting.manage', 'approvals.approve'] },
  { label: 'Manage', permissions: ['admin.manage', 'group.manage', 'limits.manage', 'users.manage'] },
  { label: 'Commentary', permissions: ['commentary.write', 'commentary.review'] },
];

// Roles carrying one of these are never assignable by someone without `admin.manage`.
const DANGEROUS_PERMISSIONS = ['admin.manage', 'group.manage'];

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

export function AdminUsers() {
  const { hasPermission, user: signedIn } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const { data: affiliates = [] } = useAffiliates();
  const { data: roles } = useRoles();
  const saveRole = useSaveRole();
  const roleList = roles && roles.length > 0 ? roles : DEFAULT_ROLE_LIST;
  const save = useSaveUser();
  // Role definitions need admin.manage; day-to-day provisioning also opens up to users.manage.
  const canEditRoles = hasPermission('admin.manage');
  const canManageUsers = canEditRoles || hasPermission('users.manage');

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const scopedUsers = canEditRoles
    ? users
    : users.filter((u) => u.affiliateCode === signedIn?.affiliateCode);

  const assignableRoles = canEditRoles
    ? roleList
    : roleList.filter((r) => !r.permissions.some((p) => DANGEROUS_PERMISSIONS.includes(p)));

  const assignableAffiliates = canEditRoles
    ? affiliates
    : affiliates.filter((a) => a.code === signedIn?.affiliateCode);

  const active = scopedUsers.filter((u) => u.isActive);
  const withoutMfa = active.filter((u) => !u.mfaEnrolled);
  const byRole = useMemo(() => {
    const m = new Map<RoleCode, number>();
    for (const u of scopedUsers) m.set(u.role, (m.get(u.role) ?? 0) + 1);
    return m;
  }, [scopedUsers]);

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    scopedUsers,
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
          {u.id === signedIn?.id && <span className="ml-2 text-[10px] text-gray-400">you</span>}
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => <span className="font-mono text-[11px]">{u.email}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <StatusBadge status={roleList.find((r) => r.code === u.role)?.name ?? u.role} tone="neutral" />,
    },
    { key: 'scope', header: 'Scope', render: (u) => <span className="font-mono text-[11px]">{u.affiliateCode}</span> },
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
        <span className="text-[11px] text-gray-500">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}
        </span>
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Users & Roles"
        description="The register the application gates on — what a role can do here is what it can do everywhere."
        asOfDate={null}
        metrics={[
          { label: 'Users', value: String(users.length), about: 'Every account in the register, regardless of status.' },
          { label: 'Active', value: String(active.length), about: 'Accounts that can currently sign in — a disabled account is kept, not deleted.' },
          {
            label: 'Without MFA',
            value: String(withoutMfa.length),
            tone: withoutMfa.length > 0 ? 'warning' : 'success',
            about: 'Active accounts not enrolled in multi-factor authentication.',
          },
          { label: 'Roles in use', value: `${byRole.size} of ${roleList.length}`, about: 'How many of the defined roles actually have a user assigned to them.' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!canManageUsers}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New user
          </button>
        }
      />

      <section className="mb-6 table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Users</h2>
          <TableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            exportData={() => users}
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
            const role = roleList.find((r) => r.code === u.role);
            return (
              <div className="space-y-3 text-[11px]">
                <p className="text-gray-600">{role?.description ?? 'No description for this role.'}</p>
                <div>
                  <p className="mb-1 font-bold uppercase tracking-wider text-gray-400">
                    Permissions ({role?.permissions.length ?? 0})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(role?.permissions ?? []).map((p) => (
                      <span key={p} className="rounded border border-gray-200 px-2 py-0.5 font-mono text-[10px] text-gray-600">
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
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Roles</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roleList.map((r) => (
            <div key={r.code} className="rounded-lg border border-gray-100 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-bold text-navy-900">{r.name}</p>
                <span className="text-[11px] text-gray-400">{byRole.get(r.code) ?? 0} user(s)</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{r.description}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="font-mono text-[10px] text-gray-400">{r.permissions.length} permissions</p>
                <button
                  type="button"
                  onClick={() => setEditingRole(r)}
                  disabled={!canEditRoles}
                  title={canEditRoles ? undefined : 'Only a Group Administrator can edit role permissions'}
                  className="text-[11px] font-bold text-navy-700 hover:underline disabled:opacity-40"
                >
                  Edit permissions
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
          Users move between these {roleList.length} roles; permissions within each are editable here. Sign in as any
          of them to see the effect — navigation, action buttons and run controls all read this same set, live.
        </p>
      </section>

      {editing && (
        <UserEditor
          user={editing}
          affiliates={assignableAffiliates}
          roles={assignableRoles}
          allowGroupScope={canEditRoles}
          existingEmails={users.filter((u) => u.id !== editing.id).map((u) => u.email.toLowerCase())}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            await save.mutateAsync(next);
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
            affiliateCode: canEditRoles ? BLANK_USER.affiliateCode : (signedIn?.affiliateCode ?? BLANK_USER.affiliateCode),
          }}
          affiliates={assignableAffiliates}
          roles={assignableRoles}
          allowGroupScope={canEditRoles}
          existingEmails={users.map((u) => u.email.toLowerCase())}
          isNew
          onCancel={() => setCreating(false)}
          onSave={async (next) => {
            await save.mutateAsync(next);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-[14px] font-bold text-navy-900">{role.name}</h2>
        <p className="mb-4 text-[11px] leading-relaxed text-gray-500">{role.description}</p>

        <div className="space-y-4">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.label}>
              <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.label}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {g.permissions.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={() => toggle(p)}
                      className="accent-gold-500"
                    />
                    <span className="font-mono text-[11px] text-navy-900">{p}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave({ ...role, permissions })}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
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
  onSave: (u: User) => Promise<void>;
}) {
  const [draft, setDraft] = useState(user);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<User>) => setDraft((d) => ({ ...d, ...patch }));

  const emailTaken = draft.email.trim() !== '' && existingEmails.includes(draft.email.trim().toLowerCase());
  const canSave =
    draft.name.trim() !== '' && draft.email.trim() !== '' && !emailTaken && (!isNew || password.trim() !== '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const passwordHash = password.trim() !== '' ? await hashPassword(password.trim()) : draft.passwordHash;
      await onSave({ ...draft, passwordHash });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[14px] font-bold text-navy-900">{isNew ? 'New user' : draft.name}</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="mb-1 block text-[11px] font-medium text-gray-600">Name</label>
            <input
              id="u-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="u-email" className="mb-1 block text-[11px] font-medium text-gray-600">Email</label>
            <input
              id="u-email"
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            />
            {emailTaken && <p className="mt-1 text-[10px] text-danger">Already in use by another user.</p>}
          </div>
          <div>
            <label htmlFor="u-role" className="mb-1 block text-[11px] font-medium text-gray-600">Role</label>
            <select
              id="u-role"
              value={draft.role}
              onChange={(e) => set({ role: e.target.value as RoleCode })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            >
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="u-scope" className="mb-1 block text-[11px] font-medium text-gray-600">Affiliate scope</label>
            <select
              id="u-scope"
              value={draft.affiliateCode}
              disabled={!allowGroupScope}
              title={allowGroupScope ? undefined : 'Your account can only provision users for its own affiliate'}
              onChange={(e) => set({ affiliateCode: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none disabled:opacity-70"
            >
              {allowGroupScope && <option value="GROUP">Ecobank Group</option>}
              {affiliates.filter((a) => a.code !== 'GROUP').map((a) => (
                <option key={a.code} value={a.code}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="u-password" className="mb-1 block text-[11px] font-medium text-gray-600">
              Password
            </label>
            <input
              id="u-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isNew ? 'Required' : 'Leave blank to keep current password'}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            />
          </div>
        </div>

        <label htmlFor="u-mfa" className="mt-4 flex items-center gap-2 text-[11px] text-gray-600">
          <input
            id="u-mfa"
            type="checkbox"
            checked={draft.mfaEnrolled}
            onChange={(e) => set({ mfaEnrolled: e.target.checked })}
            className="accent-gold-500"
          />
          Multi-factor authentication enrolled
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : isNew ? 'Create user' : 'Save user'}
          </button>
        </div>
      </div>
    </div>
  );
}
