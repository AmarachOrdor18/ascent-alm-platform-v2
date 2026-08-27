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
