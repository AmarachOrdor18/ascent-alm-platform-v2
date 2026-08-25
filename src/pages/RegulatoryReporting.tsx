/**
 * Regulatory Reporting — screen 52 (Phase 8).
 *
 * Generation of regulatory returns for different jurisdictions: CBN, Bank of Ghana, BCEAO, etc.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface RegulatoryReturn {
  id: string;
  jurisdiction: string;
  returnName: string;
  period: string;
  status: 'Draft' | 'Submitted' | 'Accepted' | 'Rejected';
  dueDate: string;
  submittedDate?: string;
  affiliateScope: string;
}

export function RegulatoryReporting() {
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<'all' | 'CBN' | 'BoG' | 'BCEAO'>('all');

  // Mock regulatory return data
  const mockReturns: RegulatoryReturn[] = [
    {
      id: 'RET-2026-08-CBN',
      jurisdiction: 'CBN',
      returnName: 'LCR & NSFR Return',
      period: 'August 2026',
      status: 'Draft',
      dueDate: '2026-09-15',
      affiliateScope: 'Nigeria',
    },
    {
      id: 'RET-2026-08-BoG',
      jurisdiction: 'Bank of Ghana',
      returnName: 'Liquidity Risk Return',
      period: 'August 2026',
      status: 'Submitted',
      dueDate: '2026-09-10',
      submittedDate: '2026-09-05',
      affiliateScope: 'Ghana',
    },
    {
      id: 'RET-2026-07-CBN',
      jurisdiction: 'CBN',
      returnName: 'LCR & NSFR Return',
      period: 'July 2026',
      status: 'Accepted',
      dueDate: '2026-08-15',
      submittedDate: '2026-08-10',
      affiliateScope: 'Nigeria',
    },
    {
      id: 'RET-2026-07-BCEAO',
      jurisdiction: 'BCEAO',
      returnName: 'IRRBB Sensitivity Return',
      period: 'July 2026',
      status: 'Accepted',
      dueDate: '2026-08-20',
      submittedDate: '2026-08-15',
      affiliateScope: 'Côte d\'Ivoire',
    },
  ];

  const filteredReturns = selectedJurisdiction === 'all' 
    ? mockReturns 
    : mockReturns.filter((r) => r.jurisdiction === selectedJurisdiction);

  const draftCount = mockReturns.filter((r) => r.status === 'Draft').length;
  const submittedCount = mockReturns.filter((r) => r.status === 'Submitted').length;
  const acceptedCount = mockReturns.filter((r) => r.status === 'Accepted').length;

  const jurisdictionColors = {
    'CBN': 'bg-navy-100 text-navy-900',
    'Bank of Ghana': 'bg-warning-bg text-warning',
    'BCEAO': 'bg-success-bg text-success',
  } as const;

  return (
    <>
      <ModuleHeader
        title="Regulatory Reporting"
        description="Generation of regulatory returns for different jurisdictions: CBN, Bank of Ghana, BCEAO, etc."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Draft Returns', value: String(draftCount), tone: draftCount > 0 ? 'warning' : 'neutral' },
          { label: 'Pending Review', value: String(submittedCount), tone: submittedCount > 0 ? 'warning' : 'neutral' },
          { label: 'Accepted', value: String(acceptedCount), tone: 'success' },
          { label: 'Total Returns', value: String(mockReturns.length) },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedJurisdiction('all')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedJurisdiction === 'all' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          All Jurisdictions
        </button>
        <button
          onClick={() => setSelectedJurisdiction('CBN')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedJurisdiction === 'CBN' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          CBN (Nigeria)
        </button>
        <button
          onClick={() => setSelectedJurisdiction('BoG')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedJurisdiction === 'BoG' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          Bank of Ghana
        </button>
        <button
          onClick={() => setSelectedJurisdiction('BCEAO')}
          className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
            selectedJurisdiction === 'BCEAO' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
          }`}
        >
          BCEAO (UEMOA)
        </button>
      </div>

      <div className="table-datagrid-container">
        <div className="overflow-x-auto">
          <table className="table-datagrid">
            <thead>
              <tr>
                <th>Return</th>
                <th>Jurisdiction</th>
                <th>Period</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map((returnItem) => (
                <tr key={returnItem.id}>
                  <td>
                    <p className="font-bold text-navy-900">{returnItem.returnName}</p>
                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{returnItem.id}</p>
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${jurisdictionColors[returnItem.jurisdiction as keyof typeof jurisdictionColors] || 'bg-gray-100 text-gray-600'}`}>
                      {returnItem.jurisdiction}
                    </span>
                  </td>
                  <td>{returnItem.period}</td>
                  <td><StatusBadge status={returnItem.status} /></td>
                  <td>{new Date(returnItem.dueDate).toLocaleDateString()}</td>
                  <td>{returnItem.submittedDate ? new Date(returnItem.submittedDate).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="rounded bg-navy-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-navy-700 transition-colors">
                        Generate
                      </button>
                      {returnItem.status === 'Draft' && (
                        <button className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
                          Submit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredReturns.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-6">
                    No regulatory returns found for the selected jurisdiction.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Regulatory Calendar</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Upcoming filing deadlines by jurisdiction</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-navy-900">CBN (Nigeria)</p>
            <p className="text-[10px] text-gray-500 mt-1">Next filing: September 15, 2026</p>
            <p className="text-[10px] text-gray-400">LCR & NSFR monthly return</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-navy-900">Bank of Ghana</p>
            <p className="text-[10px] text-gray-500 mt-1">Next filing: September 10, 2026</p>
            <p className="text-[10px] text-gray-400">Liquidity risk quarterly return</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-navy-900">BCEAO (UEMOA)</p>
            <p className="text-[10px] text-gray-500 mt-1">Next filing: September 20, 2026</p>
            <p className="text-[10px] text-gray-400">IRRBB sensitivity quarterly return</p>
          </div>
        </div>
      </div>
    </>
  );
}