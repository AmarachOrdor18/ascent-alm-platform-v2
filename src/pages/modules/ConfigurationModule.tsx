/**
 * Configuration module.
 *
 * "Business Rules" is the existing hub screen (`/rules` today) — its own 13
 * `RuleKind` sub-editors are unlisted, deep-linked screens reached by
 * clicking through the hub, and are untouched by this redesign; only the
 * hub's own address moves.
 *
 * Validation Rules needs `data.configure`; Business Rules needs
 * `rules.edit`. Every role with `data.configure` also has `rules.edit` in
 * the current permission model, so the module route gates on `rules.edit`.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const ModelsAssumptions = lazy(() =>
  import('@/pages/rules/ModelsAssumptions').then((m) => ({ default: m.ModelsAssumptions })),
);
const ValidationRules = lazy(() => import('@/pages/ValidationRules').then((m) => ({ default: m.ValidationRules })));

const TABS: ModuleTab[] = [
  { key: 'business-rules', label: 'Business Rules', path: '/configuration', permission: 'rules.edit', Component: ModelsAssumptions },
  { key: 'validation-rules', label: 'Validation Rules', path: '/configuration/validation-rules', permission: 'data.configure', Component: ValidationRules },
];

export function ConfigurationModule() {
  return <ModuleTabs tabs={TABS} />;
}
