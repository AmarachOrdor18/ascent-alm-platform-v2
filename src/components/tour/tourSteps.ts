import type { Role } from '@/engine/types';
import { SEARCH_INDEX } from '@/components/layout/navigation';

export type TourTag = 'Input' | 'Reference data' | 'Assumptions' | 'Result' | 'Control';

export interface TourStep {
  id: string;
  path: string;
  title: string;
  dataIn: string;
  why: string;
  tag?: TourTag;
}

/** Shown first, for every role — the one thing everyone needs before anything else makes sense. */
const INTRO: TourStep = {
  id: 'intro',
  path: '/dashboard',
  title: 'What is ALM, and what does this platform do?',
  dataIn: 'Nothing yet — this is the orientation step.',
  why: 'A bank owns things (loans, investments) and owes things (deposits, borrowings) that don’t match up perfectly. ALM is managing the risk in that mismatch — can the bank pay depositors on time, and what do moving interest rates do to it. Everything that follows takes the bank’s real position data, market data and behavioural assumptions, and computes those risk numbers.',
};

/** Keyed by path — one entry per real screen in SEARCH_INDEX. */
const SCREEN_CONTENT: Record<string, { dataIn: string; why: string; tag?: TourTag }> = {
  '/dashboard': {
    dataIn: 'The selected run’s results.',
    why: 'One glance at whether the bank is healthy right now — every tile links to the screen behind it.',
    tag: 'Result',
  },
  '/risk/liquidity': {
    dataIn: 'Positions, FX rates, the selected run.',
    why: 'Can the bank meet its short-term obligations — LCR, NSFR and the liquidity gap.',
    tag: 'Result',
  },
  '/risk/liquidity/risk-map': {
    dataIn: 'Every Live affiliate’s Liquidity Risk numbers.',
    why: 'One table across every affiliate, so a Group-level liquidity problem is visible at a glance instead of affiliate by affiliate.',
    tag: 'Result',
  },
  '/risk/liquidity/gap-analysis': {
    dataIn: 'Positions, bucketed by contractual and behavioural maturity.',
    why: 'When cash actually arrives versus when a rate resets — two different ladders, off the same positions.',
    tag: 'Result',
  },
  '/risk/irrbb': {
    dataIn: 'Positions, yield curves, behavioural assumptions.',
    why: 'EVE, NII and PV01 — how a rate move hits the balance sheet’s value versus next year’s earnings. Genuinely different questions.',
    tag: 'Result',
  },
  '/risk/irrbb/behavioural-analysis': {
    dataIn: 'Positions, behavioural pattern assumptions from Business Rules.',
    why: 'How customers actually behave versus their contract’s stated terms — the input IRRBB and liquidity both quietly depend on.',
    tag: 'Result',
  },
  '/risk/stress-testing': {
    dataIn: 'Positions, the six BCBS supervisory shocks.',
    why: 'Capital impact under every prescribed regulatory scenario, side by side — not just the one shock a run happened to use.',
    tag: 'Result',
  },
  '/risk/stress-testing/what-if': {
    dataIn: 'Positions, a scenario you define.',
    why: 'For the scenario that isn’t one of the six regulatory shocks — build your own and see the impact.',
    tag: 'Result',
  },
  '/risk/concentration': {
    dataIn: 'Positions, the Counterparty Register.',
    why: 'What share of deposits sits with one depositor — a concentration risk the total balance alone can hide.',
    tag: 'Result',
  },
  '/risk/concentration/limits': {
    dataIn: 'Every evaluated metric, against its configured thresholds.',
    why: 'Where a number has crossed red, and whether it’s the regulator’s floor or the bank’s own internal appetite — always shown separately.',
    tag: 'Control',
  },
  '/risk/concentration/kri': {
    dataIn: 'Limit evaluations across a scope’s run history.',
    why: 'The trend, not just today’s snapshot — is this getting worse, not just is it bad right now.',
    tag: 'Result',
  },
  '/treasury/ftp': {
    dataIn: 'Positions, yield curves, FTP rules.',
    why: 'Prices every position against an internal transfer rate — separates a desk’s real margin from Treasury’s own funding cost.',
    tag: 'Result',
  },
  '/treasury/ftp/profitability': {
    dataIn: 'Positions, FTP results.',
    why: 'Net interest margin, NPL ratio, non-earning assets — what falls out once every position carries a transfer-priced margin.',
    tag: 'Result',
  },
  '/treasury/balance-sheet': {
    dataIn: 'Positions, the selected run.',
    why: 'The shape of what the bank owns and owes, at a glance.',
    tag: 'Result',
  },
  '/treasury/balance-sheet/fx-position': {
    dataIn: 'Positions and FX rates, from a completed run.',
    why: 'Net open position per currency — this is calculated from a run, never something you upload directly.',
    tag: 'Result',
  },
  '/reporting': {
    dataIn: 'A completed run’s results.',
    why: 'The ALCO pack and the Management pack, generated from a real run — not typed into a table by hand.',
    tag: 'Result',
  },
  '/reporting/regulatory': {
    dataIn: 'A completed run’s results.',
    why: 'Statutory submissions, built the same way as the ALCO pack — one real run behind every figure.',
    tag: 'Result',
  },
  '/reporting/ad-hoc': {
    dataIn: 'A completed run’s results.',
    why: 'For the one-off request that doesn’t fit any standing report.',
    tag: 'Result',
  },
  '/data/operations': {
    dataIn: 'A CSV file — or nothing, if this domain already has a configured connector.',
    why: 'Where the position book (and other domains) actually enters the platform. Staged rows are editable; committed rows are not.',
    tag: 'Input',
  },
  '/data/operations/gl-reconciliation': {
    dataIn: 'Committed positions, an uploaded trial balance.',
    why: 'Checks the detailed position data agrees with the accounting ledger before either is trusted downstream.',
    tag: 'Control',
  },
  '/data/operations/vintages': {
    dataIn: 'Every load batch, past and present.',
    why: 'The full history of what was loaded, when, by whom — including versions a later load superseded.',
    tag: 'Control',
  },
  '/data/structure': {
    dataIn: 'Seeded at onboarding; grows from a position file that references a new code.',
    why: 'How every position is classified — legal entity, business unit, product, GL account, counterparty.',
    tag: 'Reference data',
  },
  '/data/structure/counterparties': {
    dataIn: 'Seeded per affiliate, or added manually or from a position file.',
    why: 'Who the bank’s obligors and depositors actually are — what makes concentration computable at all.',
    tag: 'Reference data',
  },
  '/data/reference-data': {
    dataIn: 'Entered manually, per currency.',
    why: 'Yield curves used for discounting, and for FTP’s internal transfer rate.',
    tag: 'Reference data',
  },
  '/data/reference-data/fx-rates': {
    dataIn: 'Entered manually.',
    why: 'Every consolidated Group figure converts through these — a missing rate fails the calculation rather than silently dropping that currency.',
    tag: 'Reference data',
  },
  '/data/reference-data/economic-indicators': {
    dataIn: 'Entered manually, one observation at a time.',
    why: 'Macro series (inflation, policy rates) that drive behavioural assumptions and stress-scenario narratives.',
    tag: 'Reference data',
  },
  '/data/reference-data/holiday-calendar': {
    dataIn: 'Entered manually, per jurisdiction.',
    why: 'A payment due on a holiday shifts to the next business day — which can move it into a different liquidity bucket.',
    tag: 'Reference data',
  },
  '/execution': {
    dataIn: 'Everything before it — positions, reference data, assumptions.',
    why: 'The actual calculation step. Nothing earlier in the journey is anything but preparing its inputs.',
    tag: 'Input',
  },
  '/execution/history': {
    dataIn: 'Every run that’s been executed.',
    why: 'Read-only record of every run — what it used as inputs, and what it produced.',
  },
  '/execution/scheduler': {
    dataIn: 'Configured run and load schedules.',
    why: 'Automates when a run, or a load, is expected to happen.',
  },
  '/configuration': {
    dataIn: 'Configured by an Administrator or Risk Analyst.',
    why: 'The assumptions the engine models with — behavioural patterns, prepayment, discount methods.',
    tag: 'Assumptions',
  },
  '/configuration/validation-rules': {
    dataIn: 'Configured; applied to every uploaded file.',
    why: 'The rules that decide what counts as valid position data before it can even be staged.',
    tag: 'Control',
  },
  '/affiliates': {
    dataIn: 'Every affiliate’s own record.',
    why: 'The Group directory — who’s Live, who’s still onboarding, and how fresh each one’s data is.',
  },
  '/connectors': {
    dataIn: 'Configured per system, per affiliate.',
    why: 'The shared catalogue of systems like Flexcube and Reuters — and whether each affiliate’s domains are fed by one, or by a declared file substitution.',
    tag: 'Control',
  },
  '/admin': {
    dataIn: 'Requests raised by a maker.',
    why: 'Segregation of duties — whoever raises a request can’t also decide it. This is where an onboarded affiliate actually goes Live.',
    tag: 'Control',
  },
  '/admin/remediation': {
    dataIn: 'Findings raised against a control.',
    why: 'Tracks a control weakness from identification through to closure.',
    tag: 'Control',
  },
  '/admin/notifications': {
    dataIn: 'System and workflow events.',
    why: 'What needs your attention, gathered in one place.',
  },
  '/admin/users': {
    dataIn: 'Configured by an Administrator.',
    why: 'Who can do what — the permission model every other screen in this tour is actually enforcing.',
    tag: 'Control',
  },
  '/admin/preferences': {
    dataIn: 'Configured by an Administrator.',
    why: 'Platform-wide settings.',
  },
  '/admin/audit': {
    dataIn: 'Every audited mutation across the platform.',
    why: 'The evidence trail — who changed what, and when.',
    tag: 'Control',
  },
};

/** Full, permission-filtered journey for a role — real coverage, not a curated highlight reel. */
export function tourStepsFor(role: Role | null | undefined): TourStep[] {
  if (!role) return [INTRO];

  const screens: TourStep[] = SEARCH_INDEX.filter((item) => role.permissions.includes(item.permission)).map(
    (item) => {
      const content = SCREEN_CONTENT[item.path];
      return {
        id: item.path,
        path: item.path,
        title: item.name,
        dataIn: content?.dataIn ?? 'See the screen for its inputs.',
        why: content?.why ?? '',
        tag: content?.tag,
      };
    },
  );

  return [INTRO, ...screens];
}
