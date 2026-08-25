/**
 * System Preferences — screen 57 (Phase 8).
 *
 * System-level configuration and administrative settings.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';

export function AdminPreferences() {
  const settings = [
    {
      category: 'System',
      items: [
        { name: 'Application Name', value: 'Ascent ALM Platform', type: 'text' },
        { name: 'Default Currency', value: 'USD', type: 'select' },
        { name: 'Timezone', value: 'UTC', type: 'select' },
        { name: 'Date Format', value: 'YYYY-MM-DD', type: 'select' },
      ],
    },
    {
      category: 'Security',
      items: [
        { name: 'Session Timeout (minutes)', value: '30', type: 'number' },
        { name: 'Password Policy', value: 'Strong (8+ chars, mixed)', type: 'select' },
        { name: 'MFA Required', value: 'Yes', type: 'toggle' },
        { name: 'Failed Login Lockout', value: '5 attempts', type: 'number' },
      ],
    },
    {
      category: 'Notifications',
      items: [
        { name: 'Email Notifications', value: 'Enabled', type: 'toggle' },
        { name: 'Breach Alerts', value: 'Real-time', type: 'select' },
        { name: 'Approval Requests', value: 'Daily Digest', type: 'select' },
        { name: 'System Updates', value: 'Weekly', type: 'select' },
      ],
    },
    {
      category: 'Performance',
      items: [
        { name: 'Data Refresh Cadence', value: 'Daily', type: 'select' },
        { name: 'Cache Duration (minutes)', value: '15', type: 'number' },
        { name: 'Query Timeout (seconds)', value: '30', type: 'number' },
        { name: 'Batch Size (rows)', value: '1000', type: 'number' },
      ],
    },
  ];

  return (
    <>
      <ModuleHeader
        title="System Preferences"
        description="System-level configuration and administrative settings"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Configuration Categories', value: String(settings.length) },
          { label: 'Settings Configured', value: '16' },
          { label: 'Last Updated', value: 'August 25, 2026' },
          { label: 'System Version', value: '2.0.0' },
        ]}
      />

      <div className="space-y-6">
        {settings.map((category) => (
          <div key={category.category} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">{category.category}</h3>
            </div>
            <div className="space-y-4">
              {category.items.map((setting) => (
                <div key={setting.name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-[12px] font-bold text-navy-900">{setting.name}</p>
                    <p className="text-[10px] text-gray-400">{setting.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {setting.type === 'toggle' ? (
                      <div className="w-10 h-5 bg-gold-500 rounded-full relative cursor-pointer">
                        <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                      </div>
                    ) : setting.type === 'select' ? (
                      <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700">
                        <option>{setting.value}</option>
                      </select>
                    ) : (
                      <input
                        type={setting.type === 'number' ? 'number' : 'text'}
                        defaultValue={setting.value}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 w-32"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 transition-colors">
          Save Changes
        </button>
      </div>
    </>
  );
}