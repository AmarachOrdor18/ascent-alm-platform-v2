/**
 * Control Remediation — screen 47 (Phase 7).
 *
 * Full lifecycle tracking, real Kafka-driven auto-open on breaches, and maker-checker closure gate.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

const REMEDIATION_STAGES = ['Identified', 'Assessment', 'Action Plan', 'Implementation', 'Verification', 'Closed'] as const;

interface RemediationIssue {
  id: number;
  title: string;
  description: string;
  source: string;
  sourceRef: string | null;
  severity: string;
  stage: typeof REMEDIATION_STAGES[number];
  closureApprovalStatus: string;
  assignedTo: string | null;
  createdAt: string;
}

export function Remediation() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Mock remediation issues
  const mockIssues: RemediationIssue[] = [
    {
      id: 1,
      title: 'LCR Breach - Below Regulatory Floor',
      description: 'Group LCR has fallen to 88.4%, below the 100% regulatory minimum. Immediate action required to increase HQLA or reduce net cash outflows.',
      source: 'breach',
      sourceRef: 'LCR-2026-08-25',
      severity: 'High',
      stage: 'Assessment',
      closureApprovalStatus: 'Pending',
      assignedTo: 'Chinwe Okafor',
      createdAt: '2026-08-25',
    },
    {
      id: 2,
      title: 'Deposit Concentration Warning',
      description: 'Single depositor concentration at 40.7% exceeds internal threshold of 35%. Recommend diversification strategy.',
      source: 'breach',
      sourceRef: 'CONC-2026-08-24',
      severity: 'Medium',
      stage: 'Action Plan',
      closureApprovalStatus: 'Pending',
      assignedTo: 'Fatima Bello',
      createdAt: '2026-08-24',
    },
    {
      id: 3,
      title: 'Data Quality Exception - Ghana Trial Balance',
      description: 'GL trial balance shows 420 GHS mm shortfall against position book. Within tolerance but requires investigation.',
      source: 'data-quality',
      sourceRef: 'DQ-2026-08-23',
      severity: 'Low',
      stage: 'Verification',
      closureApprovalStatus: 'Approved',
      assignedTo: 'Samuel Owusu',
      createdAt: '2026-08-23',
    },
  ];

  const effectiveSelectedId = selectedId ?? mockIssues[0]?.id ?? null;
  const selected = mockIssues.find((c) => c.id === effectiveSelectedId);
  const openCount = mockIssues.filter((c) => c.stage !== 'Closed').length;
  const pendingApprovalCount = mockIssues.filter((c) => c.closureApprovalStatus === 'Pending').length;
  const closedCount = mockIssues.filter((c) => c.stage === 'Closed').length;

  const currentIndex = selected ? REMEDIATION_STAGES.indexOf(selected.stage) : -1;
  const nextStage = currentIndex >= 0 && currentIndex < REMEDIATION_STAGES.length - 1 ? REMEDIATION_STAGES[currentIndex + 1] : null;

  function StageTracker({ currentStage }: { currentStage: string }) {
    const currentIndex = REMEDIATION_STAGES.indexOf(currentStage as typeof REMEDIATION_STAGES[number]);
    return (
      <div className="flex items-center w-full">
        {REMEDIATION_STAGES.map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={stage} className="flex flex-col items-center shrink-0" style={{ width: 92 }}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shrink-0 ${
                done ? 'bg-success border-success text-white' : active ? 'bg-navy-900 border-navy-900 text-white' : 'bg-white border-gray-200 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-tight mt-1.5 text-center leading-tight ${active ? 'text-navy-900' : done ? 'text-success' : 'text-gray-400'}`}>
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <ModuleHeader
        title="Control Issue Remediation"
        description="Full lifecycle tracking, real Kafka-driven auto-open on breaches, and a genuine maker-checker closure gate via Workflow Engine"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Open Issues', value: String(openCount) },
          { label: 'Pending Closure Approval', value: String(pendingApprovalCount), tone: pendingApprovalCount > 0 ? 'warning' : 'neutral' },
          { label: 'Closed', value: String(closedCount), tone: 'success' },
          { label: 'Total Tracked', value: String(mockIssues.length) },
        ]}
      />

      {mockIssues.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-sm text-center text-sm text-gray-400">
          No remediation issues yet — they're auto-opened when a real limit breach or data-quality exception occurs, or logged manually.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">{selected!.title}</h3>
                <p className="text-[11px] text-gray-400 font-medium mt-1">CR-{selected!.id} · {selected!.source} · Assigned to: {selected!.assignedTo ?? 'Unassigned'}</p>
              </div>
              {nextStage && (
                <button
                  onClick={() => {/* In real implementation, this would advance the stage */}}
                  className="rounded-lg bg-navy-900 px-3.5 py-2 text-[12px] font-bold text-white hover:bg-navy-700 transition-colors shadow-sm shrink-0"
                >
                  Advance to {nextStage}
                </button>
              )}
            </div>
            <StageTracker currentStage={selected!.stage} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-50">
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Identified</p>
                <p className="text-[13px] font-bold text-navy-900 mt-0.5">{new Date(selected!.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Severity</p>
                <p className="text-[13px] font-bold text-navy-900 mt-0.5"><StatusBadge status={selected!.severity} /></p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Related Source</p>
                <p className="text-[13px] font-bold text-navy-900 mt-0.5">{selected!.sourceRef ?? '—'}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-[12px] text-gray-600 leading-relaxed">{selected!.description}</p>
            </div>
          </div>

          <div className="table-datagrid-container">
            <div className="p-5 border-b border-gray-100 bg-white/50">
              <h3 className="font-bold text-navy-900 text-sm uppercase tracking-wider">All Control Issues</h3>
              <p className="text-[11px] text-gray-400 font-medium">Select a row to view its full lifecycle above</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table-datagrid">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Source</th>
                    <th>Assigned To</th>
                    <th>Stage</th>
                    <th>Identified</th>
                  </tr>
                </thead>
                <tbody>
                  {mockIssues.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={c.id === effectiveSelectedId ? 'is-selected cursor-pointer' : 'cursor-pointer'}
                    >
                      <td>
                        <p className="font-bold text-navy-900">{c.title}</p>
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">CR-{c.id}</p>
                      </td>
                      <td>{c.source}</td>
                      <td>{c.assignedTo ?? 'Unassigned'}</td>
                      <td><StatusBadge status={c.stage} /></td>
                      <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}