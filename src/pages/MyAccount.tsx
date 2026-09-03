import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useRoles, useSaveUser } from '@/lib/hooks';
import { hashPassword } from '@/lib/passwordHash';
import { formatDate } from '@/lib/format';

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-[11px] text-gray-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full max-w-sm rounded border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

export function MyAccount() {
  const { user, role, login } = useAuth();
  const { data: roles = [] } = useRoles();
  const save = useSaveUser();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  if (!user) return null;

  const handleSaveProfile = async () => {
    await save.mutateAsync({ ...user, name: name.trim(), email: email.trim().toLowerCase() });
    login({ ...user, name: name.trim(), email: email.trim().toLowerCase() });
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== user.passwordHash) {
      setPasswordError('Current password is incorrect.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await save.mutateAsync({ ...user, passwordHash });
    login({ ...user, passwordHash });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSaved(true);
    window.setTimeout(() => setPasswordSaved(false), 2500);
  };

  return (
    <>
      <ModuleHeader
        title="My Account"
        description="Your own profile and credentials - separate from any affiliate's configuration."
        asOfDate={null}
        scope={role?.name}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SettingsCard title="Profile">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={save.isPending || name.trim() === '' || email.trim() === ''}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {save.isPending ? 'Saving…' : 'Save profile'}
            </button>
            {profileSaved && <span className="text-[11px] font-bold text-success">Saved ✓</span>}
          </div>
        </SettingsCard>

        <SettingsCard title="Password">
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {passwordError && <p className="text-[11px] text-danger">{passwordError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleChangePassword()}
              disabled={save.isPending || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {save.isPending ? 'Saving…' : 'Change password'}
            </button>
            {passwordSaved && <span className="text-[11px] font-bold text-success">Saved ✓</span>}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Security"
          description="Multi-factor enrollment status - this environment has no live MFA provider, so this reflects the on-file status only."
        >
          <div className="flex items-center gap-3">
            <StatusBadge
              status={user.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}
              tone={user.mfaEnrolled ? 'success' : 'neutral'}
            />
          </div>
        </SettingsCard>

        <SettingsCard title="Account details">
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-gray-500">Role</dt>
              <dd className="font-medium text-navy-900">{roles.find((r) => r.code === user.role)?.name ?? user.role}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Affiliate</dt>
              <dd className="font-medium text-navy-900">{user.affiliateCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last sign-in</dt>
              <dd className="font-mono text-gray-500">
                {user.lastLoginAt ? formatDate(user.lastLoginAt.slice(0, 10)) : '-'}
              </dd>
            </div>
          </dl>
        </SettingsCard>
      </div>
    </>
  );
}
