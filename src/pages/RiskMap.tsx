/**
 * Liquidity Risk Map — screen 49 (Phase 7).
 *
 * Colour-coded concentration risk per affiliate, visualizing liquidity risk exposure across the Group.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';

export function RiskMap() {

  // Mock risk map data - in real implementation this would come from the risk engine
  const mockRiskData = [
    { affiliateCode: 'NG', affiliateName: 'Ecobank Nigeria', lcr: 88.4, nsfr: 103.6, concentration: 32.1, overallRisk: 'High' },
    { affiliateCode: 'GH', affiliateName: 'Ecobank Ghana', lcr: 145.2, nsfr: 118.3, concentration: 28.7, overallRisk: 'Low' },
    { affiliateCode: 'CI', affiliateName: 'Ecobank Côte d\'Ivoire', lcr: 92.1, nsfr: 108.9, concentration: 35.4, overallRisk: 'Medium' },
    { affiliateCode: 'SN', affiliateName: 'Ecobank Senegal', lcr: 156.8, nsfr: 125.4, concentration: 22.3, overallRisk: 'Low' },
    { affiliateCode: 'TZ', affiliateName: 'Ecobank Tanzania', lcr: 78.9, nsfr: 95.2, concentration: 41.2, overallRisk: 'High' },
  ];

  const riskColor = {
    High: 'bg-danger',
    Medium: 'bg-warning',
    Low: 'bg-success',
  } as const;

  const riskTextColor = {
    High: 'text-danger',
    Medium: 'text-warning',
    Low: 'text-success',
  } as const;

  const highRiskCount = mockRiskData.filter((a) => a.overallRisk === 'High').length;
  const mediumRiskCount = mockRiskData.filter((a) => a.overallRisk === 'Medium').length;
  const lowRiskCount = mockRiskData.filter((a) => a.overallRisk === 'Low').length;

  return (
    <>
      <ModuleHeader
        title="Liquidity Risk Map"
        description="Colour-coded concentration risk per affiliate, visualizing liquidity risk exposure across the Group"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'High Risk', value: String(highRiskCount), tone: 'danger' },
          { label: 'Medium Risk', value: String(mediumRiskCount), tone: 'warning' },
          { label: 'Low Risk', value: String(lowRiskCount), tone: 'success' },
          { label: 'Total Affiliates', value: String(mockRiskData.length) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Map Grid */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Affiliate Risk Matrix</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">LCR vs Concentration risk positioning</p>
          </div>
          <div className="relative h-80 bg-gray-50 rounded-lg p-4">
            {/* Risk quadrant visualization */}
            <div className="absolute inset-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="absolute top-2 left-2 text-[10px] text-gray-400 font-bold">High Concentration</div>
              <div className="absolute top-2 right-2 text-[10px] text-gray-400 font-bold">Low Concentration</div>
              <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 font-bold">Low LCR</div>
              <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 font-bold">High LCR</div>
              
              {/* Plot affiliate positions */}
              {mockRiskData.map((affiliate) => {
                    const x = 20 + (100 - affiliate.concentration) * 0.6; // Invert concentration for x-axis
                    const y = 80 - (affiliate.lcr - 70) * 0.5; // Scale LCR for y-axis
                    return (
                      <div
                        key={affiliate.affiliateCode}
                        className="absolute w-4 h-4 rounded-full transform -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:scale-125 transition-transform"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          backgroundColor: riskColor[affiliate.overallRisk as keyof typeof riskColor],
                        }}
                        title={`${affiliate.affiliateName}: LCR ${affiliate.lcr}%, Concentration ${affiliate.concentration}%`}
                      />
                    );
                  })}
            </div>
          </div>
        </div>

        {/* Risk Summary Table */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Risk Summary by Affiliate</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">Detailed risk metrics and overall risk assessment</p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-datagrid">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th>LCR</th>
                  <th>NSFR</th>
                  <th>Concentration</th>
                  <th>Overall Risk</th>
                </tr>
              </thead>
              <tbody>
                {mockRiskData.map((affiliate) => (
                  <tr key={affiliate.affiliateCode}>
                    <td className="font-bold text-navy-900">{affiliate.affiliateName}</td>
                    <td className="font-mono">{affiliate.lcr.toFixed(1)}%</td>
                    <td className="font-mono">{affiliate.nsfr.toFixed(1)}%</td>
                    <td className="font-mono">{affiliate.concentration.toFixed(1)}%</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${riskTextColor[affiliate.overallRisk as keyof typeof riskTextColor]}`}>
                        {affiliate.overallRisk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Risk Legend */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mt-6">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Risk Assessment Criteria</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 rounded bg-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">High Risk</p>
              <p className="text-[11px] text-gray-500">LCR &lt; 100% OR Concentration &gt; 35%</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 rounded bg-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">Medium Risk</p>
              <p className="text-[11px] text-gray-500">LCR 100-110% OR Concentration 25-35%</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 rounded bg-success mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">Low Risk</p>
              <p className="text-[11px] text-gray-500">LCR &gt; 110% AND Concentration &lt; 25%</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}