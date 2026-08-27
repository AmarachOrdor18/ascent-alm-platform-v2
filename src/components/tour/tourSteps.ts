/**
 * Role-based guided tour — step scripts.
 *
 * Deliberately data, not markup: one small overlay component (`Tour.tsx`)
 * reads whichever list matches the signed-in role and walks the user
 * through it, navigating to each step's real route in turn. No existing
 * screen is touched to build this — the tour is a layer on top, the same
 * way `ModuleHeader` metrics or `InfoButton` tooltips are additive rather
 * than a redesign.
 *
 * Content mirrors `ALM_PLATFORM_USER_GUIDE.md` (the full written version of
 * this same journey), condensed to tour-length sentences. Every `path`
 * below is a real route this platform serves today.
 */
import type { RoleCode } from '@/engine/types';

export type TourTag = 'Input' | 'Reference data' | 'Assumptions' | 'Result' | 'Control';

export interface TourStep {
  id: string;
  path: string;
  title: string;
  body: string;
  tag?: TourTag;
}

/** Shown first, for every role — the one thing everyone needs before anything else makes sense. */
const INTRO: TourStep = {
  id: 'intro',
  path: '/dashboard',
  title: 'What is ALM, and what does this platform do?',
  body: 'A bank owns things (loans, investments) and owes things (deposits, borrowings) that don’t match up perfectly. ALM is managing the risk in that mismatch — can the bank pay depositors on time, and what do moving interest rates do to it. This platform takes the bank’s real position data, market data and behavioural assumptions, and computes those risk numbers — for one affiliate, or the whole Group.',
};

const ROLE_STEPS: Record<RoleCode, TourStep[]> = {
  ADMIN: [
    INTRO,
    {
      id: 'affiliates',
      path: '/affiliates',
      title: 'Affiliates',
      body: 'Every affiliate bank in the Group, with how fresh its data is. This is your directory — and where a new affiliate gets onboarded.',
    },
    {
      id: 'onboard',
      path: '/affiliates/onboard',
      title: 'Onboard Affiliate',
      body: 'Seven steps, all on one screen — legal profile, currencies, connectivity, chart-of-accounts mapping, limits, and the initial data load. Nothing here sends you to a separate screen partway through.',
    },
    {
      id: 'connectors',
      path: '/connectors',
      title: 'Connectors & Data Sources',
      body: 'The shared catalogue of systems like Flexcube and Reuters. Once a domain has a connector configured, it becomes the authoritative feed — manual upload is blocked for that domain so it can’t be silently bypassed.',
      tag: 'Control',
    },
    {
      id: 'dimensions',
      path: '/data/structure',
      title: 'Dimensions & Hierarchies',
      body: 'How every position is classified — legal entity, business unit, product, GL account, counterparty. Set up once per affiliate, then it’s ordinary configuration data, not something re-entered per run.',
      tag: 'Reference data',
    },
    {
      id: 'reference',
      path: '/data/reference-data',
      title: 'Reference Data',
      body: 'Yield curves, FX rates, economic indicators, holiday calendars — the market and calendar data every calculation reads. A missing FX rate fails a Group run rather than silently dropping that currency.',
      tag: 'Reference data',
    },
    {
      id: 'configuration',
      path: '/configuration',
      title: 'Business Rules & Validation Rules',
      body: 'The assumptions the engine models with — behavioural patterns, prepayment, discount methods — and the rules that decide what counts as valid position data in the first place.',
      tag: 'Assumptions',
    },
    {
      id: 'admin',
      path: '/admin',
      title: 'Administration & Governance',
      body: 'You’re usually the checker in Approvals — maker-checker means whoever submits an affiliate for activation can’t also approve it. Audit Log is the full trail underneath everything else in the platform.',
      tag: 'Control',
    },
  ],

  RISK_ANALYST: [
    INTRO,
    {
      id: 'data-ops',
      path: '/data/operations',
      title: 'Data Operations',
      body: 'Check what’s actually loaded and how fresh it is before trusting any run — a stale feed doesn’t announce itself on the results screens.',
      tag: 'Input',
    },
    {
      id: 'liquidity',
      path: '/risk/liquidity',
      title: 'Liquidity Risk',
      body: 'Can the bank meet its short-term obligations? LCR, NSFR and the liquidity gap, all computed from the same selected run.',
      tag: 'Result',
    },
    {
      id: 'irrbb',
      path: '/risk/irrbb',
      title: 'IRRBB & Behavioural Risk',
      body: 'How interest-rate moves affect the balance sheet’s value (EVE) versus next year’s earnings (NII) — genuinely different questions that can point in different directions.',
      tag: 'Result',
    },
    {
      id: 'stress',
      path: '/risk/stress-testing',
      title: 'Stress Testing & Scenario Analysis',
      body: 'The six BCBS supervisory shocks, run against this scope’s own book. What-If Builder is here too, for a scenario that isn’t one of the six.',
      tag: 'Result',
    },
    {
      id: 'concentration',
      path: '/risk/concentration',
      title: 'Concentration & Risk Monitoring',
      body: 'Exposure, then limits, then the trend (KRIs) — in that order. A limit means nothing without first knowing what’s actually exposed.',
      tag: 'Result',
    },
    {
      id: 'rules',
      path: '/configuration',
      title: 'Business Rules',
      body: 'You’re usually the one tuning the behavioural and prepayment assumptions here, not just reading their downstream effect on the results screens.',
      tag: 'Assumptions',
    },
  ],

  TREASURY_USER: [
    INTRO,
    {
      id: 'balance-sheet',
      path: '/treasury/balance-sheet',
      title: 'Balance Sheet & Treasury',
      body: 'The shape of the balance sheet, and FX Position — which is a calculated result read from a completed run, not something you upload.',
      tag: 'Result',
    },
    {
      id: 'ftp',
      path: '/treasury/ftp',
      title: 'Funds Transfer Pricing',
      body: 'Every position is priced against an internal transfer rate before its margin counts as a business unit’s own — that’s what separates a loan’s headline rate from what the desk actually earned.',
      tag: 'Result',
    },
    {
      id: 'profitability',
      path: '/treasury/ftp/profitability',
      title: 'Profitability Ratios',
      body: 'Net interest margin, NPL ratio, non-earning assets — what falls out once every position carries a transfer-priced margin.',
      tag: 'Result',
    },
    {
      id: 'liquidity',
      path: '/risk/liquidity',
      title: 'Liquidity Risk',
      body: 'You’re a heavy consumer of this even though Risk owns the methodology — funding decisions start with what this screen shows.',
      tag: 'Result',
    },
    {
      id: 'rules',
      path: '/configuration',
      title: 'Business Rules — FTP & Transaction Strategies',
      body: 'The rules that actually drive your own FTP numbers are configured here.',
      tag: 'Assumptions',
    },
  ],

  EXECUTIVE_VIEWER: [
    INTRO,
    {
      id: 'dashboard',
      path: '/dashboard',
      title: 'Executive Dashboard',
      body: 'One run, every number on this screen reads off it — click any tile to drill into the screen behind it.',
      tag: 'Result',
    },
    {
      id: 'liquidity',
      path: '/risk/liquidity',
      title: 'Liquidity Risk',
      body: 'Read-only for you — drill into any number, but the assumptions and limits behind it are configured elsewhere.',
      tag: 'Result',
    },
    {
      id: 'limits',
      path: '/risk/concentration/limits',
      title: 'Limits & Breaches',
      body: 'Where a number has turned red, and why. The regulator’s floor and the bank’s own appetite are shown as two separate lines, never blended into one.',
      tag: 'Control',
    },
    {
      id: 'reporting',
      path: '/reporting',
      title: 'Reporting & ALCO',
      body: 'The packaged view for committee and board — the same numbers, written up for people who don’t log into the platform directly.',
      tag: 'Result',
    },
    {
      id: 'affiliates',
      path: '/affiliates',
      title: 'Affiliates',
      body: 'The Group-wide picture across every affiliate bank, and which ones are Live versus still onboarding.',
    },
  ],

  REPORTING_USER: [
    INTRO,
    {
      id: 'alco',
      path: '/reporting',
      title: 'ALCO Meetings',
      body: 'Where committee packs and their supporting materials are organised.',
    },
    {
      id: 'packs',
      path: '/reporting/report-packs',
      title: 'Report Packs',
      body: 'The ALCO pack and the Management pack — generated from a real run, not typed into a table by hand.',
      tag: 'Result',
    },
    {
      id: 'regulatory',
      path: '/reporting/regulatory',
      title: 'Regulatory Reporting',
      body: 'Statutory submissions, built the same way as the ALCO pack — one real run behind every figure.',
      tag: 'Result',
    },
    {
      id: 'adhoc',
      path: '/reporting/ad-hoc',
      title: 'Ad-Hoc Analysis',
      body: 'For the one-off request that doesn’t fit any standing report.',
    },
  ],

  CONTROL_TESTER: [
    INTRO,
    {
      id: 'upload',
      path: '/data/operations',
      title: 'Data Upload & Staging',
      body: 'Staged rows are editable; committed rows are not — after commit, the only routes are a brand-new version or a reasoned adjustment. Nothing is ever silently edited.',
      tag: 'Control',
    },
    {
      id: 'reconciliation',
      path: '/data/operations/gl-reconciliation',
      title: 'GL Reconciliation',
      body: 'The position book compared against the trial balance. A variance inside tolerance needs an approved plug; anything outside tolerance blocks sign-off entirely and goes back to the affiliate.',
      tag: 'Control',
    },
    {
      id: 'validation',
      path: '/configuration/validation-rules',
      title: 'Validation Rules',
      body: 'The rules that decide what counts as valid position data before it can even be staged.',
      tag: 'Control',
    },
    {
      id: 'limits',
      path: '/risk/concentration/limits',
      title: 'Limits & Breaches',
      body: 'Read-only for you — useful for checking a control’s actual downstream effect on the risk numbers.',
      tag: 'Result',
    },
    {
      id: 'audit',
      path: '/admin/audit',
      title: 'Audit Log',
      body: 'The evidence trail for every change made anywhere in the platform — who, what, and when.',
      tag: 'Control',
    },
  ],
};

export function tourStepsFor(role: RoleCode | null | undefined): TourStep[] {
  if (!role) return [INTRO];
  return ROLE_STEPS[role] ?? [INTRO];
}
