/**
 * ALCO Reporting — screen 53 (Phase 8).
 *
 * Generation of ALCO (Asset-Liability Committee) reporting packs for committee meetings.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function AlcoReporting() {
  // Mock ALCO report data
  const mockReports = [
    {
      id: 'ALCO-2026-08-PACK',
      title: 'August 2026 ALCO Pack',
      period: 'August 2026',
      generatedAt: '2026-08-25',
      status: 'Ready',
      affiliateScope: 'Group',
      sections: [
        'Executive Summary',
        'Liquidity Risk Analysis',
        'Interest Rate Risk Analysis',
        'Stress Testing Results',
        'Regulatory Compliance Status',
        'Affiliate Performance',
        'Action Items Tracking',
      ],
    },
    {
      id: 'ALCO-2026-07-PACK',
      title: 'July 2026 ALCO Pack',
      period: 'July 2026',
      generatedAt: '2026-07-31',
      status: 'Archived',
      affiliateScope: 'Group',
      sections: [
        'Executive Summary',
        'Liquidity Risk Analysis',
        'Interest Rate Risk Analysis',
        'Stress Testing Results',
        'Regulatory Compliance Status',
        'Affiliate Performance',
        'Action Items Tracking',
      ],
    },
  ];

  return (
    <>
      <ModuleHeader
        title="ALCO Reporting"
        description="Generation of ALCO (Asset-Liability Committee) reporting packs for committee meetings"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Latest Pack', value: 'August 2026', tone: 'success' },
          { label: 'Sections', value: '8' },
          { label: 'Affiliates Covered', value: '34' },
          { label: 'Archive Size', value: '12 packs' },
        ]}
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Generate New ALCO Pack</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Create a comprehensive ALCO pack for the upcoming committee meeting</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="reporting-period" className="block text-[11px] font-medium text-gray-700 mb-2">Reporting Period</label>
            <select id="reporting-period" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700">
              <option>August 2026</option>
              <option>September 2026</option>
              <option>October 2026</option>
            </select>
          </div>
          <div>
            <label htmlFor="affiliate-scope" className="block text-[11px] font-medium text-gray-700 mb-2">Affiliate Scope</label>
            <select id="affiliate-scope" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700">
              <option>Group Consolidated</option>
              <option>Nigeria Only</option>
              <option>Ghana Only</option>
              <option>Côte d'Ivoire Only</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 transition-colors">
            Generate ALCO Pack
          </button>
        </div>
      </div>

      <div className="table-datagrid-container">
        <div className="overflow-x-auto">
          <table className="table-datagrid">
            <thead>
              <tr>
                <th>Report</th>
                <th>Period</th>
                <th>Generated</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Sections</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockReports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <p className="font-bold text-navy-900">{report.title}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{report.id}</p>
                  </td>
                  <td>{report.period}</td>
                  <td>{new Date(report.generatedAt).toLocaleDateString()}</td>
                  <td><StatusBadge status={report.status} /></td>
                  <td>{report.affiliateScope}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {report.sections.slice(0, 3).map((section) => (
                        <span key={section} className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                          {section}
                        </span>
                      ))}
                      {report.sections.length > 3 && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                          +{report.sections.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="rounded bg-navy-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-navy-700 transition-colors">
                        View
                      </button>
                      <button className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
                        Export PDF
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