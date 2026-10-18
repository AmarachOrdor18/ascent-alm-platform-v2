/**
 * Admin → Organisation setup → Organisation & defaults: the same six steps as the guided onboarding, as an
 * editable, non-forced page. Saving a step marks it done on the 'ORG' onboarding record.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/cn';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useOrgOnboarding } from '@/lib/onboardingHooks';
import { ORG_SETUP_STEPS, orgProgressPercent, type OrgStep } from '@/lib/onboarding';
import {
  AffiliatesStep,
  AssumptionsStep,
  DefaultsStep,
  ORG_STEP_META,
  OrganisationStep,
  ReviewStep,
} from '@/pages/welcome/orgSteps';

export function OrganisationSetup() {
  const { record, markDone, complete } = useOrgOnboarding();
  const [step, setStep] = useState<OrgStep>('organisation');
  const status = record?.status ?? 'NotStarted';
  const props = {
    mode: 'page' as const,
    onContinue: async () => {
      await markDone(step);
    },
  };

  return (
    <>
      <ModuleHeader
        title="Organisation"
        description="The organisation’s details, affiliates, defaults and Group assumptions - editable at any time."
        asOfDate={null}
        metrics={[
          {
            label: 'Setup',
            value: `${orgProgressPercent(record)}%`,
            tone: status === 'Complete' ? 'success' : 'warning',
          },
          {
            label: 'Status',
            value: status === 'Complete' ? 'Complete' : status === 'InProgress' ? 'In progress' : 'Not started',
          },
        ]}
        actions={
          status !== 'Complete' ? (
            <Link
              href="/welcome/organisation"
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
            >
              Resume guided setup
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Organisation setup steps">
          <ol className="space-y-1">
            {ORG_SETUP_STEPS.map((s, i) => {
              const done = !!record?.steps[s]?.done || status === 'Complete';
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setStep(s)}
                    aria-current={s === step ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px]',
                      s === step ? 'bg-navy-900 font-bold text-white' : 'text-navy-900 hover:bg-gray-100',
                    )}
                  >
                    <span className={cn('w-4 text-center', done && s !== step && 'text-success')}>
                      {done ? '✓' : i + 1}
                    </span>
                    {ORG_STEP_META[s].title}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 px-3">
            <StatusBadge
              status={status === 'Complete' ? 'Complete' : 'In setup'}
              tone={status === 'Complete' ? 'success' : 'warning'}
            />
          </div>
        </nav>
        <div>
          {step === 'organisation' && <OrganisationStep {...props} />}
          {step === 'affiliates' && <AffiliatesStep {...props} />}
          {step === 'settings' && <DefaultsStep {...props} />}{' '}
          {step === 'assumptions' && <AssumptionsStep {...props} />}
          {step === 'review' && (
            <ReviewStep
              {...props}
              record={record}
              onGoTo={setStep}
              onComplete={async () => {
                await complete();
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
