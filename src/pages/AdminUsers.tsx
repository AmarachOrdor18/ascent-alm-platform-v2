/**
 * Users & Roles — screen 56.
 *
 * Reads the real user register rather than a fabricated list. The six roles
 * and their permissions are the ones the application actually gates on, so
 * what this screen shows about a role is what that role can do — the sidebar
 * and every action button read the same table.
 */

import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth, ROLES } from '@/context/AuthContext';
import { useAffiliates, useUsers, useSaveUser } from '@/lib/hooks';
import type { RoleCode, User } from '@/engine/types';

/** ROLES is keyed by code; the screen wants them in a stable order. */
const ROLE_LIST = Object.values(ROLES);

function newId(): string {
  return `U-${Date.now().toString(36).toUpperCase()}`;
}

const BLANK_USER: User = {
  id: '',
  name: '',
  email: '',
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
  const save = useSaveUser();
  const canEdit = hasPermission('admin.users');

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const active = users.filter((u) => u.isActive);
  const withoutMfa = active.filter((u) => !u.mfaEnrolled);
  const byRole = useMemo(() => {
    const m = new Map<RoleCode, number>();
    for (const u of users) m.set(u.role, (m.get(u.role) ?? 0) + 1);
    return m;
  }, [users]);

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
      render: (u) => <StatusBadge status={ROLE_LIST.find((r) => r.code === u.role)?.name ?? u.role} tone="neutral" />,
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
          { label: 'Users', value: String(users.length) },
          { label: 'Active', value: String(active.length) },
          {
            label: 'Without MFA',
            value: String(withoutMfa.length),
            tone: withoutMfa.length > 0 ? 'warning' : 'success',
          },
          { label: 'Roles in use', value: `${byRole.size} of ${ROLE_LIST.length}` },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!canEdit}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New user
          </button>
        }
      />

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Users</h2>
        <ResultTable
          rows={users}
          columns={columns}
          rowKey={(u) => u.id}
          emptyMessage={isLoading ? 'Loading…' : 'No users in the register.'}
          renderDetail={(u) => {
            const role = ROLE_LIST.find((r) => r.code === u.role);
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
                    disabled={!canEdit}
                    className="rounded border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || u.id === signedIn?.id}
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
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Roles</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ROLE_LIST.map((r) => (
            <div key={r.code} className="rounded-lg border border-gray-100 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-bold text-navy-900">{r.name}</p>
                <span className="text-[11px] text-gray-400">{byRole.get(r.code) ?? 0} user(s)</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{r.description}</p>
              <p className="mt-2 font-mono text-[10px] text-gray-400">{r.permissions.length} permissions</p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
          Roles are fixed in this build; users move between them. Sign in as any of them to see the effect — the
          navigation, the action buttons and the run controls all read this same permission set, so a Reporting user
          genuinely cannot execute a run.
        </p>
      </section>

      {editing && (
        <UserEditor
          user={editing}
          affiliates={affiliates}
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
          user={{ ...BLANK_USER, id: newId(), createdAt: new Date().toISOString() }}
          affiliates={affiliates}
          existingEmails={users.map((u) => u.email.toLowerCase())}
          isNew
          onCancel={() => setCreating(false)}
          onSave={async (next) => {
            await save.mutateAsync(next);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function UserEditor({
  user,
  affiliates,
  existingEmails,
  isNew,
  onCancel,
  onSave,
}: {
  user: User;
  affiliates: Array<{ code: string; name: string }>;
  existingEmails: string[];
  isNew?: boolean;
  onCancel: () => void;
  onSave: (u: User) => Promise<void>;
}) {
  const [draft, setDraft] = useState(user);
  const set = (patch: Partial<User>) => setDraft((d) => ({ ...d, ...patch }));

  const emailTaken = draft.email.trim() !== '' && existingEmails.includes(draft.email.trim().toLowerCase());
  const canSave = draft.name.trim() !== '' && draft.email.trim() !== '' && !emailTaken;

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
              {ROLE_LIST.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="u-scope" className="mb-1 block text-[11px] font-medium text-gray-600">Affiliate scope</label>
            <select
              id="u-scope"
              value={draft.affiliateCode}
              onChange={(e) => set({ affiliateCode: e.target.value })}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
            >
              <option value="GROUP">Ecobank Group</option>
              {affiliates.filter((a) => a.code !== 'GROUP').map((a) => (
                <option key={a.code} value={a.code}>{a.name}</option>
              ))}
            </select>
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
            onClick={() => void onSave(draft)}
            disabled={!canSave}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isNew ? 'Create user' : 'Save user'}
          </button>
        </div>
      </div>
    </div>
  );
}
