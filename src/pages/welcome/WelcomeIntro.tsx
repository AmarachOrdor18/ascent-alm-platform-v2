import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { markOnboardingHandled } from './WelcomeLayout';

export interface IntroStep {
  title: string;
  detail: string;
}

/**
 * The first thing a new admin sees: who they are setting up, what it involves and how long it takes,
 * before step 1. Full page, no app chrome - the same visual language as the sign-in screen.
 */
export function WelcomeIntro({
  heading,
  subheading,
  steps,
  minutes,
  onStart,
}: {
  heading: string;
  subheading: string;
  steps: IntroStep[];
  minutes: number;
  onStart: () => void;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const firstName = user?.name.split(' ')[0] ?? '';

  const later = () => {
    markOnboardingHandled(user?.id);
    navigate('/dashboard');
  };

  return (
    <div className="flex h-full w-full overflow-y-auto">
      <div className="hidden w-[42%] flex-col bg-navy-900 px-14 py-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white p-1">
            <img src="/logo-icon.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-[20px] font-bold tracking-wide">Ecobank</p>
            <p className="text-[13px] text-white/60">ALM Platform</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[14px] uppercase tracking-wide text-gold-400">
            Welcome{firstName ? `, ${firstName}` : ''}
          </p>
          <div className="mt-3 h-1 w-10 rounded-full bg-gold-500" />
          <h1 className="mt-8 text-[38px] font-bold leading-[1.15]">{heading}</h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/75">{subheading}</p>
        </div>
        <p className="text-[13px] text-white/40">Powered by Qucoon Limited</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-lg">
          <h2 className="text-[26px] font-bold text-navy-900">Here&rsquo;s what we&rsquo;ll set up</h2>
          <p className="mt-2 text-[15px] text-gray-500">
            About {minutes} minutes. Your progress is saved after every step, so you can stop and come back any time.
          </p>

          <ol className="mt-8 space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[14px] font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-navy-900">{s.title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-gray-500">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onStart}
              className="rounded-lg bg-gold-500 px-8 py-3.5 text-[15px] font-bold text-navy-900 shadow-sm hover:bg-gold-400"
            >
              Get started
            </button>
            <button
              type="button"
              onClick={later}
              className="text-[15px] font-semibold text-gray-500 hover:text-navy-900"
            >
              I&rsquo;ll do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-page "preparing" screen shown while sign-in decides where the user lands - no app chrome flash. */
export function PreparingWorkspace() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center bg-gray-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-navy-900 p-2">
        <img src="/logo-icon.png" alt="" className="h-full w-full rounded bg-white object-contain p-0.5" />
      </div>
      <p className="mt-6 text-[15px] font-semibold text-navy-900">Preparing your workspace…</p>
      <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gold-500" />
      </div>
    </div>
  );
}
