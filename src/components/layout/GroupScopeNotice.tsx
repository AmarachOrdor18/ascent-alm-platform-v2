/**
 * Shown on single-entity screens when the global scope switcher is left on
 * "Ecobank Group (Consolidated)".
 *
 * Upload, reconciliation, connector configuration and validation rules all
 * operate on one affiliate's data. Nothing on those screens previously said
 * which affiliate that was beyond a small line in the module header, so a
 * silent fallback read as confusing at best — and for GL Reconciliation, the
 * Group record's own USD currency reached a reconciliation against every
 * affiliate's mixed-currency positions and crashed. This makes the fallback
 * visible instead of silent, and points at the one control that changes it.
 */

export function GroupScopeNotice({ fallbackName }: { fallbackName: string | undefined }) {
  return (
    <div className="mb-6 rounded-lg border border-gold-500/40 bg-gold-500/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
      <span className="font-bold">Scope is set to Ecobank Group (Consolidated).</span> This screen works on one
      affiliate at a time, so it is showing{' '}
      <span className="font-bold">{fallbackName ?? 'no affiliate — none is onboarded yet'}</span> by default. Change
      the <span className="font-mono">Scope</span> control at the top of the page to work on a different affiliate.
    </div>
  );
}
