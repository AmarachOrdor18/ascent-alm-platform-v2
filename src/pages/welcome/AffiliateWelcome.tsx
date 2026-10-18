/**
 * Guided affiliate setup for the Affiliate Admin (/welcome/affiliate, affiliate.manage). Six steps, each saved
 * to the affiliate's 'AFF:<code>' onboarding record as the user moves, so a refresh resumes at the same step:
 * confirm affiliate → data sources → users → configuration → initial data → readiness → Submit for
 * activation (an Affiliates/Activate approval). Once an approver approves, the affiliate is Live.
 * The Organisation Admin can open it for one affiliate with ?affiliate=<code>.
 */
import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { useAffiliateOnboarding } from '@/lib/onboardingHooks';
import { AFFILIATE_STEPS, resumeAffiliateStep, type AffiliateStep } from '@/lib/onboarding';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { approvals } from '@/lib/governanceHooks';
import {
  AFFILIATE_STEP_META,
  ConfigurationStep,
  ConfirmStep,
  DataSourcesStep,
  InitialDataStep,
  ReadinessStep,
  UsersStep,
} from './affiliateSteps';
import { InfoButton } from '@/components/ui/InfoButton';
import { WelcomeLayout, markOnboardingHandled } from './WelcomeLayout';
import { WelcomeIntro } from './WelcomeIntro';

function Progress({ current, done }: { current: AffiliateStep; done: (s: AffiliateStep) => boolean }) {
  const index = AFFILIATE_STEPS.indexOf(current);
  return (
    <nav aria-label="Setup progress" className="mb-6">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">
        Step {index + 1} of {AFFILIATE_STEPS.length}
      </p>
      <ol className="flex gap-2">
        {AFFILIATE_STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isDone = done(s) && !isCurrent;
          return (
            <li key={s} className="flex-1" aria-current={isCurrent ? 'step' : undefined}>
              <div
                className={cn('h-1.5 rounded-full', isCurrent ? 'bg-gold-500' : isDone ? 'bg-success' : 'bg-gray-200')}
              />
              <p className={cn('mt-1.5 text-[12px]', isCurrent ? 'font-bold text-navy-900' : 'text-gray-500')}>
                {isDone ? '✓ ' : `${i + 1}. `}
                {AFFILIATE_STEP_META[s].title}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepIntro({ step }: { step: AffiliateStep }) {
  const meta = AFFILIATE_STEP_META[step];
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

function Submitted({ name, live, pending }: { name: string; live: boolean; pending: boolean }) {
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success text-[22px] font-bold text-white">
        ✓
      </div>
      <h1 className="mt-4 text-[20px] font-bold text-navy-900">
        {live ? `${name} is Live` : 'Submitted for activation'}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
        {live
          ? 'It is included in Group results. Your team can load data and run calculations as normal.'
          : pending
            ? 'An approver will review the request under Approvals. Once approved, the affiliate goes Live. You can keep loading data meanwhile.'
            : 'Setup is complete. Ask an approver to activate the affiliate from Approvals.'}
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

export function AffiliateWelcome() {
  const { user, hasPermission } = useAuth();
  const search = useSearch();
  const requested = new URLSearchParams(search).get('affiliate');
  const code = hasPermission('group.manage') && requested ? requested.toUpperCase() : (user?.affiliateCode ?? null);
  const { data: affiliates = [], isLoading: loadingAffiliates } = useAffiliates();
  const affiliate = affiliates.find((a) => a.code === code && a.code !== 'GROUP') ?? null;
  const { record, isLoading, goTo, markDone, complete } = useAffiliateOnboarding(affiliate?.code);
  const { data: requests = [] } = approvals.useList(affiliate?.code);
  const pending = requests.some((r) => r.status === 'Pending' && r.module === 'Affiliates' && r.action === 'Activate');
  const [step, setStep] = useState<AffiliateStep | null>(null);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (step === null && affiliate && !isLoading) setStep(resumeAffiliateStep(record));
  }, [step, affiliate, isLoading, record]);

  // Being here at all uses up this session's one automatic redirect.
  useEffect(() => markOnboardingHandled(user?.id), [user?.id]);

  if (loadingAffiliates || (affiliate && (isLoading || step === null))) {
    return (
      <WelcomeLayout title="Affiliate setup">
        <p className="text-[13px] text-gray-400">Loading…</p>
      </WelcomeLayout>
    );
  }

  if (!affiliate) {
    return (
      <WelcomeLayout title="Affiliate setup">
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-[13px] text-gray-500">
          {hasPermission('group.manage')
            ? 'Open this page from an affiliate (?affiliate=<code>) to walk through its setup.'
            : 'Your sign-in is not linked to an affiliate yet. Ask your Organisation Admin to assign you to one.'}
        </p>
      </WelcomeLayout>
    );
  }

  if (!started && !finished && affiliate.status !== 'Live' && (!record || record.status === 'NotStarted')) {
    return (
      <WelcomeIntro
        heading={`Let's get ${affiliate.name} ready for its first ALM run.`}
        subheading="Your organisation's defaults are already in place - you only confirm, load your data and check readiness."
        minutes={20}
        steps={[
          { title: 'Confirm your affiliate', detail: 'Check the details your organisation entered.' },
          { title: 'Data sources', detail: 'How your positions and general ledger will arrive.' },
          { title: 'Users & access', detail: 'Add your analysts, approvers and viewers.' },
          { title: 'Configuration', detail: 'See what you inherit from the organisation and adjust what you may.' },
          { title: 'Initial data', detail: 'Upload your positions and general ledger.' },
          { title: 'Readiness check', detail: 'Confirm everything is ready, then submit for activation.' },
        ]}
        onStart={() => setStarted(true)}
      />
    );
  }

  if (finished || record?.status === 'Complete' || affiliate.status === 'Live') {
    return (
      <WelcomeLayout title="Affiliate setup" finishLater={false}>
        <Submitted name={affiliate.name} live={affiliate.status === 'Live'} pending={pending} />
      </WelcomeLayout>
    );
  }

  const current = step!;
  const index = AFFILIATE_STEPS.indexOf(current);
  const next = AFFILIATE_STEPS[index + 1];
  const prev = index > 0 ? AFFILIATE_STEPS[index - 1] : undefined;
  const move = (to: AffiliateStep) => {
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const onContinue = async () => {
    // The next step shows straight away; the progress record finishes saving behind it.
    const saving = markDone(current, next);
    if (next) move(next);
    await saving;
  };
  const onBack = prev
    ? () => {
        void goTo(prev);
        move(prev);
      }
    : undefined;
  const props = { affiliate, onBack, onContinue };

  return (
    <WelcomeLayout title={`Affiliate setup - ${affiliate.name}`}>
      <p className="mb-4 flex items-center gap-2 text-[13px] text-gray-500">
        {affiliate.name} <StatusBadge status={affiliate.status} />
      </p>
      <Progress current={current} done={(s) => !!record?.steps[s]?.done} />
      <StepIntro step={current} />
      {current === 'confirm' && <ConfirmStep {...props} />}
      {current === 'dataSources' && <DataSourcesStep {...props} />}
      {current === 'users' && <UsersStep {...props} />}
      {current === 'configuration' && <ConfigurationStep {...props} />}
      {current === 'initialData' && <InitialDataStep {...props} />}
      {current === 'readiness' && (
        <ReadinessStep
          affiliate={affiliate}
          record={record}
          onBack={onBack}
          onGoTo={(s) => {
            void goTo(s);
            move(s);
          }}
          onSubmitted={async () => {
            await complete();
            setFinished(true);
          }}
        />
      )}
    </WelcomeLayout>
  );
}
