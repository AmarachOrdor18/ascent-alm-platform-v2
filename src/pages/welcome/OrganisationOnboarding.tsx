/**
 * Guided organisation set-up for the Organisation Admin (/welcome/organisation, group.manage). Six steps,
 * each saved to the 'ORG' onboarding record as the user moves, so a refresh resumes at the same step.
 * The same steps stay editable afterwards under Admin → Organisation setup → Organisation & defaults.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useOrgOnboarding } from '@/lib/onboardingHooks';
import { ORG_STEPS, resumeStep, type OrgStep } from '@/lib/onboarding';
import { AffiliatesStep, DefaultsStep, ORG_STEP_META, OrganisationStep, ReviewStep } from './orgSteps';
import { InfoButton } from '@/components/ui/InfoButton';
import { WelcomeLayout, markOnboardingHandled } from './WelcomeLayout';
import { WelcomeIntro } from './WelcomeIntro';

function Progress({ current, done }: { current: OrgStep; done: (s: OrgStep) => boolean }) {
  // current may be an Admin-page-only step ('assumptions') on a restored record - then it is simply
  // -1 and not shown as a step number.
  const index = ORG_STEPS.indexOf(current as (typeof ORG_STEPS)[number]);
  return (
    <nav aria-label="Setup progress" className="mb-6">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">
        Step {index + 1} of {ORG_STEPS.length}
      </p>
      <ol className="flex gap-2">
        {ORG_STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isDone = done(s) && !isCurrent;
          return (
            <li key={s} className="flex-1" aria-current={isCurrent ? 'step' : undefined}>
              <div
                className={cn('h-1.5 rounded-full', isCurrent ? 'bg-gold-500' : isDone ? 'bg-success' : 'bg-gray-200')}
              />
              <p className={cn('mt-1.5 text-[12px]', isCurrent ? 'font-bold text-navy-900' : 'text-gray-500')}>
                {isDone ? '✓ ' : `${i + 1}. `}
                {ORG_STEP_META[s].title}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepIntro({ step }: { step: OrgStep }) {
  const meta = ORG_STEP_META[step];
  const rows: Array<[string, string]> = [
    ['What', meta.what],
    ['Why', meta.why],
    ['What’s needed', meta.needed],
    ['What next', meta.next],
  ];
  return (
    <h1 className="mb-5 flex items-center gap-2 text-[22px] font-bold text-navy-900">
      {meta.title}
      <InfoButton label={`About ${meta.title}`}>
        <dl className="space-y-2 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className="leading-relaxed text-gray-600">{v}</dd>
            </div>
          ))}
        </dl>
      </InfoButton>
    </h1>
  );
}

function OrganisationReady() {
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success text-[22px] font-bold text-white">
        ✓
      </div>
      <h1 className="mt-4 text-[20px] font-bold text-navy-900">Organisation ready</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
        The organisation is set up. Affiliate Admins are guided through their own affiliate setup when they sign in, and
        you can revisit any of these settings under Admin → Organisation setup.
      </p>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="mt-6 rounded-lg bg-navy-900 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-navy-700"
      >
        Go to Home
      </button>
    </div>
  );
}

export function OrganisationOnboarding() {
  const { user } = useAuth();
  const { record, isLoading, goTo, markDone, complete } = useOrgOnboarding();
  const [step, setStep] = useState<OrgStep | null>(null);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  // Resume where the saved record says, once it has loaded.
  useEffect(() => {
    if (step === null && !isLoading) setStep(resumeStep(record));
  }, [step, isLoading, record]);

  // Being here at all uses up this session's one automatic redirect.
  useEffect(() => markOnboardingHandled(user?.id), [user?.id]);

  if (isLoading || step === null) {
    return (
      <WelcomeLayout title="Organisation setup">
        <p className="text-[13px] text-gray-400">Loading…</p>
      </WelcomeLayout>
    );
  }

  if (!started && !finished && (!record || record.status === 'NotStarted')) {
    return (
      <WelcomeIntro
        heading="Let's get your organisation ready."
        subheading="Set up the organisation once. Each affiliate's own team then completes its setup and loads its data."
        minutes={10}
        steps={[
          { title: 'Organisation', detail: 'Name, reporting currency and reporting calendar.' },
          {
            title: 'Affiliates & people',
            detail: 'Add each affiliate with its basic details, invite its admin, then upload the team with a CSV.',
          },
          {
            title: 'Organisation defaults',
            detail:
              'Limits, FTP method and currencies every affiliate inherits. Assumptions ship pre-set and stay editable under Admin → Organisation setup.',
          },
          { title: 'Review', detail: 'Check everything, then open the Group dashboard.' },
        ]}
        onStart={() => setStarted(true)}
      />
    );
  }

  if (finished || record?.status === 'Complete') {
    return (
      <WelcomeLayout title="Organisation setup" finishLater={false}>
        <OrganisationReady />
      </WelcomeLayout>
    );
  }

  const index = ORG_STEPS.indexOf(step as (typeof ORG_STEPS)[number]);
  const next = ORG_STEPS[index + 1];
  const prev = index > 0 ? ORG_STEPS[index - 1] : undefined;
  const move = async (to: OrgStep) => {
    setStep(to);
    // This layout scrolls itself (WelcomeLayout's #onboarding-scroll), not the window - so reset the
    // container, or the next step opens at the previous step's scroll position.
    document.getElementById('onboarding-scroll')?.scrollTo({ top: 0 });
  };
  const onContinue = async () => {
    // The next step shows straight away; the progress record finishes saving behind it.
    const saving = markDone(step, next);
    if (next) void move(next);
    await saving;
  };
  const onBack = prev
    ? () => {
        void goTo(prev);
        void move(prev);
      }
    : undefined;
  const props = { mode: 'wizard' as const, onBack, onContinue };

  return (
    <WelcomeLayout title="Organisation setup">
      {/* The step rail and title stay pinned while the step's content scrolls under them.
          top-16 clears the now-sticky header in WelcomeLayout so the two stack. */}
      <div className="sticky top-16 z-10 -mx-6 bg-gray-50 px-6 pb-2 pt-2">
        <Progress current={step} done={(s) => !!record?.steps[s]?.done} />
        <StepIntro step={step} />
      </div>
      {step === 'organisation' && <OrganisationStep {...props} />}
      {step === 'affiliates' && <AffiliatesStep {...props} />}
      {step === 'settings' && <DefaultsStep {...props} />}
      {step === 'review' && (
        <ReviewStep
          {...props}
          record={record}
          onGoTo={(s) => {
            void goTo(s);
            void move(s);
          }}
          onComplete={async () => {
            await complete();
            setFinished(true);
          }}
        />
      )}
    </WelcomeLayout>
  );
}
