/**
 * Management Reporting — screen 54 (Phase 8).
 *
 * Lighter KPI and early-warning reporting packs for management review.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function ManagementReporting() {
  // Mock management report data
  const mockReports = [
    {
      id: 'MGMT-2026-08-WEEKLY',
      title: 'Weekly Management Dashboard',
      period: 'Week 34, 2026',
      generatedAt: '2026-08-25',
      status: 'Ready',
      reportType: 'Weekly Dashboard',
      kpis: ['LCR', 'NSFR', 'Loan-to-Deposit', 'NII Sensitivity'],
    },
    {
      id: 'MGMT-2026-08-MONTHLY',
      title: 'Monthly Executive Summary',
      period: 'August 2026',
      generatedAt: '2026-08-24',
      status: 'Ready',
      reportType: 'Executive Summary',
      kpis: ['All Risk Metrics', 'Affiliate Performance', 'Trend Analysis'],
    },
    {
      id: 'MGMT-2026-07-MONTHLY',
      title: 'Monthly Executive Summary',
      period: 'July 2026',
      generatedAt: '2026-07-31',
      status: 'Archived',
      reportType: 'Executive Summary',
      kpis: ['All Risk Metrics', 'Affiliate Performance', 'Trend Analysis'],
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Management Reporting"
        description="Lighter KPI and early-warning reporting packs for management review"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Weekly Reports', value: '52/year', tone: 'success' },
          { label: 'Monthly Reports', value: '12/year', tone: 'success' },
          { label: 'Latest Report', value: 'August 25, 2026' },
          { label: 'Report Types', value: '4' },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { title: 'Weekly Dashboard', description: 'KPI snapshot and early warnings', icon: '📊' },
          { title: 'Executive Summary', description: 'Monthly high-level overview', icon: '📋' },
          { title: 'Trend Analysis', description: 'Multi-period metric movement', icon: '📈' },
          { title: 'Affiliate Performance', description: 'Per-affiliate risk comparison', icon: '🏦' },
        ].map((reportType) => (
          <div key={reportType.title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="text-2xl mb-2">{reportType.icon}</div>
            <h3 className="text-[12px] font-bold text-navy-900">{reportType.title}</h3>
            <p className="text-[11px] text-gray-500 mt-1">{reportType.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2.5 px-3 font-bold">Report</th>
                <th className="py-2.5 px-3 font-bold">Type</th>
                <th className="py-2.5 px-3 font-bold">Period</th>
                <th className="py-2.5 px-3 font-bold">Generated</th>
                <th className="py-2.5 px-3 font-bold">Status</th>
                <th className="py-2.5 px-3 font-bold">KPIs Covered</th>
                <th className="py-2.5 px-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockReports.map((report) => (
                <tr key={report.id} className="border-b border-gray-50 py-3 px-3 text-[13px] text-gray-700 font-medium transition-colors hover:bg-gray-50/50">
                  <td>
                    <p className="font-bold text-navy-900">{report.title}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{report.id}</p>
                  </td>
                  <td>{report.reportType}</td>
                  <td>{report.period}</td>
                  <td>{new Date(report.generatedAt).toLocaleDateString()}</td>
                  <td><StatusBadge status={report.status} /></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {report.kpis.map((kpi) => (
                        <span key={kpi} className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                          {kpi}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="rounded bg-navy-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-navy-700 transition-colors">
                        View
                      </button>
                      <button className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
                        Export
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}