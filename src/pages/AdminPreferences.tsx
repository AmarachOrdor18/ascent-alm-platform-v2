import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { useAuth } from '@/context/AuthContext';
import { reseed } from '@/data/seed/bootstrap';
import { supabase } from '@/lib/supabase';
import { isSupabaseMode, repository } from '@/store/repositoryInstance';

type Mode = 'onboarding' | 'all';

/** Admin → Reset platform: start organisation onboarding again, or erase everything and start afresh. */
export function AdminPreferences() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'ADMIN';
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = async (mode: Mode) => {
    setBusy(mode);
    setError(null);
    try {
      if (isSupabaseMode) {
        const { error: rpcError } = await supabase().rpc('reset_platform', { p_mode: mode });
        if (rpcError) throw new Error(rpcError.message);
      } else if (mode === 'all') {
        await reseed(repository);
      }
      // Every cache, the scope and the onboarding gate must re-read the database from zero.
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <>
      <ModuleHeader title="Reset platform" asOfDate={null} />
      {!isOrgAdmin ? (
        <p className="text-[13px] text-gray-500">Only an Organisation Admin can reset the platform.</p>
      ) : (
        <div className="grid max-w-3xl grid-cols-1 gap-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-[14px] font-bold text-navy-900">Restart organisation onboarding</h3>
            <p className="mt-1 text-[13px] text-gray-500">Keeps all data. The setup wizard opens again.</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void reset('onboarding')}
              className="mt-4 rounded-lg border border-navy-900 px-4 py-2 text-[13px] font-bold text-navy-900 hover:bg-navy-50 disabled:opacity-40"
            >
              {busy === 'onboarding' ? 'Restarting…' : 'Restart onboarding'}
            </button>
          </section>

          <section className="rounded-2xl border border-danger/30 bg-danger/5 p-6">
            <h3 className="text-[14px] font-bold text-danger">Erase everything and start afresh</h3>
            <p className="mt-1 text-[13px] text-navy-900">
              Removes every affiliate, upload, rule change, run, approval, notification and added user. The seed logins
              stay. This cannot be undone.
            </p>
            <label htmlFor="reset-confirm" className="mt-4 block text-[12px] font-medium text-gray-600">
              Type RESET to confirm
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                id="reset-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-40 rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
              <button
                type="button"
                disabled={confirmText !== 'RESET' || busy !== null}
                onClick={() => void reset('all')}
                className="rounded-lg bg-danger px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy === 'all' ? 'Erasing…' : 'Erase everything'}
              </button>
            </div>
          </section>
          {error && <p className="text-[13px] font-bold text-danger">{error}</p>}
        </div>
      )}
    </>
  );
}
