/**
 * System Preferences — screen 57.
 *
 * This used to be an entirely fabricated settings form: selects offering
 * only the one option already "selected", toggles that didn't toggle, and
 * a Save Changes button with no click handler at all. There is no
 * system-wide settings entity in this data model for a form like that to
 * write to honestly.
 *
 * What actually exists is real, just not editable from one screen: roles
 * and permissions, retention windows, validation behaviour. This reads
 * those facts from the code that enforces them and links to wherever each
 * one is genuinely configured, rather than duplicating fake controls here.
 */

import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ROLES } from '@/context/AuthContext';

const ROLE_LIST = Object.values(ROLES);

export function AdminPreferences() {
  return (
    <>
      <ModuleHeader
        title="System Preferences"
        description="How the platform is actually configured, and where to change each thing for real."
        asOfDate={null}
        scope="Ecobank Group"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Access &amp; roles</h3>
          <p className="mb-4 text-[11px] text-gray-400">Six fixed roles; users move between them, roles themselves aren't editable here.</p>
          <dl className="space-y-3 text-[12px]">
            {ROLE_LIST.map((r) => (
              <div key={r.code} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
                <dt className="text-gray-600">{r.name}</dt>
                <dd className="font-mono text-gray-400">{r.permissions.length} permissions</dd>
              </div>
            ))}
          </dl>
          <Link href="/admin/users" className="mt-4 inline-block text-[11px] font-bold text-navy-700 hover:underline">
            Manage users and role assignments →
          </Link>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Data &amp; retention</h3>
          <p className="mb-4 text-[11px] text-gray-400">Fixed platform behaviour, not per-affiliate settings.</p>
          <dl className="space-y-3 text-[12px]">
            <Row label="Load batch retention" value="24 monthly as-of dates, every version" />
            <Row label="Expired data" value="Marked and hidden, never deleted" />
            <Row label="Audit trail" value="Append-only, every event retained" />
            <Row label="Audit log display cap" value="Most recent 500 events" />
          </dl>
          <Link href="/data-vintages" className="mt-4 inline-block text-[11px] font-bold text-navy-700 hover:underline">
            View load history and retention →
          </Link>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Validation &amp; controls</h3>
          <p className="mb-4 text-[11px] text-gray-400">Per-rule, configured on the screen that owns it.</p>
          <dl className="space-y-3 text-[12px]">
            <Row label="Blocking vs advisory" value="Set per validation rule" />
            <Row label="Reconciliation tolerance" value="Set per affiliate, amount or %" />
            <Row label="Limit thresholds" value="Amber/Red and regulatory floor, per limit" />
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/validation-rules" className="text-[11px] font-bold text-navy-700 hover:underline">
              Validation Rules →
            </Link>
            <Link href="/gl-reconciliation" className="text-[11px] font-bold text-navy-700 hover:underline">
              GL Reconciliation →
            </Link>
            <Link href="/limits" className="text-[11px] font-bold text-navy-700 hover:underline">
              Limits &amp; Breaches →
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Notifications &amp; escalation</h3>
          <p className="mb-4 text-[11px] text-gray-400">Configured per event, not a global switch.</p>
          <dl className="space-y-3 text-[12px]">
            <Row label="Alert rules" value="Event, channel, recipients and minimum severity, per rule" />
            <Row label="Escalation" value="Optional, after a set number of hours to a second recipient list" />
          </dl>
          <Link href="/notifications" className="mt-4 inline-block text-[11px] font-bold text-navy-700 hover:underline">
            Manage notification rules →
          </Link>
        </section>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-2 last:border-0">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right text-gray-400">{value}</dd>
    </div>
  );
}
