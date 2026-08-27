import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader, type HeaderMetric } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import type { Dependency } from '@/store/repository';
import type { AccessType, RuleMeta } from '@/engine/types';

export interface RuleEditorProps<T extends RuleMeta> {
  title: string;
  description: string;
  /** What one of these rules is called, singular and lower case. */
  noun: string;
  rules: T[];
  isLoading?: boolean;
  /** A blank rule, ready to edit. */
  createDefault: () => T;
  /** The rule-specific form. The only part written per rule type. */
  renderBody: (rule: T, update: (patch: Partial<T>) => void, readOnly: boolean) => ReactNode;
  /** Optional one-line summary shown in the list. */
  summarise?: (rule: T) => string;
  /** Blocking problems that prevent saving, shown inline. */
  validate?: (rule: T) => string | null;
  onSave: (rule: T) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  checkDependencies: (id: string) => Promise<Dependency[]>;
  extraMetrics?: HeaderMetric[];
  /** Explains what this rule governs, shown above the list. */
  guidance?: ReactNode;
}

export function RuleEditor<T extends RuleMeta>({
  title,
  description,
  noun,
  rules,
  isLoading,
  createDefault,
  renderBody,
  summarise,
  validate,
  onSave,
  onDelete,
  checkDependencies,
  extraMetrics,
  guidance,
}: RuleEditorProps<T>) {
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('rules.edit');

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const isNew = draft !== null && !rules.some((r) => r.id === draft.id);

  // Read-Only rules are owned elsewhere (typically the Group default folder).
  const readOnly = !canEdit || (editing?.accessType === 'Read-Only' && !isNew);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.folder.toLowerCase().includes(q),
    );
  }, [rules, query]);

  const validationError = editing && validate ? validate(editing) : null;

  const update = (patch: Partial<T>) => {
    setDraft((prev) => ({ ...(prev ?? selected!), ...patch }) as T);
  };

  const handleCreate = () => {
    setDraft(createDefault());
    setSelectedId(null);
    setDependencies(null);
    setNotice(null);
  };

  const handleSelect = (rule: T) => {
    setSelectedId(rule.id);
    setDraft(null);
    setDependencies(null);
    setNotice(null);
  };

  const handleSave = async () => {
    if (!editing || validationError) return;
    setSaving(true);
    try {
      await onSave({
        ...editing,
        version: isNew ? 1 : editing.version + 1,
        updatedBy: user?.name ?? 'unknown',
        updatedAt: new Date().toISOString(),
      });
      setSelectedId(editing.id);
      setDraft(null);
      setNotice(isNew ? `${noun} created.` : `${noun} saved as version ${editing.version + 1}.`);
    } finally {
      setSaving(false);
    }
  };

  /** Oracle's "Save As": copy an existing rule as the basis for a new one. */
  const handleCopy = () => {
    if (!editing) return;
    const copy = {
      ...editing,
      id: `${editing.id}-COPY-${Date.now().toString(36)}`,
      name: `${editing.name} (copy)`,
      version: 1,
      accessType: 'Read-Write' as AccessType,
      createdBy: user?.name ?? 'unknown',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
    } as T;
    setDraft(copy);
    setSelectedId(null);
    setNotice('Copied. Give it a name and save to create it.');
  };

  const handleDelete = async () => {
    if (!selected) return;
    const deps = await checkDependencies(selected.id);
    setDependencies(deps);
    if (deps.length > 0) return;
    await onDelete(selected.id);
    setSelectedId(null);
    setDraft(null);
    setNotice(`${noun} deleted.`);
  };

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <>
      <ModuleHeader
        title={title}
        description={description}
        asOfDate={null}
        scope={editing ? editing.folder : 'All folders'}
        metrics={[
          { label: `${noun}s`, value: String(rules.length) },
          { label: 'Active', value: String(activeCount) },
          ...(extraMetrics ?? []),
        ]}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
            >
              New {noun}
            </button>
          ) : null
        }
      />

      {guidance && (
        <div className="mb-6 rounded-lg bg-navy-50 px-4 py-3 text-[12px] leading-relaxed text-navy-900">{guidance}</div>
      )}

      {notice && (
        <div role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-2.5 text-[12px] text-success">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Summary page */}
        <section className="lg:col-span-1">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
              <label
                htmlFor="rule-search"
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
              >
                Search
              </label>
              <input
                id="rule-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Name, description or folder…`}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>

            <ul className="max-h-[32rem] overflow-y-auto">
              {filtered.length === 0 && (
                <li className="p-6 text-center text-[12px] text-gray-400">
                  {isLoading ? 'Loading…' : rules.length === 0 ? `No ${noun}s defined yet.` : 'No matches.'}
                </li>
              )}
              {filtered.map((rule) => (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(rule)}
                    aria-current={selectedId === rule.id ? 'true' : undefined}
                    className={cn(
                      'w-full border-b border-gray-50 p-3 text-left transition-colors',
                      selectedId === rule.id ? 'bg-navy-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-bold text-navy-900">{rule.name}</span>
                      {!rule.isActive && <StatusBadge status="Inactive" tone="neutral" />}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-gray-500">
                      <span className="font-mono">{rule.folder}</span>
                      <span aria-hidden="true">·</span>
                      <span>v{rule.version}</span>
                      {rule.accessType === 'Read-Only' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-warning">read-only</span>
                        </>
                      )}
                      {rule.affiliateCode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{rule.affiliateCode}</span>
                        </>
                      )}
                    </span>
                    {summarise && (
                      <span className="mt-1 block truncate text-[11px] text-gray-500">{summarise(rule)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Detail page */}
        <section className="lg:col-span-2">
          {!editing ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-[13px] font-bold text-navy-900">No {noun} selected</p>
              <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
                Choose one from the list to view or edit it, or create a new one. Every rule here behaves the same way —
                search, edit, copy, delete, check dependencies.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-5">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="rule-name"
                    className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Name
                  </label>
                  <input
                    id="rule-name"
                    value={editing.name}
                    disabled={readOnly}
                    onChange={(e) => update({ name: e.target.value } as Partial<T>)}
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] font-bold text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                  />
                  <label
                    htmlFor="rule-desc"
                    className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Description
                  </label>
                  <input
                    id="rule-desc"
                    value={editing.description}
                    disabled={readOnly}
                    onChange={(e) => update({ description: e.target.value } as Partial<T>)}
                    placeholder="What this rule is for, and when to use it"
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                  />
                </div>
              </div>

              {/* Governance: folder, access type, activation */}
              <div className="mb-5 grid grid-cols-1 gap-4 border-b border-gray-100 pb-5 md:grid-cols-3">
                <div>
                  <label
                    htmlFor="rule-folder"
                    className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Folder
                  </label>
                  <input
                    id="rule-folder"
                    value={editing.folder}
                    disabled={readOnly}
                    onChange={(e) => update({ folder: e.target.value } as Partial<T>)}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-access"
                    className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Access type
                  </label>
                  <select
                    id="rule-access"
                    value={editing.accessType}
                    disabled={!canEdit}
                    onChange={(e) => update({ accessType: e.target.value as AccessType } as Partial<T>)}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                  >
                    <option value="Read-Write">Read-Write</option>
                    <option value="Read-Only">Read-Only</option>
                  </select>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Status
                  </span>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="rule-active"
                      type="checkbox"
                      checked={editing.isActive}
                      disabled={readOnly}
                      onChange={(e) => update({ isActive: e.target.checked } as Partial<T>)}
                      className="accent-gold-500"
                    />
                    <label htmlFor="rule-active" className="cursor-pointer text-[12px] text-navy-900">
                      Active
                    </label>
                  </div>
                </div>
              </div>

              {readOnly && editing.accessType === 'Read-Only' && (
                <div className="mb-5 rounded-lg bg-warning-bg px-4 py-2.5 text-[11px] leading-relaxed text-warning">
                  This rule is marked read-only. Copy it to create an editable version in your own folder rather than
                  changing a Group standard in place.
                </div>
              )}

              {/* The rule-specific part */}
              <div className="mb-5">{renderBody(editing, update, readOnly)}</div>

              {validationError && (
                <div role="alert" className="mb-4 rounded-lg bg-danger-bg px-4 py-2.5 text-[12px] text-danger">
                  {validationError}
                </div>
              )}

              {dependencies !== null && (
                <div
                  role="alert"
                  className={cn(
                    'mb-4 rounded-lg px-4 py-3 text-[12px] leading-relaxed',
                    dependencies.length > 0 ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success',
                  )}
                >
                  {dependencies.length === 0 ? (
                    <>Nothing references this {noun} — it is safe to delete.</>
                  ) : (
                    <>
                      <span className="font-bold">
                        Cannot delete: {dependencies.length} thing{dependencies.length === 1 ? '' : 's'} still reference
                        this {noun}.
                      </span>
                      <ul className="mt-2 space-y-0.5">
                        {dependencies.map((d) => (
                          <li key={d.ruleId}>
                            {d.ruleName} <span className="opacity-70">({d.relation})</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
                <p className="text-[11px] text-gray-400">
                  {isNew ? (
                    'Not yet saved'
                  ) : (
                    <>
                      Version {editing.version} · created by {editing.createdBy} on{' '}
                      {formatDate(editing.createdAt.slice(0, 10))}
                      {editing.updatedBy && ` · last edited by ${editing.updatedBy}`}
                    </>
                  )}
                </p>

                <div className="flex items-center gap-2">
                  {!isNew && (
                    <>
                      <button
                        type="button"
                        onClick={() => void checkDependencies(editing.id).then(setDependencies)}
                        className="rounded-lg px-3 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                      >
                        Check dependencies
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!canEdit}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                      >
                        Save as
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={!canEdit}
                        className="rounded-lg px-3 py-2 text-[12px] font-bold text-danger hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {draft && (
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="rounded-lg px-3 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={readOnly || saving || draft === null || validationError !== null}
                    title={validationError ?? undefined}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isNew ? `Create ${noun}` : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Small labelled input, used by rule bodies so they stay short. */
export function RuleField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-gray-600">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{hint}</p>}
    </div>
  );
}

export const ruleInput =
  'w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50';

export const ruleNumber = `${ruleInput} text-right font-mono`;
