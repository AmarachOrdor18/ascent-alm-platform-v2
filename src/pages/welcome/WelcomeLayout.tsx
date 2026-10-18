import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { onboardingHandledKey } from '@/lib/onboarding';

/** Records that this session's onboarding redirect is used up (redirected once, or "Finish later"). */
export function markOnboardingHandled(userId: string | undefined) {
  if (!userId) return;
  try {
    sessionStorage.setItem(onboardingHandledKey(userId), '1');
  } catch {
    /* storage unavailable - the gate then simply redirects again next time */
  }
}

/** The focused, full-page frame for onboarding: logo, title, "Finish later" - no sidebar, no clutter. */
export function WelcomeLayout({
  title,
  children,
  finishLater = true,
}: {
  title: string;
  children: ReactNode;
  finishLater?: boolean;
}) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  return (
    // html/body don't scroll (index.css pins them for AppShell), so this full-page layout scrolls itself.
    // id shared by both welcome flows (organisation / affiliate), which reset it on step change.
    <div id="onboarding-scroll" className="h-full overflow-y-auto bg-gray-50">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 p-1">
          <img src="/logo-icon.png" alt="Ecobank" className="h-full w-full object-contain" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-navy-900">Ecobank ALM Platform</span>
          <span className="text-[11px] text-gray-500">{title}</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[12px]">
          {user && <span className="text-gray-500">{user.name}</span>}
          {finishLater && (
            <button
              type="button"
              onClick={() => {
                markOnboardingHandled(user?.id);
                navigate('/dashboard');
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700"
            >
              Finish later
            </button>
          )}
          <button type="button" onClick={logout} className="font-bold text-gray-500 hover:text-navy-900">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
