import type { Role } from '@/engine/types';
import { sel, type TourStep } from './tourTypes';

/** Bump whenever the tour changes - every user sees the new version once. */
export const TOUR_VERSION = 5;

/** A step that only shows for roles holding `permission`; no permission = everyone. */
type Step = TourStep & { permission?: string };

export interface TourDef {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

const s = (route: string, selector: string | null, title: string, body: string, extra: Partial<Step> = {}): Step => ({
  route,
  selector,
  title,
  body,
  ...extra,
});

const FIRST_ROW = sel.firstView('[data-tour="table"]');
const ROW_DETAIL = sel.tour('row-detail');
const TABLE = sel.tour('table');
const METRICS = sel.tour('metrics');
const ACTIONS = sel.tour('page-actions');

// ─── Shared header (home page, always first) ───────────────────────────────

const SHELL: Step[] = [
  s(
    '/dashboard',
    sel.tour('nav'),
    'The main menu',
    'Home, Data, Assumptions, Run & results, Approvals, Reports and Admin - in the order the work happens. You only see what your role can use.',
  ),
  s(
    '/dashboard',
    sel.tour('search'),
    'Jump to any screen',
    'Press Ctrl+K (or click here) and type a screen name - faster than the menu once you know what you want.',
  ),
  s(
    '/dashboard',
    sel.tour('scope'),
    'Which entity you are looking at',
    'Group users can switch between the consolidated Group and one affiliate. Affiliate users are always on their own affiliate.',
  ),
  s(
    '/dashboard',
    sel.tour('asof'),
    'The run behind every number',
    'Every screen reads this run: affiliate, date, version and whether it is signed off. Click it to look at another date or an older version.',
  ),
  s(
    '/dashboard',
    sel.tour('notifications'),
    'What changed for you',
    'Market data arriving, your requests approved or rejected, ledger sign-offs, an affiliate going Live - each with a link straight to it.',
  ),
  s(
    '/dashboard',
    sel.tour('help'),
    'Replay or pick a tour',
    'Click ? any time to replay this tour, or take a deeper tour of one module.',
  ),
  s(
    '/dashboard',
    sel.tour('user-menu'),
    'Your account',
    'See your role, change your password in My Account, or sign out.',
  ),
];

// ─── Page step arrays ──────────────────────────────────────────────────────

const DASHBOARD: Step[] = [
  s(
    '/dashboard',
    sel.tour('run-strip'),
    'Every number comes from one run',
    'This strip names the run behind the page. "Source data" shows exactly which uploaded files it used.',
  ),
  s(
    '/dashboard',
    sel.tour('kpis'),
    'The four headline ratios',
    'LCR, NSFR, survival horizon and loan-to-deposit. Click any card to open the screen behind it.',
  ),
  s(
    '/dashboard',
    'heading:Rate shock sensitivity',
    'How rate moves hit capital',
    'The change in economic value of equity under each regulatory rate shock. The longest bar is the scenario to worry about.',
  ),
  s(
    '/dashboard',
    'heading:Market',
    'Market and rate monitor',
    'Policy rates, interbank rates and FX on the run date - the market backdrop for these results.',
  ),
  s(
    '/dashboard',
    'heading:Active breaches',
    'What needs attention',
    'Any limit currently in breach for this scope. Click one to go straight to it.',
  ),
  s(
    '/dashboard',
    sel.tour('empty-state'),
    'No run yet',
    'Results only appear once a run has completed for this scope. Load data, then execute a run on Run now.',
  ),
];

// Phase 4: data arrives through sources. Minimal steps until the tour is rewritten.
const UPLOAD: Step[] = [
  s(
    '/data/operations',
    sel.tour('module-tabs'),
    'Data',
    'Sources, the history of every load, the position book and the dimension structure - all of the inputs every calculation depends on.',
    { permission: 'data.view' },
  ),
  s(
    '/data/operations',
    sel.tour('sources-table'),
    'Data sources',
    'Each source belongs to one affiliate (or Group, for market data) and carries one kind of data. Click a source to see its lobby, fields and loads.',
    { permission: 'data.view' },
  ),
  s('/data/operations', sel.tour('upload-data'), 'Upload data', 'Next opens the upload window.', {
    permission: 'data.upload',
    clickOnNext: true,
  }),
  s(
    '',
    sel.tour('upload-drop'),
    'Drop your files',
    'Drop one or several files. Each goes to the source whose columns it matches, and is checked before anything is saved: row counts, column matching, the date in the file, duplicates and unknown codes.',
    { permission: 'data.upload' },
  ),
  s(
    '',
    sel.drawer(),
    'Admit, or send to the lobby',
    '"Upload & admit" makes the data live straight away; "Send to lobby" lets someone review it first. The tour closes this window without saving.',
    { permission: 'data.upload' },
  ),
];

const GL_REC: Step[] = [];

const POSITION_BOOK: Step[] = [
  s(
    '/data/operations/position-book',
    TABLE,
    'The Position Book',
    'Every committed position, one row each: product, amount, maturity and HQLA level. This is the single data set every engine reads.',
    { permission: 'data.view' },
  ),
  s(
    '/data/operations/position-book',
    sel.tour('table-search'),
    'Search any table',
    'Type to filter the rows on screen. Every large table in the platform has this box.',
    { permission: 'data.view' },
  ),
  s(
    '/data/operations/position-book',
    sel.tour('table-export'),
    'Export what you see',
    'Downloads the filtered rows as CSV.',
    { permission: 'data.view' },
  ),
  s('/data/operations/position-book', FIRST_ROW, 'Open a position', 'Next opens the row to show all its fields.', {
    permission: 'data.view',
    clickOnNext: true,
  }),
  s(
    '',
    ROW_DETAIL,
    'Where it came from',
    'The full record plus its lineage: the batch that loaded it and every run that consumed it.',
    { permission: 'data.view' },
  ),
];

const VINTAGES: Step[] = [
  s(
    '/data/loads',
    METRICS,
    'Load history',
    'Every file loaded through every source - admitted, waiting, rejected, withdrawn or replaced by a later file.',
    { permission: 'data.view' },
  ),
  s(
    '/data/loads',
    sel.tour('history-table'),
    'Open a load',
    'Click a row to see what its checks found and which positions it admitted.',
    { permission: 'data.view' },
  ),
];

const DIMENSIONS: Step[] = [
  s(
    '/data/structure',
    '[role="tablist"]',
    'Dimensions',
    'Legal entities, business units, the chart of accounts and products - how every position is classified and rolled up.',
    { permission: 'data.view' },
  ),
  s(
    '/data/structure',
    'heading:Hierarchy',
    'The hierarchy',
    'Browse the tree, and add or edit members below it. A new product here should get its Product Characteristics next.',
    { permission: 'data.view' },
  ),
];

const COUNTERPARTIES: Step[] = [
  s(
    '/data/structure/counterparties',
    TABLE,
    'Counterparty register',
    "Who the bank lends to and takes deposits from, with each one's share of deposits - what makes concentration risk measurable.",
    { permission: 'data.view' },
  ),
  s('/data/structure/counterparties', 'button:Add counterparty', 'Register a counterparty', 'Next opens the form.', {
    permission: 'data.configure',
    clickOnNext: true,
  }),
  s(
    '',
    sel.drawer(),
    'The registration form',
    "Code, name and sector. Close it without saving - the tour won't change anything.",
    { permission: 'data.configure' },
  ),
];

const READINESS: Step[] = [
  s(
    '/execution/readiness',
    sel.tour('page-header'),
    'Are we ready to run?',
    'For the scope in the header: at Group, market data and one row per affiliate; for an affiliate, its checklist - data, market data from Group, assumptions and governance - with who can fix each open item.',
    { permission: 'risk.view' },
  ),
];

const PROCESS_RUN: Step[] = [
  s(
    '/execution',
    'heading:Choose what to run',
    'Start from a preset',
    'Daily liquidity check, monthly IRRBB, or the full ALCO pack - each picks the right calculations and rules for you.',
    { permission: 'run.execute' },
  ),
  s(
    '/execution',
    'heading:Run summary',
    'Check before you run',
    'The affiliate, calculations and scenarios the preset will use, and the as-of date of the data.',
    { permission: 'run.execute', click: 'button:Daily Liquidity Check' },
  ),
  s(
    '/execution',
    'heading:Calculation elements',
    'Customise the calculations',
    'Tick exactly what to compute: LCR, NSFR, gaps, NII/EVE, FTP and more.',
    { permission: 'run.execute', click: 'button:Customize' },
  ),
  s(
    '/execution',
    'heading:Rules',
    'Choose the assumptions',
    'Bucket ladder, behavioural patterns, FTP and adjustment rules. The run records the exact version of each it used.',
    { permission: 'run.execute' },
  ),
  s(
    '/execution',
    'heading:Rate scenarios',
    'Rate scenarios',
    'Only approved scenarios can be selected - pending ones are badged and wait in Approvals.',
    { permission: 'run.execute' },
  ),
  s(
    '/execution',
    'heading:Position Book - contributors',
    'Is the data ready?',
    'Which department files are in and whether they are reconciled to the GL.',
    { permission: 'run.execute' },
  ),
  s(
    '/execution',
    'button:Execute run',
    'Execute',
    'Runs every selected calculation and stores the results as the next version (v1, v2...) of this date’s run - provisional until a second person signs it off. If something is missing it stays disabled and says why.',
    { permission: 'run.execute' },
  ),
];

const RUN_HISTORY: Step[] = [
  s(
    '/execution/history',
    'heading:Runs',
    'Every run, by date and version',
    'One row per scope and as-of date: its latest version, sign-off status, who signed it off, and whether the data it used has changed since.',
    { permission: 'risk.view' },
  ),
  s('/execution/history', FIRST_ROW, 'Open a run', 'Next opens the run panel.', {
    permission: 'risk.view',
    clickOnNext: true,
  }),
  s(
    '',
    sel.tour('drawer'),
    'Everything about one run',
    'Versions and their sign-off timeline, the data and assumption versions it used, its sign-off approvals and the reports built from it. Re-run, request sign-off, reopen or compare from here.',
    { permission: 'risk.view' },
  ),
  s(
    '',
    'button:View as current',
    'Point the results screens at this version',
    'Every results screen then reads this version instead of the official one, for this session - flagged as not official.',
    { permission: 'risk.view' },
  ),
];

const SCHEDULER: Step[] = [
  s(
    '/execution/scheduler',
    'button:New schedule',
    'Automate a run',
    'Repeat an existing run daily, weekly or monthly; missed occurrences are flagged so you can run them.',
    { permission: 'run.execute' },
  ),
];

const LIQUIDITY: Step[] = [
  s(
    '/risk/liquidity',
    METRICS,
    'Liquidity at a glance',
    "LCR, NSFR, loan-to-deposit and the largest affiliate's deposit share - can the bank meet its obligations.",
    { permission: 'risk.view' },
  ),
  s(
    '/risk/liquidity',
    'heading:Maturity gap',
    'Behavioural gap',
    'When cash really arrives and leaves, using behavioural assumptions (e.g. how long "on-demand" deposits actually stay).',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/liquidity',
    'heading:Maturity gap',
    'Contractual gap',
    'The same ladder on contract dates only. The difference between the two is what your behavioural assumptions are worth.',
    { permission: 'risk.view', click: 'button:Contractual' },
  ),
  s(
    '/risk/liquidity',
    'heading:Cross-currency',
    'Funding by currency',
    "Assets against liabilities in each currency - a surplus in one currency can't always cover a shortfall in another.",
    { permission: 'risk.view' },
  ),
  s(
    '/risk/liquidity',
    'heading:Liquidity Coverage Ratio',
    'How LCR is built',
    'High-quality liquid assets against 30-day net outflows, with the components behind the ratio.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/liquidity',
    'heading:Deposit core',
    'Core vs volatile deposits',
    'How much of each deposit product is stable and how much could run - driven by the behavioural pattern rule.',
    { permission: 'risk.view' },
  ),
];

const GAP: Step[] = [
  s(
    '/risk/liquidity/gap-analysis',
    'heading:Maturity gap',
    'The maturity ladder',
    'Assets and liabilities per time bucket, and the cumulative gap. A deep negative bucket is a funding need.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/liquidity/gap-analysis',
    'heading:Repricing gap',
    'The repricing ladder',
    'The same balance sheet bucketed by when rates reset - the basis for interest-rate risk.',
    { permission: 'risk.view', click: 'button:repricing' },
  ),
  s(
    '/risk/liquidity/gap-analysis',
    'heading:The ladder as numbers',
    'The figures',
    'The exact numbers behind the chart, bucket by bucket.',
    { permission: 'risk.view' },
  ),
];

const IRRBB: Step[] = [
  s(
    '/risk/irrbb',
    METRICS,
    'Interest rate risk',
    "NII sensitivity (next year's earnings) and EVE sensitivity (value of the balance sheet) - two different questions.",
    { permission: 'risk.view' },
  ),
  s(
    '/risk/irrbb',
    'heading:Shock scenarios',
    'Shock scenarios',
    'The impact of each rate scenario. The run uses the approved scenario you selected.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/irrbb',
    'heading:Yield curve',
    'The curve used',
    'The active yield curve for the reporting currency - maintained in Reference Data.',
    { permission: 'risk.view' },
  ),
  s('/risk/irrbb', 'heading:Scenario detail', 'Scenario detail', 'NII and EVE impact per scenario as numbers.', {
    permission: 'risk.view',
  }),
];

const BEHAVIOURAL: Step[] = [
  s(
    '/risk/irrbb/behavioural-analysis',
    METRICS,
    'Behavioural assumptions',
    "How much of the deposit base is treated as core, and how much isn't modelled at all.",
    { permission: 'risk.view' },
  ),
  s(
    '/risk/irrbb/behavioural-analysis',
    ACTIONS,
    'Slice it',
    'Group the split by behavioural tag, product or account activity.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/irrbb/behavioural-analysis',
    'heading:Patterns this run applied',
    'The assumptions in force',
    'The run-off tiers this run used - edit them in Behaviour Patterns and re-run to see the effect.',
    { permission: 'risk.view' },
  ),
];

const STRESS: Step[] = [
  s(
    '/risk/stress-testing',
    'heading:Interest rate',
    'Six supervisory shocks',
    'NII and EVE under every Basel rate shock side by side, with the 15%-of-capital outlier test.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/stress-testing',
    'heading:Liquidity',
    'A severe run',
    'How many days the liquidity buffer lasts under a severe deposit run.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/stress-testing',
    'heading:Liquidity',
    'Reverse stress',
    'Works backwards: how bad would outflows have to be to break a target survival horizon.',
    { permission: 'risk.view', click: 'button:Reverse stress' },
  ),
];

const WHAT_IF: Step[] = [
  s(
    '/risk/stress-testing/what-if',
    'heading:Presets',
    'Start from a preset',
    'Severe deposit run-off, interbank freeze, rate plus funding stress, or reverse stress.',
    { permission: 'run.execute' },
  ),
  s(
    '/risk/stress-testing/what-if',
    'heading:Levers',
    'Move the levers',
    'Rate shock, run-off, haircuts, inflows and growth - the results update instantly.',
    { permission: 'run.execute' },
  ),
  s(
    '/risk/stress-testing/what-if',
    'heading:Base versus scenario',
    'Base vs scenario',
    'LCR, NSFR and survival before and after your scenario.',
    { permission: 'run.execute' },
  ),
  s(
    '/risk/stress-testing/what-if',
    'button:Submit scenario',
    'Make it official',
    'Submit the scenario for approval; once approved it can be selected in Run now.',
    { permission: 'run.execute' },
  ),
];

const FORECAST: Step[] = [
  s(
    '/risk/stress-testing/forecast',
    '#fc-rule',
    'Project forward',
    'Add a new-business plan to the current book, or leave it at run-off only.',
    { permission: 'run.execute' },
  ),
  s(
    '/risk/stress-testing/forecast',
    'heading:LCR across',
    'Ratios over time',
    'LCR and NSFR period by period, to spot a future breach before it happens.',
    { permission: 'run.execute' },
  ),
];

const CONCENTRATION: Step[] = [
  s(
    '/risk/concentration',
    METRICS,
    'Concentration',
    'The largest depositor, top five and top ten shares, and the Herfindahl index.',
    { permission: 'risk.view' },
  ),
  s(
    '/risk/concentration',
    'heading:Largest depositors',
    'Who the bank depends on',
    "Each large depositor's share; anything above the large-exposure threshold is flagged.",
    { permission: 'risk.view' },
  ),
];

const LIMITS: Step[] = [
  s(
    '/monitoring',
    'heading:Limit framework',
    'Limits and breaches',
    'Every limit with its current value, amber and red thresholds, headroom and status. Regulatory floors are shown separately from internal appetite.',
    { permission: 'risk.view' },
  ),
  s('/monitoring', FIRST_ROW, 'Open a limit', 'Next opens its detail.', { permission: 'risk.view', clickOnNext: true }),
  s('', ROW_DETAIL, 'Limit detail', 'Direction, thresholds, scope and who last changed them.', {
    permission: 'risk.view',
  }),
  s(
    '',
    'button:Edit thresholds',
    'Change a threshold',
    "Adjust amber and red levels. The regulatory floor can't be loosened.",
    { permission: 'risk.view' },
  ),
  s(
    '',
    'button:Record a breach note',
    'Explain a breach',
    'Record cause, action and target date - the evidence ALCO and auditors ask for.',
    { permission: 'risk.view' },
  ),
];

const KRI: Step[] = [
  s(
    '/monitoring/kri',
    'heading:Indicators',
    'Key risk indicators',
    'The trend across runs, not just today - is a metric getting worse, and how fast.',
    { permission: 'risk.view' },
  ),
  s('/monitoring/kri', FIRST_ROW, 'Open an indicator', 'Next shows its trend chart.', {
    permission: 'risk.view',
    clickOnNext: true,
  }),
  s('', ROW_DETAIL, 'The trend', 'Each observation over time and what happens if the trend persists.', {
    permission: 'risk.view',
  }),
];

const RISK_MAP: Step[] = [
  s(
    '/monitoring/risk-map',
    TABLE,
    'Group risk map',
    "Every Live affiliate's liquidity position on one table, ranked by severity.",
    { permission: 'risk.view' },
  ),
  s(
    '/monitoring/risk-map',
    FIRST_ROW,
    'Why it is rated so',
    "Next shows the main driver behind an affiliate's rating.",
    { permission: 'risk.view', clickOnNext: true },
  ),
  s('', ROW_DETAIL, 'Primary driver', 'The one number pushing the rating - where to look first.', {
    permission: 'risk.view',
  }),
];

const FTP: Step[] = [
  s(
    '/treasury/ftp',
    METRICS,
    'Funds transfer pricing',
    'Total FTP margin, and how much of the book is priced. Unpriced positions are reported, never silently zero.',
    { permission: 'treasury.view' },
  ),
  s(
    '/treasury/ftp',
    'heading:Margin by business unit',
    'Margin by business unit',
    "Each unit's margin after paying Treasury for funding - its real contribution.",
    { permission: 'treasury.view' },
  ),
  s(
    '/treasury/ftp',
    'heading:Transfer rate detail',
    'Position-level rates',
    'Base rate from the curve, add-ons such as the liquidity premium, and the all-in transfer rate for every position.',
    { permission: 'treasury.view' },
  ),
  s('/treasury/ftp', FIRST_ROW, 'Open a position', 'Next shows how its rate was built.', {
    permission: 'treasury.view',
    clickOnNext: true,
  }),
  s('', ROW_DETAIL, 'The add-on stack', 'Each adjustment applied to this position and why.', {
    permission: 'treasury.view',
  }),
];

const PROFITABILITY: Step[] = [
  s(
    '/treasury/ftp/profitability',
    METRICS,
    'Profitability ratios',
    'Net interest margin, NPL ratio and coverage, and non-earning assets.',
    { permission: 'risk.view' },
  ),
  s(
    '/treasury/ftp/profitability',
    'heading:Profitability by segment',
    'By product',
    'Assets, net interest income and margin per product.',
    { permission: 'risk.view' },
  ),
  s(
    '/treasury/ftp/profitability',
    'heading:Profitability by segment',
    'By business unit',
    'The same view per business unit.',
    { permission: 'risk.view', click: 'button:By business unit' },
  ),
];

const BALANCE_SHEET: Step[] = [
  s(
    '/treasury/balance-sheet',
    ACTIONS,
    'Roll it up any way',
    'View the balance sheet by common chart of accounts, business unit, product or local GL.',
    { permission: 'treasury.view' },
  ),
  s('/treasury/balance-sheet', FIRST_ROW, 'Drill down', 'Next opens a line to the positions inside it.', {
    permission: 'treasury.view',
    clickOnNext: true,
  }),
  s('', ROW_DETAIL, 'Down to the position', 'The positions behind the line, each linked to its source file.', {
    permission: 'treasury.view',
  }),
];

const FX_POSITION: Step[] = [
  s(
    '/treasury/balance-sheet/fx-position',
    'heading:Net open position',
    'FX exposure',
    'Net open position per currency and as a share of capital, flagged above the regulatory limit.',
    { permission: 'treasury.view' },
  ),
];

const REPORT_PACKS: Step[] = [
  s(
    '/reporting',
    'button:ALCO pack',
    'ALCO and management packs',
    'Switch between the two pack types; each is generated from a completed run, never typed in.',
    { permission: 'reporting.view' },
  ),
  s('/reporting', 'button:Generate pack', 'Generate a pack', 'Next opens the form.', {
    permission: 'reporting.generate',
    clickOnNext: true,
  }),
  s(
    '/reporting',
    'heading:New pack',
    'Pick the source run',
    'Choose the run; the section chips turn green for every section that run computed. The tour leaves without generating.',
    { permission: 'reporting.generate' },
  ),
];

const REGULATORY: Step[] = [
  s(
    '/reporting/regulatory',
    TABLE,
    'Regulatory returns',
    'Each statutory return with its regulator, period, due date and status.',
    { permission: 'reporting.view' },
  ),
  s('/reporting/regulatory', FIRST_ROW, 'Open a return', 'Next opens the CBN monthly liquidity return.', {
    permission: 'reporting.view',
    clickOnNext: true,
  }),
  s(
    '',
    ROW_DETAIL,
    'Figures against floors',
    'Each reported metric from the attached run, against its regulatory floor.',
    { permission: 'reporting.view' },
  ),
  s('', 'button:Submit', 'Submit', 'Only someone other than the preparer can submit a return under review.', {
    permission: 'reporting.view',
  }),
];

const AD_HOC: Step[] = [
  s('/reporting/ad-hoc', 'heading:Metrics', 'Pick metrics', 'Choose any computed metrics to compare.', {
    permission: 'reporting.view',
  }),
  s(
    '/reporting/ad-hoc',
    'heading:Affiliates',
    'Pick affiliates',
    'Compare them across affiliates, each from its latest completed run.',
    { permission: 'reporting.view' },
  ),
];

const APPROVALS: Step[] = [
  s(
    '/controls',
    'button:Waiting for me',
    'Waiting for me',
    'Requests you are allowed to decide: run sign-offs, assumption changes, affiliate go-live, limit changes.',
    { permission: 'risk.view' },
  ),
  s(
    '/controls',
    'button:Raised by me',
    'Raised by me',
    'Requests you sent. Someone else decides them - whoever raised a request can never approve it.',
    { permission: 'risk.view' },
  ),
  s('/controls', 'button:History', 'History', 'Every request, with filters for type, affiliate, status and date.', {
    permission: 'risk.view',
  }),
];

const REMEDIATION: Step[] = [
  s(
    '/controls/remediation',
    'heading:Open',
    'Control issues board',
    'Issues move Open → In progress → Verified → Closed. Click a card for its timeline and next step. The owner cannot close their own issue.',
    { permission: 'risk.view' },
  ),
  s(
    '/controls/remediation',
    'button:New issue',
    'Log an issue',
    'Raise one by hand - or let a limit breach or rejected upload raise it for you.',
    { permission: 'risk.view' },
  ),
];

const AFFILIATES: Step[] = [
  s(
    '/setup/organisation',
    'nav[aria-label="Organisation setup steps"]',
    'Your organisation',
    'Organisation details, affiliates (add one, invite its admin), defaults and Group assumptions - all in one place.',
    { permission: 'group.manage' },
  ),
];

const RULE_EDITORS: Step[] = [
  s(
    '/rules/behaviour-patterns',
    '#rule-search',
    'Behavioural patterns',
    'The deposit run-off assumptions every behavioural calculation uses. Pick a rule to view or edit it.',
    { permission: 'rules.edit' },
  ),
  s('/rules/ftp', ACTIONS, 'FTP rules', 'Assign a transfer-pricing curve to each product class.', {
    permission: 'rules.edit',
  }),
];

const NOTIFICATIONS: Step[] = [
  s(
    '/admin',
    'heading:Notification rules',
    'Notification rules',
    'Who gets alerted, on which channel, for which event and severity - with optional escalation.',
    { permission: 'dashboard.view' },
  ),
  s('/admin', 'button:New rule', 'Add a rule', 'Next opens the form.', {
    permission: 'admin.manage',
    clickOnNext: true,
  }),
  s(
    '',
    sel.drawer(),
    'The rule',
    'Event, channel, minimum severity, recipients and escalation. Cancel - nothing is saved.',
    { permission: 'admin.manage' },
  ),
];

const USERS: Step[] = [
  s('/admin/users', 'heading:Users', 'Users', 'Everyone with access, their role, scope and MFA status.', {
    permission: 'users.manage',
  }),
  s('/admin/users', FIRST_ROW, 'Open a user', 'Next shows their permissions.', {
    permission: 'users.manage',
    clickOnNext: true,
  }),
  s('', ROW_DETAIL, 'What they can do', "The role's permissions, plus Edit and Disable.", {
    permission: 'users.manage',
  }),
  s('/admin/users', 'heading:Roles', 'Roles', "Each role's permission set - editable, and enforced on every screen.", {
    permission: 'users.manage',
  }),
];

const PREFERENCES: Step[] = [
  s(
    '/admin/preferences',
    sel.section('Reset demo data'),
    'Reset',
    "Wipes this browser's database back to the empty platform. It asks twice.",
    { permission: 'admin.manage' },
  ),
];

const AUDIT: Step[] = [
  s('/admin/audit', TABLE, 'The audit trail', 'Every change: who, what, when and the outcome. Append-only.', {
    permission: 'audit.view',
  }),
  s('/admin/audit', FIRST_ROW, 'Open an event', 'Next shows the full record.', {
    permission: 'audit.view',
    clickOnNext: true,
  }),
  s('', ROW_DETAIL, 'Event detail', 'User, role, time and the exact change.', { permission: 'audit.view' }),
];

const ACCOUNT: Step[] = [
  s('/account', 'heading:Password', 'Your account', 'Update your name and email, and change your password here.'),
];

const HISTORY: Step[] = [
  s(
    '/data/loads',
    sel.tour('history-table'),
    'Every load, in one place',
    'Admitted, waiting in the lobby, rejected or withdrawn - with what the checks found. Market data is loaded once by Group for every affiliate.',
    { permission: 'data.view' },
  ),
];

const MODELS: Step[] = [
  s(
    '/assumptions',
    sel.tour('page-header'),
    'Behavioural models',
    'Fit deposit stability and run-off, repricing betas, loan prepayment and term-deposit behaviour from your history - all inside the platform.',
    { permission: 'risk.view' },
  ),
  s(
    '/assumptions',
    'heading:1what to model',
    'Pick a model',
    'Each model says what it produces and which history it needs.',
    { permission: 'risk.view' },
  ),
  s(
    '/assumptions',
    'heading:4back-test',
    'Back-test before you trust it',
    'The last months are held out and predicted; the result passes or fails against your tolerance.',
    { permission: 'risk.view' },
  ),
  s(
    '/assumptions',
    'button:Fit model',
    'Fit, then propose',
    'Fit shows parameters with 95% intervals and fit statistics. Save it to the register, then propose it - a second person approves before any run uses it.',
    { permission: 'risk.view' },
  ),
];

const REGISTER: Step[] = [
  s(
    '/assumptions/models',
    TABLE,
    'Model register',
    'A tab inside Behavioural models: every fitted model, its fit and back-test, and its approval - "Approved & in use", "pending approval" or "Rejected", linked to the request.',
    { permission: 'risk.view' },
  ),
];

const RULES_HUB: Step[] = [
  s(
    '/assumptions/rules',
    sel.section('Customer behaviour'),
    'Rules, grouped by what they change',
    'Only rules a calculation actually uses are listed. Every save is versioned and needs approval before runs use it.',
    { permission: 'risk.view' },
  ),
  s(
    '/assumptions/rules',
    sel.section('Transfer pricing'),
    'Transfer pricing',
    'Choose the FTP method per product class - matched maturity, duration, average life, repricing term or pooled - and the add-ons.',
    { permission: 'risk.view' },
  ),
  s(
    '/assumptions/rules',
    sel.section('Profitability'),
    'Profitability layers',
    'Operating cost pools, expected credit loss and capital charge - the layers below the FTP margin.',
    { permission: 'risk.view' },
  ),
];

const PROFIT_LAYERS: Step[] = [
  s(
    '/treasury/ftp/profitability',
    'heading:Fully-loaded profitability',
    'Fully-loaded profitability',
    'Client interest, FTP funding cost, operating expenses, expected credit loss and capital charge, down to risk-adjusted profit and RAROC.',
    { permission: 'risk.view' },
  ),
  s(
    '/treasury/ftp/profitability',
    'heading:Cost pool reconciliation',
    'Every cost accounted for',
    'Each operating cost pool against what was allocated - anything unallocated is shown, never lost.',
    { permission: 'risk.view' },
  ),
];

// ─── Tours ─────────────────────────────────────────────────────────────────

const welcome = (title: string, body: string): Step => s('/dashboard', null, title, body, { section: 'Welcome' });
const finish = (body: string): Step => s('/dashboard', sel.tour('help'), "That's the tour", body, { section: 'Done' });

const GETTING_STARTED: Step[] = [
  welcome(
    'Welcome to the ALM platform',
    'A short walk through the work, in the order you do it: Home, Data, Assumptions, Run & results, Approvals and Reports. Use → and ← to move, Esc to leave.',
  ),
  ...SHELL,
  DASHBOARD[0]!,
  DASHBOARD[1]!,
  DASHBOARD[5]!,
  UPLOAD[1]!,
  UPLOAD[2]!,
  UPLOAD[3]!,
  UPLOAD[4]!,
  HISTORY[0]!,
  MODELS[0]!,
  RULES_HUB[0]!,
  READINESS[0]!,
  PROCESS_RUN[6]!,
  RUN_HISTORY[0]!,
  LIQUIDITY[0]!,
  FTP[0]!,
  PROFIT_LAYERS[0]!,
  APPROVALS[0]!,
  APPROVALS[1]!,
  REPORT_PACKS[0]!,
  finish('Click ? any time to replay this, or take a short tour of one area.'),
];

const MODULES: { id: string; title: string; description: string; steps: Step[] }[] = [
  {
    id: 'setup',
    title: 'Organisation',
    description: 'Organisation details, affiliates, defaults and Group assumptions',
    steps: [...AFFILIATES],
  },
  {
    id: 'data',
    title: 'Data',
    description: 'Upload, reconcile, Position Book, load history, history for models, structure',
    steps: [...UPLOAD, ...GL_REC, ...POSITION_BOOK, ...VINTAGES, ...HISTORY, ...DIMENSIONS, ...COUNTERPARTIES],
  },
  {
    id: 'assumptions',
    title: 'Assumptions',
    description: 'Calibrate behavioural models, model register, rules & scenarios',
    steps: [...MODELS, ...REGISTER, ...RULES_HUB, ...RULE_EDITORS],
  },
  {
    id: 'run',
    title: 'Run, liquidity & rates',
    description: 'Readiness, run now, schedules, LCR/NSFR, gaps, concentration, NII/EVE, behaviour',
    steps: [
      ...READINESS,
      ...PROCESS_RUN,
      ...SCHEDULER,
      ...LIQUIDITY,
      ...GAP,
      ...CONCENTRATION,
      ...IRRBB,
      ...BEHAVIOURAL,
      ...RUN_HISTORY,
    ],
  },
  {
    id: 'stress',
    title: 'Stress & limits',
    description: 'Supervisory shocks, What-If, Forecast, limits, KRIs, risk map',
    steps: [...STRESS, ...WHAT_IF, ...FORECAST, ...LIMITS, ...KRI, ...RISK_MAP],
  },
  {
    id: 'treasury',
    title: 'FTP & profitability',
    description: 'Transfer pricing, fully-loaded profitability, balance sheet, FX',
    steps: [...FTP, ...PROFIT_LAYERS, ...PROFITABILITY, ...BALANCE_SHEET, ...FX_POSITION],
  },
  {
    id: 'approve',
    title: 'Approvals & reports',
    description: 'Maker-checker approvals, control issues, ALCO packs, regulatory returns',
    steps: [...APPROVALS, ...REMEDIATION, ...REPORT_PACKS, ...REGULATORY, ...AD_HOC],
  },
  {
    id: 'admin',
    title: 'Admin',
    description: 'Users & roles, notifications, audit, preferences, your account',
    steps: [...USERS, ...NOTIFICATIONS, ...AUDIT, ...PREFERENCES, ...ACCOUNT],
  },
];

function forRole(steps: Step[], role: Role): TourStep[] {
  return steps
    .filter((st) => !st.permission || st.permission.split('|').some((p) => role.permissions.includes(p)))
    .map(({ permission: _p, ...st }) => st);
}

export const GETTING_STARTED_ID = 'getting-started';

/** Every tour this role can take - Getting started first, then module tours with at least one visible step. */
export function toursFor(role: Role | null | undefined): TourDef[] {
  if (!role) return [];
  const gs: TourDef = {
    id: GETTING_STARTED_ID,
    title: 'Getting started',
    description: 'The daily flow, start to finish',
    steps: forRole(GETTING_STARTED, role),
  };
  const modules = MODULES.map((m) => {
    const steps = forRole(m.steps, role);
    if (steps.length === 0) return null;
    const intro = s(
      steps.find((st) => st.route)?.route ?? m.steps[0]!.route,
      null,
      m.title,
      `${m.description}. Use → and ← to move, Esc to leave.`,
      { section: m.title },
    );
    return { id: m.id, title: m.title, description: m.description, steps: [intro, ...steps] };
  }).filter((t): t is TourDef => t !== null);
  return [gs, ...modules];
}
