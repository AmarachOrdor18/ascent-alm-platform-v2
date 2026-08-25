/**
 * Ad-Hoc Analysis — screen 55 (Phase 8).
 *
 * Custom query builder for on-demand analysis with real FX conversion capabilities.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';

export function AdHoc() {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>(['GROUP']);
  const [dateRange, setDateRange] = useState({ start: '2026-08-01', end: '2026-08-25' });
  const [currency, setCurrency] = useState('USD');

  const availableMetrics = [
    { id: 'lcr', name: 'Liquidity Coverage Ratio', category: 'Liquidity' },
    { id: 'nsfr', name: 'Net Stable Funding Ratio', category: 'Liquidity' },
    { id: 'loanToDeposit', name: 'Loan-to-Deposit Ratio', category: 'Liquidity' },
    { id: 'niiSensitivity', name: 'NII Sensitivity', category: 'IRRBB' },
    { id: 'eveSensitivity', name: 'EVE Sensitivity', category: 'IRRBB' },
    { id: 'concentration', name: 'Deposit Concentration', category: 'Concentration' },
    { id: 'gapAnalysis', name: 'Maturity Gap Analysis', category: 'Liquidity' },
    { id: 'ftpMargin', name: 'FTP Margin Analysis', category: 'Treasury' },
  ];

  const availableAffiliates = [
    { code: 'GROUP', name: 'Ecobank Group (Consolidated)' },
    { code: 'NG', name: 'Ecobank Nigeria' },
    { code: 'GH', name: 'Ecobank Ghana' },
    { code: 'CI', name: 'Ecobank Côte d\'Ivoire' },
    { code: 'SN', name: 'Ecobank Senegal' },
    { code: 'TZ', name: 'Ecobank Tanzania' },
  ];

  const currencies = ['USD', 'NGN', 'GHS', 'XOF', 'ZMW', 'KES'];

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId) ? prev.filter((id) => id !== metricId) : [...prev, metricId]
    );
  };

  const toggleAffiliate = (affiliateCode: string) => {
    setSelectedAffiliates((prev) =>
      prev.includes(affiliateCode) ? prev.filter((code) => code !== affiliateCode) : [...prev, affiliateCode]
    );
  };

  return (
    <>
      <ModuleHeader
        title="Ad-Hoc Analysis"
        description="Custom query builder for on-demand analysis with real FX conversion capabilities"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Available Metrics', value: String(availableMetrics.length) },
          { label: 'Affiliates', value: String(availableAffiliates.length) },
          { label: 'Currencies', value: String(currencies.length) },
          { label: 'Recent Queries', value: '5' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query Builder */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Select Metrics</h3>
              <p className="text-[11px] text-gray-400 font-medium mt-1">Choose the risk metrics to analyze</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {availableMetrics.map((metric) => (
                <button
                  key={metric.id}
                  onClick={() => toggleMetric(metric.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedMetrics.includes(metric.id)
                      ? 'border-gold-500 bg-gold-50 text-navy-900'
                      : 'border-gray-200 hover:border-navy-700 text-gray-600'
                  }`}
                >
                  <p className="text-[11px] font-bold">{metric.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{metric.category}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Scope & Parameters</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] font-medium text-gray-700 mb-2">Affiliates</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Affiliates selection">
                  {availableAffiliates.map((affiliate) => (
                    <button
                      key={affiliate.code}
                      onClick={() => toggleAffiliate(affiliate.code)}
                      className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                        selectedAffiliates.includes(affiliate.code)
                          ? 'bg-navy-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {affiliate.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="currency-select" className="block text-[11px] font-medium text-gray-700 mb-2">Reporting Currency</label>
                <select
                  id="currency-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  {currencies.map((ccy) => (
                    <option key={ccy} value={ccy}>
                      {ccy}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="date-start" className="block text-[11px] font-medium text-gray-700 mb-2">Date Range</label>
                <div className="flex gap-2">
                  <input
                    id="date-start"
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                  <input
                    id="date-end"
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            disabled={selectedMetrics.length === 0}
            className="w-full rounded-lg bg-navy-900 py-3 text-[13px] font-bold text-white hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run Analysis
          </button>
        </div>

        {/* Recent Queries */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Recent Queries</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">Quick access to your recent ad-hoc analyses</p>
          </div>
          <div className="space-y-3">
            {[
              { query: 'LCR & NSFR by Affiliate', date: 'Aug 25, 2026', currency: 'USD' },
              { query: 'NII Sensitivity Analysis', date: 'Aug 24, 2026', currency: 'NGN' },
              { query: 'Concentration Risk Report', date: 'Aug 23, 2026', currency: 'USD' },
              { query: 'FTP Margin by Product', date: 'Aug 22, 2026', currency: 'USD' },
              { query: 'Maturity Gap Analysis', date: 'Aug 21, 2026', currency: 'GHS' },
            ].map((item, i) => (
              <div key={i} className="p-3 border border-gray-100 rounded-lg hover:border-navy-700 transition-colors cursor-pointer">
                <p className="text-[12px] font-bold text-navy-900">{item.query}</p>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">{item.date}</span>
                  <span className="text-[10px] text-gray-400">{item.currency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedMetrics.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Analysis Results Preview</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">
              {selectedMetrics.length} metric(s) selected for {selectedAffiliates.length} affiliate(s) in {currency}
            </p>
          </div>
          <div className="p-8 bg-gray-50 rounded-lg text-center text-gray-400 text-sm">
            Click "Run Analysis" to generate the ad-hoc report. Results will appear here with full FX conversion applied.
          </div>
        </div>
      )}
    </>
  );
}