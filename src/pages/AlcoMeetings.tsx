/**
 * ALCO Meetings — screen 51 (Phase 8).
 *
 * Management of ALCO (Asset-Liability Committee) meetings: agenda, pack generation, minutes, decisions, actions.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface AlcoMeeting {
  id: string;
  title: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  affiliateScope: string;
  agendaItems: string[];
  decisions: string[];
  actionItems: string[];
  chairperson: string;
  attendees: string[];
}

export function AlcoMeetings() {
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'history' | 'agenda'>('upcoming');

  // Mock ALCO meeting data
  const mockMeetings: AlcoMeeting[] = [
    {
      id: 'ALCO-2026-08',
      title: 'Monthly ALCO Review - August 2026',
      date: '2026-08-28',
      status: 'Scheduled',
      affiliateScope: 'Group',
      agendaItems: [
        'Review Group LCR position (88.4% vs 100% floor)',
        'Discuss Nigeria concentration remediation plan',
        'Approve Zambia go-live decision',
        'Review stress testing results from latest scenarios',
        'FX position hedging strategy update',
      ],
      decisions: [],
      actionItems: [],
      chairperson: 'Group CFO',
      attendees: ['Group CFO', 'Group Treasurer', 'Chief Risk Officer', 'Head of Nigeria', 'Head of Ghana'],
    },
    {
      id: 'ALCO-2026-07',
      title: 'Monthly ALCO Review - July 2026',
      date: '2026-07-31',
      status: 'Completed',
      affiliateScope: 'Group',
      agendaItems: [
        'Review Group LCR position (92.1% vs 100% floor)',
        'FX risk mitigation strategy approval',
        'Quarterly stress testing cycle review',
        'Regulatory return preparation status',
      ],
      decisions: [
        'Approved FX hedging program for Q3 2026',
        'Authorized additional HQLA allocation to Nigeria affiliate',
        'Accepted Ghana risk appetite parameters',
      ],
      actionItems: [
        'Treasury to implement FX hedging program by August 15',
        'Risk to monitor Nigeria LCR improvement weekly',
        'Compliance to submit CBN return by August 10',
      ],
      chairperson: 'Group CFO',
      attendees: ['Group CFO', 'Group Treasurer', 'Chief Risk Officer', 'Head of Nigeria', 'Compliance Officer'],
    },
    {
      id: 'ALCO-2026-06',
      title: 'Monthly ALCO Review - June 2026',
      date: '2026-06-30',
      status: 'Completed',
      affiliateScope: 'Group',
      agendaItems: [
        'Review Group LCR position (95.3% vs 100% floor)',
        'Liquidity stress test results review',
        'New business assumptions for Q3 2026',
        'Regulatory compliance update',
      ],
      decisions: [
        'Approved revised run-off rates for retail deposits',
        'Authorized additional contingency funding arrangements',
      ],
      actionItems: [
        'Update behavioral models with new assumptions',
        'Document contingency funding arrangements',
      ],
      chairperson: 'Group CFO',
      attendees: ['Group CFO', 'Group Treasurer', 'Chief Risk Officer', 'Head of Nigeria'],
    },
  ];

  const upcomingMeetings = mockMeetings.filter((m) => m.status === 'Scheduled');
  const historyMeetings = mockMeetings.filter((m) => m.status !== 'Scheduled');

  return (
    <>
      <ModuleHeader
        title="ALCO Meetings"
        description="Management of ALCO (Asset-Liability Committee) meetings: agenda, pack generation, minutes, decisions, actions"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Upcoming', value: String(upcomingMeetings.length), tone: upcomingMeetings.length > 0 ? 'success' : 'neutral' },
          { label: 'Completed This Year', value: String(historyMeetings.length) },
          { label: 'Pending Decisions', value: '3', tone: 'warning' },
          { label: 'Open Actions', value: '8', tone: 'warning' },
        ]}
      />

      <div className="mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('upcoming')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'upcoming' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Upcoming ({upcomingMeetings.length})
          </button>
          <button
            onClick={() => setSelectedTab('history')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'history' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            History ({historyMeetings.length})
          </button>
          <button
            onClick={() => setSelectedTab('agenda')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'agenda' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Agenda Template
          </button>
        </div>
      </div>

      {selectedTab === 'agenda' ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Standard ALCO Agenda Template</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">Default agenda items for monthly ALCO meetings</p>
          </div>
          <div className="space-y-4">
            {[
              'Opening and approval of previous meeting minutes',
              'Review of Group liquidity position (LCR, NSFR)',
              'Review of interest rate risk position (IRRBB)',
              'Stress testing results and scenario analysis',
              'Regulatory compliance status update',
              'Affiliate-specific risk discussions',
              'Strategic decisions and action items',
              'Any other business',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-navy-900 text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="text-[12px] text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="table-datagrid-container">
          <div className="overflow-x-auto">
            <table className="table-datagrid">
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Chairperson</th>
                  <th>Attendees</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(selectedTab === 'upcoming' ? upcomingMeetings : historyMeetings).map((meeting) => (
                  <tr key={meeting.id}>
                    <td>
                      <p className="font-bold text-navy-900">{meeting.title}</p>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">{meeting.affiliateScope}</p>
                    </td>
                    <td>{new Date(meeting.date).toLocaleDateString()}</td>
                    <td><StatusBadge status={meeting.status} /></td>
                    <td>{meeting.chairperson}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {meeting.attendees.slice(0, 2).map((attendee) => (
                          <span key={attendee} className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                            {attendee}
                          </span>
                        ))}
                        {meeting.attendees.length > 2 && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                            +{meeting.attendees.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="rounded bg-navy-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-navy-700 transition-colors">
                          View
                        </button>
                        {selectedTab === 'upcoming' && (
                          <button className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(selectedTab === 'upcoming' ? upcomingMeetings : historyMeetings).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-6">
                      No {selectedTab === 'upcoming' ? 'upcoming' : 'historical'} meetings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}