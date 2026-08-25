import React from 'react';
import { cn } from '@/lib/cn';

type IconProps = React.SVGProps<SVGSVGElement>;

function BaseIcon({ children, className, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-4 h-4 shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
  </BaseIcon>
);

export const PortfolioIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="16" />
    <line x1="10" y1="14" x2="14" y2="14" />
  </BaseIcon>
);

export const TradeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M7 16L3 12l4-4" />
    <path d="M3 12h13a4 4 0 010 8h-1" />
    <path d="M17 8l4-4-4-4" />
    <path d="M21 4H8a4 4 0 000 8h1" />
  </BaseIcon>
);

export const SettlementIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="3" y1="22" x2="21" y2="22" />
    <rect x="5" y="11" width="2" height="8" />
    <rect x="9" y="11" width="2" height="8" />
    <rect x="13" y="11" width="2" height="8" />
    <rect x="17" y="11" width="2" height="8" />
    <polyline points="2,11 12,2 22,11" />
  </BaseIcon>
);

export const ValuationIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="22,12 18,12 15,20 9,4 6,12 2,12" />
  </BaseIcon>
);

export const FundAccountingIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    <line x1="9" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="15" y2="11" />
  </BaseIcon>
);

export const FeeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <rect x="8" y="10" width="2" height="2" />
    <rect x="11" y="10" width="2" height="2" />
    <rect x="14" y="10" width="2" height="2" />
    <rect x="8" y="14" width="2" height="2" />
    <rect x="11" y="14" width="2" height="2" />
    <rect x="14" y="14" width="4" height="2" />
  </BaseIcon>
);

export const ReconciliationIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="12" y1="3" x2="12" y2="21" />
    <path d="M5 21h14" />
    <path d="M5 8l-3 6h6L5 8z" />
    <path d="M19 8l-3 6h6L19 8z" />
    <path d="M5 8h14" />
  </BaseIcon>
);

export const RiskIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9,12 11,14 15,10" />
  </BaseIcon>
);

export const PerformanceIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
    <polyline points="17,6 23,6 23,12" />
  </BaseIcon>
);

export const ReportingIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="9" y1="15" x2="9" y2="18" />
    <line x1="12" y1="13" x2="12" y2="18" />
    <line x1="15" y1="11" x2="15" y2="18" />
  </BaseIcon>
);

export const RegulatoryIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="3" y1="22" x2="21" y2="22" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <polyline points="3,10 12,3 21,10" />
    <line x1="6" y1="10" x2="6" y2="22" />
    <line x1="10" y1="10" x2="10" y2="22" />
    <line x1="14" y1="10" x2="14" y2="22" />
    <line x1="18" y1="10" x2="18" y2="22" />
  </BaseIcon>
);

export const UsersIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </BaseIcon>
);

export const AuditIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M3 12a9 9 0 109 9" />
    <path d="M3 12V6" />
    <path d="M3 12H9" />
    <circle cx="12" cy="12" r="3" />
    <polyline points="12,9 12,12 14,14" />
  </BaseIcon>
);

export const BellIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </BaseIcon>
);

export const DocumentIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
    <polyline points="13,2 13,9 20,9" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </BaseIcon>
);

export const SearchIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </BaseIcon>
);

export const CorporateActionsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="3" y1="22" x2="21" y2="22" />
    <rect x="5" y="10" width="14" height="12" />
    <rect x="9" y="14" width="6" height="8" />
    <polyline points="5,10 12,3 19,10" />
    <line x1="12" y1="3" x2="12" y2="10" />
  </BaseIcon>
);

export const SettingsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </BaseIcon>
);

export const LogoutIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16,17 21,12 16,7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </BaseIcon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="6,9 12,15 18,9" />
  </BaseIcon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12,19 5,12 12,5" />
  </BaseIcon>
);

export const TrendingUpIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </BaseIcon>
);

export const TrendingDownIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </BaseIcon>
);

export const PieChartIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </BaseIcon>
);

export const ArrowUpIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
  </BaseIcon>
);

export const ArrowDownIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19,12 12,19 5,12" />
  </BaseIcon>
);

export const FilterIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
  </BaseIcon>
);

export const DownloadIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </BaseIcon>
);

export const CheckCircleIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
    <polyline points="22,4 12,14.01 9,11.01" />
  </BaseIcon>
);

export const AlertIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </BaseIcon>
);

export const RefreshIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="23,4 23,10 17,10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </BaseIcon>
);

export const PlusIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </BaseIcon>
);

export const EyeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </BaseIcon>
);

export const AuthorizationQueueIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h5" />
    <circle cx="17" cy="17" r="3" />
    <polyline points="16,17 17,18 19,16" />
  </BaseIcon>
);

export const MoreVerticalIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </BaseIcon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <polyline points="9 18 15 12 9 6" />
  </BaseIcon>
);

export const ColumnsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7m0-18H5a2 2 0 00-2 2v14a2 2 0 002 2h7m0-18v18" />
  </BaseIcon>
);

export const MaximizeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
  </BaseIcon>
);

export const ArrowUpDownIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M11 5l-3-3-3 3m3-3v16m5-5l3 3 3-3m-3 3V2" />
  </BaseIcon>
);

export const PanelLeftIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </BaseIcon>
);

export const PanelRightIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
  </BaseIcon>
);

export const ClientManagementIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </BaseIcon>
);

export const CalendarIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </BaseIcon>
);

export const FileTextIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </BaseIcon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </BaseIcon>
);

export const BarChartIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </BaseIcon>
);

export const ClockIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </BaseIcon>
);

export const ShieldCheckIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </BaseIcon>
);

export const HistoryIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <polyline points="12 7 12 12 15 15" />
  </BaseIcon>
);

export const BriefcaseIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </BaseIcon>
);

export const NairaIcon = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={cn('w-4 h-4 shrink-0 inline-block align-text-bottom', className)}
    {...props}
  >
    <path
      d="M7 20V4m10 16V4M4 10h16M4 14h16"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M7 4L17 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

// Integration Logos
export const NGXLogo = () => (
  <div className="bg-[#004C97] text-white px-2 py-0.5 font-bold text-[10px] tracking-wider rounded-sm inline-flex items-center">
    NGX
  </div>
);

export const FMDQLogo = () => (
  <div className="bg-[#00703C] text-white px-2 py-0.5 font-bold text-[10px] tracking-wider rounded-sm inline-flex items-center">
    FMDQ
  </div>
);

export const CSCSLogo = () => (
  <div className="bg-[#C8102E] text-white px-2 py-0.5 font-bold text-[10px] tracking-wider rounded-sm inline-flex items-center">
    CSCS
  </div>
);

export const SECLogo = () => (
  <div className="bg-[#1A3C5E] text-white px-2 py-0.5 font-bold text-[10px] tracking-wider rounded-sm inline-flex items-center">
    SEC NG
  </div>
);

export const CBNLogo = () => (
  <div className="bg-[#006400] text-white px-2 py-0.5 font-bold text-[10px] tracking-wider rounded-sm inline-flex items-center">
    CBN
  </div>
);

export const SunIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </BaseIcon>
);

export const MoonIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </BaseIcon>
);

export const HelpIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </BaseIcon>
);
