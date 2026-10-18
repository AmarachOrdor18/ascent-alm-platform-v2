/**
 * Shared ways to give someone access - used by Organisation setup (Users step), the affiliate's own guided
 * setup (Users step) and Admin → Users & roles:
 *   - InviteUserForm: create a new sign-in with a one-time temporary password (same create_login path as
 *     Users & roles).
 *   - AssignExistingUser: give a person who already has a sign-in a role (and, for the Organisation Admin,
 *     an affiliate) - e.g. make an existing user an affiliate's Affiliate Admin.
 *   - BulkUserUpload: create many sign-ins from one CSV (name, email, role, affiliateCode).
 * No email is sent (no mail server yet): temporary passwords are shown once, and can be downloaded.
 */
import { useMemo, useRef, useState } from 'react';
import { ROLES, canonicalRole } from '@/context/AuthContext';
import { useCreateLogin, useSaveUser } from '@/lib/hooks';
import { generateTemporaryPassword } from '@/lib/tempPassword';
import { hashPassword } from '@/lib/passwordHash';
import { isSupabaseMode } from '@/lib/supabase';
import { parseCsv } from '@/lib/csvImport';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { downloadCsvTemplate } from '@/lib/csvTemplates';
import type { ActiveRoleCode, Affiliate, User } from '@/engine/types';

const input =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';
const label = 'mb-1 block text-[12px] font-bold text-navy-900';
const btnPrimary =
  'rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40';
const btnLink = 'rounded-lg px-3 py-2 text-[13px] font-bold text-gray-500 hover:text-navy-900';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreatedLogin {
  user: User;
  password: string;
}

/** Creates a sign-in (Supabase: create_login; local mode: a hashed password on the user record). */
export function useProvisionUser() {
  const createLogin = useCreateLogin();
  const saveUser = useSaveUser();
  return async (draft: {
    name: string;
    email: string;
    role: ActiveRoleCode;
    affiliateCode: string;
  }): Promise<CreatedLogin> => {
    const password = generateTemporaryPassword();
    const user: User = {
      id: `U-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      passwordHash: '',
      role: draft.role,
      affiliateCode: draft.affiliateCode,
      isActive: true,
      mfaEnrolled: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };
    if (isSupabaseMode) await createLogin.mutateAsync({ user, password });
    else await saveUser.mutateAsync({ ...user, passwordHash: await hashPassword(password) });
    return { user, password };
  };
}

function downloadPasswords(created: CreatedLogin[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [
    'name,email,role,affiliateCode,temporaryPassword',
    ...created.map((c) =>
      [
        c.user.name,
        c.user.email,
        ROLES[canonicalRole(c.user.role)]?.name ?? c.user.role,
        c.user.affiliateCode,
        c.password,
      ]
        .map(esc)
        .join(','),
    ),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'new-sign-ins.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** The one-time temporary passwords just created, with copy and download. */
export function CreatedLoginsNotice({ created, onDone }: { created: CreatedLogin[]; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (created.length === 0) return null;
  const copy = async (c: CreatedLogin) => {
    try {
      await navigator.clipboard.writeText(c.password);
      setCopied(c.user.id);
    } catch {
      setCopied(null);
    }
  };
  return (
    <div role="status" className="rounded-xl border border-success/30 bg-success-bg p-4 text-[13px] text-navy-900">
      <p className="font-bold">{created.length === 1 ? 'Sign-in created' : `${created.length} sign-ins created`}</p>
      <ul className="mt-2 space-y-1">
        {created.map((c) => (
          <li key={c.user.id} className="flex flex-wrap items-center gap-2">
            <span>
              {c.user.name} ({c.user.email}) - {ROLES[canonicalRole(c.user.role)]?.name ?? c.user.role}{' '}
              <span className="font-mono text-[11px] text-gray-500">
                ({c.user.affiliateCode === 'GROUP' ? 'Group' : c.user.affiliateCode})
              </span>
            </span>
            <code className="rounded bg-white px-2 py-0.5 font-mono text-[13px]">{c.password}</code>
            <button
              type="button"
              onClick={() => void copy(c)}
              className="text-[12px] font-bold text-navy-700 hover:underline"
            >
              {copied === c.user.id ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-gray-600">
        Temporary passwords are shown once - share them securely. Each person should change theirs from My Account after
        signing in.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => downloadPasswords(created)}
          className="text-[12px] font-bold text-navy-700 hover:underline"
        >
          Download as CSV
        </button>
        <button type="button" onClick={onDone} className="text-[12px] font-bold text-navy-700 hover:underline">
          Done
        </button>
      </div>
    </div>
  );
}

/** Create one new sign-in. With one role offered, no role picker is shown. */
export function InviteUserForm({
  title,
  affiliateCode,
  roles,
  existingEmails,
  onCancel,
  onCreated,
}: {
  title: string;
  affiliateCode: string;
  roles: ActiveRoleCode[];
  existingEmails: string[];
  onCancel: () => void;
  onCreated: (created: CreatedLogin) => void;
}) {
  const provision = useProvisionUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ActiveRoleCode>(roles[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = email.trim().toLowerCase();
  const emailTaken = trimmed !== '' && existingEmails.includes(trimmed);
  const emailValid = EMAIL_RE.test(trimmed);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await provision({ name, email: trimmed, role, affiliateCode }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The user could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-navy-700/30 bg-navy-50/40 p-4">
      <p className="mb-3 text-[13px] font-bold text-navy-900">{title}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="inv-name" className={label}>
            Name
          </label>
          <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="inv-email" className={label}>
            Work email
          </label>
          <input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          {emailTaken && (
            <p className="mt-1 text-[11px] text-danger">Already in use - use “Assign existing user” instead.</p>
          )}
        </div>
        {roles.length > 1 && (
          <div>
            <label htmlFor="inv-role" className={label}>
              Role
            </label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as ActiveRoleCode)}
              className={input}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-snug text-gray-500">{ROLES[role].description}</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !name.trim() || !emailValid || emailTaken}
          className={btnPrimary}
        >
          {busy ? 'Creating…' : 'Create sign-in'}
        </button>
        <button type="button" onClick={onCancel} className={btnLink}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Give an existing user a role (and move them to `affiliateCode`). */
export function AssignExistingUser({
  title,
  candidates,
  affiliateCode,
  roles,
  onCancel,
  onAssigned,
}: {
  title: string;
  /** People who may be picked - already filtered to who the signed-in user may manage. */
  candidates: User[];
  affiliateCode: string;
  roles: ActiveRoleCode[];
  onCancel: () => void;
  onAssigned: (user: User) => void;
}) {
  const saveUser = useSaveUser();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ActiveRoleCode>(roles[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Group users work across the organisation - they are never moved into one affiliate from here.
  const eligible = useMemo(
    () => candidates.filter((u) => affiliateCode === 'GROUP' || u.affiliateCode !== 'GROUP'),
    [candidates, affiliateCode],
  );
  const picked = eligible.find((u) => u.id === userId);
  const sorted = useMemo(() => [...eligible].sort((a, b) => a.name.localeCompare(b.name)), [eligible]);

  const assign = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const updated: User = { ...picked, role, affiliateCode, isActive: true };
      await saveUser.mutateAsync(updated);
      onAssigned(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The user could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-navy-700/30 bg-navy-50/40 p-4">
      <p className="mb-3 text-[13px] font-bold text-navy-900">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-[13px] text-gray-500">
          There is nobody else you can assign yet - invite a new user instead.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="assign-user" className={label}>
              Person
            </label>
            <select id="assign-user" value={userId} onChange={(e) => setUserId(e.target.value)} className={input}>
              <option value="">- choose -</option>
              {sorted.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) - {ROLES[canonicalRole(u.role)]?.name ?? u.role}, {u.affiliateCode}
                </option>
              ))}
            </select>
          </div>
          {roles.length > 1 && (
            <div>
              <label htmlFor="assign-role" className={label}>
                New role
              </label>
              <select
                id="assign-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ActiveRoleCode)}
                className={input}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r].name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {picked && picked.affiliateCode !== affiliateCode && (
        <p className="mt-2 text-[12px] text-warning">
          {picked.name} will move from {picked.affiliateCode} to {affiliateCode} and only see {affiliateCode}’s data.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void assign()} disabled={busy || !picked} className={btnPrimary}>
          {busy ? 'Saving…' : 'Assign'}
        </button>
        <button type="button" onClick={onCancel} className={btnLink}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface BulkRow {
  line: number;
  name: string;
  email: string;
  role: ActiveRoleCode | null;
  affiliateCode: string;
  problem: string | null;
}

/** Reads a role given as its code ("RISK_ANALYST") or its name ("ALM Analyst", "Viewer"). */
function readRole(value: string): ActiveRoleCode | null {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
  for (const [code, role] of Object.entries(ROLES)) {
    if (code.toLowerCase().replace(/_/g, ' ') === v || role.name.toLowerCase() === v) return code as ActiveRoleCode;
  }
  if (v === 'analyst' || v === 'risk analyst') return 'RISK_ANALYST';
  if (v === 'executive viewer') return 'EXECUTIVE_VIEWER';
  return null;
}

/**
 * Create many sign-ins from one CSV: name, email, role (code or name) and, when the uploader may choose,
 * affiliateCode. Every row is checked before anything is created.
 */
export function BulkUserUpload({
  fixedAffiliateCode,
  affiliates,
  roles,
  existingEmails,
  onCancel,
  onCreated,
}: {
  /** Set for an Affiliate Admin: every row goes to this affiliate and any affiliateCode column is ignored. */
  fixedAffiliateCode?: string;
  /** Affiliates a row may name (Organisation Admin). */
  affiliates: Pick<Affiliate, 'code' | 'name'>[];
  roles: ActiveRoleCode[];
  existingEmails: string[];
  onCancel: () => void;
  onCreated: (created: CreatedLogin[]) => void;
}) {
  const provision = useProvisionUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = rows.filter((r) => !r.problem);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const table = parseCsv(await readUploadAsCsvText(file));
      const header = (table[0] ?? []).map((h) =>
        h
          .trim()
          .toLowerCase()
          .replace(/[\s_-]/g, ''),
      );
      const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const cName = col('name', 'fullname');
      const cEmail = col('email', 'workemail', 'emailaddress');
      const cRole = col('role');
      const cAff = col('affiliatecode', 'affiliate', 'scope');
      if (cName < 0 || cEmail < 0 || cRole < 0) {
        setRows([]);
        setError(
          'The file needs the columns name, email and role (and affiliateCode when you add people to more than one affiliate).',
        );
        return;
      }
      const seen = new Set<string>();
      const parsed: BulkRow[] = table.slice(1).flatMap((cells, i) => {
        if (cells.every((c) => !c.trim())) return [];
        const name = (cells[cName] ?? '').trim();
        const email = (cells[cEmail] ?? '').trim().toLowerCase();
        const role = readRole(cells[cRole] ?? '');
        const affiliateCode = fixedAffiliateCode ?? ((cAff >= 0 ? cells[cAff] : '') ?? '').trim().toUpperCase();
        let problem: string | null = null;
        if (!name) problem = 'Name is missing';
        else if (!EMAIL_RE.test(email)) problem = 'Email is not valid';
        else if (existingEmails.includes(email)) problem = 'Already has a sign-in';
        else if (seen.has(email)) problem = 'Same email appears earlier in the file';
        else if (!role) problem = `Role “${cells[cRole] ?? ''}” not recognised`;
        else if (!roles.includes(role)) problem = `You cannot give the ${ROLES[role].name} role here`;
        else if (!affiliateCode) problem = 'affiliateCode is missing';
        else if (!affiliates.some((a) => a.code === affiliateCode)) problem = `Affiliate ${affiliateCode} not found`;
        seen.add(email);
        return [{ line: i + 2, name, email, role, affiliateCode, problem }];
      });
      setRows(parsed);
      if (parsed.length === 0) setError('The file has no rows.');
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'The file could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const createAll = async () => {
    setBusy(true);
    setError(null);
    const created: CreatedLogin[] = [];
    const failed: string[] = [];
    for (const r of valid) {
      try {
        created.push(await provision({ name: r.name, email: r.email, role: r.role!, affiliateCode: r.affiliateCode }));
      } catch (err) {
        failed.push(`${r.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBusy(false);
    if (failed.length > 0) setError(`Not created: ${failed.join('; ')}`);
    if (created.length > 0) onCreated(created);
  };

  const template = () =>
    downloadCsvTemplate(
      fixedAffiliateCode ? ['name', 'email', 'role'] : ['name', 'email', 'role', 'affiliateCode'],
      fixedAffiliateCode
        ? ['Full name', 'name@bank.com', ROLES[roles[0]!].name]
        : ['Full name', 'name@bank.com', ROLES[roles[0]!].name, 'GROUP'],
      'users-template.csv',
    );

  return (
    <div className="mt-3 rounded-xl border border-navy-700/30 bg-navy-50/40 p-4">
      <p className="text-[13px] font-bold text-navy-900">Add several people from a CSV file</p>
      <p className="mt-1 text-[12px] text-gray-500">
        Columns: <span className="font-mono">name, email, role{fixedAffiliateCode ? '' : ', affiliateCode'}</span>.
        Roles you can give: {roles.map((r) => ROLES[r].name).join(', ')}.{' '}
        <button type="button" onClick={template} className="font-bold text-navy-700 hover:underline">
          Download template
        </button>
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={(e) => void read(e.target.files?.[0])}
          className="text-[13px]"
          aria-label="Users file"
        />
        {fileName && <span className="text-[12px] text-gray-500">{fileName}</span>}
      </div>
      {rows.length > 0 && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-100 bg-white">
          <table className="w-full text-[12px]">
            <thead className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-3 py-1.5">Line</th>
                <th className="px-3 py-1.5">Name</th>
                <th className="px-3 py-1.5">Email</th>
                <th className="px-3 py-1.5">Role</th>
                <th className="px-3 py-1.5">Affiliate</th>
                <th className="px-3 py-1.5">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.line}>
                  <td className="px-3 py-1.5 font-mono text-gray-400">{r.line}</td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 font-mono">{r.email}</td>
                  <td className="px-3 py-1.5">{r.role ? ROLES[r.role].name : '-'}</td>
                  <td className="px-3 py-1.5 font-mono">{r.affiliateCode}</td>
                  <td className={r.problem ? 'px-3 py-1.5 text-danger' : 'px-3 py-1.5 text-success'}>
                    {r.problem ?? 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void createAll()}
          disabled={busy || valid.length === 0}
          className={btnPrimary}
        >
          {busy ? 'Creating…' : `Create ${valid.length} sign-in${valid.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" onClick={onCancel} className={btnLink}>
          Cancel
        </button>
        {rows.length > valid.length && (
          <span className="self-center text-[12px] text-gray-500">
            {rows.length - valid.length} row(s) with a problem will be skipped.
          </span>
        )}
      </div>
    </div>
  );
}
