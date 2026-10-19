"""Builds the Ecobank ALM clarification response in the exact format of the Nepal BRD: the Nepal file is the
template (cover page with the Qucoon logo, Biome font, Heading 1 style, justified body, navy-header tables,
sign-off table). Only the content changes."""
import copy
import sys
from docx import Document
from docx.oxml.ns import qn

SRC = sys.argv[1]
OUT = sys.argv[2]
d = Document(SRC)
body = d.element.body
paras = d.paragraphs

# ── Templates lifted from the Nepal document ──
T_HEADING = copy.deepcopy(paras[18]._p)          # "1. Introduction"
T_BODY = copy.deepcopy(paras[19]._p)             # bold lead + text
T_PLAIN = copy.deepcopy(paras[29]._p)            # body paragraph, no bold lead
T_BULLET = copy.deepcopy(paras[44]._p)           # List Bullet
T_TABLE = copy.deepcopy(d.tables[0]._tbl)        # navy header table
T_SIGN = copy.deepcopy(d.tables[4]._tbl)         # sign-off table


def set_text(p_el, text):
    """Put `text` in the paragraph's first run, drop the other runs."""
    runs = p_el.findall(qn('w:r'))
    for r in runs[1:]:
        p_el.remove(r)
    t = runs[0].find(qn('w:t'))
    t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    return p_el


# ── Cover: same layout, new words ──
def cover(i, text):
    p = paras[i]._p
    set_text(p, text)


cover(9, 'Clarification Response & Validation Guide')
cover(10, 'Ecobank Group – Asset & Liability Management (ALM) Platform')
cover(14, '19th October 2026')

# ── Drop the Nepal body (everything after the cover page break), keep the section settings ──
cover_end = paras[17]._p
el = cover_end.getnext()
while el is not None and el.tag != qn('w:sectPr'):
    nxt = el.getnext()
    body.remove(el)
    el = nxt
sect = body.find(qn('w:sectPr'))


def add(el):
    sect.addprevious(el)


def heading(text):
    add(set_text(copy.deepcopy(T_HEADING), text))


def lead(bold, text):
    p = copy.deepcopy(T_BODY)
    r1, r2 = p.findall(qn('w:r'))[:2]
    r1.find(qn('w:t')).text = bold + ' '
    r2.find(qn('w:t')).text = text
    for r in p.findall(qn('w:r'))[2:]:
        p.remove(r)
    add(p)


def plain(text):
    p = set_text(copy.deepcopy(T_PLAIN), text)
    # No first-line indent - flush with the other paragraphs.
    ppr = p.find(qn('w:pPr'))
    if ppr is not None:
        for ind in ppr.findall(qn('w:ind')):
            ppr.remove(ind)
        ppr.append(ppr.makeelement(qn('w:ind'), {qn('w:left'): '0', qn('w:firstLine'): '0'}))
    add(p)


def bullet(text):
    add(set_text(copy.deepcopy(T_BULLET), text))


def spacer():
    p = copy.deepcopy(T_PLAIN)
    for r in p.findall(qn('w:r')):
        p.remove(r)
    add(p)


def table(header, rows, widths):
    """A table in the Nepal style: navy header row, bordered 9pt body rows, given column widths (twips)."""
    tbl = copy.deepcopy(T_TABLE)
    trs = tbl.findall(qn('w:tr'))
    head_tr, body_tr = trs[0], trs[1]
    for tr in trs:
        tbl.remove(tr)
    grid = tbl.find(qn('w:tblGrid'))
    for g in list(grid):
        grid.remove(g)
    total = sum(widths)
    tbl.find(qn('w:tblPr')).find(qn('w:tblW')).set(qn('w:w'), str(total))
    for w in widths:
        g = copy.deepcopy(trs[0].find(qn('w:tc')))  # placeholder to get namespace right
        col = grid.makeelement(qn('w:gridCol'), {qn('w:w'): str(w)})
        grid.append(col)

    def make_row(template_tr, values):
        tr = copy.deepcopy(template_tr)
        cells = tr.findall(qn('w:tc'))
        proto = cells[0]
        for c in cells:
            tr.remove(c)
        for value, w in zip(values, widths):
            tc = copy.deepcopy(proto)
            tc.find(qn('w:tcPr')).find(qn('w:tcW')).set(qn('w:w'), str(w))
            p = tc.find(qn('w:p'))
            set_text(p, value)
            tr.append(tc)
        return tr

    tbl.append(make_row(head_tr, header))
    for r in rows:
        tbl.append(make_row(body_tr, r))
    add(tbl)


# ══ Content ══


def subhead(text):
    """A capability title: the body paragraph's bold lead, in the heading navy, a little larger."""
    p = copy.deepcopy(T_BODY)
    runs = p.findall(qn('w:r'))
    for r in runs[1:]:
        p.remove(r)
    r = runs[0]
    r.find(qn('w:t')).text = text
    rpr = r.find(qn('w:rPr'))
    rpr.append(rpr.makeelement(qn('w:color'), {qn('w:val'): '1F3864'}))
    for sz in rpr.findall(qn('w:sz')):
        sz.set(qn('w:val'), '22')
    ppr = p.find(qn('w:pPr'))
    sp = ppr.find(qn('w:spacing'))
    if sp is not None:
        sp.set(qn('w:before'), '160')
    keep = ppr.makeelement(qn('w:keepNext'), {})
    ppr.insert(0, keep)
    add(p)


def capability(code, title, question, answer, steps, scenarios):
    subhead(f'{code}. {title}')
    lead('Question.', question)
    lead('Response.', answer)
    lead('How to test it.', '')
    for i, (text, expected) in enumerate(steps, 1):
        lead(f'{i}.', text)
        if expected:
            lead('You should see:', expected)
    if scenarios:
        lead('Scenarios to try.', '')
        for s_ in scenarios:
            lead('•', s_)


heading('1. Introduction')
lead('Purpose.', 'This document answers Ecobank Group’s clarification questions on the behavioural modelling and funds '
     'transfer pricing (FTP) capabilities of the proposed Asset & Liability Management (ALM) platform, Ascent ALM, and '
     'is also a guide for Ecobank’s business team to validate each answer on the platform themselves.')
lead('How it is organised.', 'For every question you will find our response, the exact steps to test it - who to sign in as, '
     'what to click and what you should see - and further scenarios to try. No support from Qucoon is needed to follow it.')

heading('2. Platform Access')
lead('Link.', 'https://ascent-alm-v2.vercel.app - open it in any modern browser (Chrome or Edge recommended); nothing needs '
     'to be installed.')
lead('Sign-in.', 'Use the accounts below. Each has a different role so that the controls between people (one person makes '
     'a change, another approves it) can be seen working. The password is provided separately with this document. '
     'Named accounts for Ecobank’s reviewers can be created on request.')
table(
    ['Role', 'Sign-in (email)', 'Use it for'],
    [
        ['ALM Analyst', 'chinwe.okafor@ecobank.com', 'Most tests: behavioural models, runs and results'],
        ['Approver', 'kofi.mensah@ecobank.com', 'Approving model-derived assumptions and run sign-offs'],
        ['Organisation Admin', 'adaeze.okonkwo@ecobank.com', 'Group settings, market data, users and the audit log'],
        ['Affiliate Admin (Nigeria)', 'ngadmin.test@ecobank.com', 'Nigeria’s own view and its own assumptions'],
        ['Viewer', 'yaw.boateng@ecobank.com', 'Read-only access to results and reports'],
    ],
    [2300, 3000, 3634],
)
lead('Finding your way.', 'The menu on the left has seven areas: Home, Data, Assumptions, Run & results, Approvals, Reports '
     'and Admin. At the top of every page, Scope chooses the affiliate (or Group) and As of chooses the month-end; every '
     'screen follows these two. The bell shows notifications, and the run label next to the date shows which run the '
     'results are read from. The ⓘ next to a title explains that screen.')
lead('Before each test.', 'Set Scope to Ecobank Nigeria and As of to 31 Jul 2026 unless the steps say otherwise.')
spacer()

heading('3. Summary of Responses')
table(
    ['ID', 'Question', 'Response'],
    [
        ['B1', 'Native behavioural modelling engine deriving assumptions from historical data', 'Yes'],
        ['B2', 'Regression, time-series and other techniques run internally - no Python, R, Excel or third-party tools', 'Yes'],
        ['B3', 'Core and non-core deposits, stability, decay rates and runoff profiles from historical data', 'Yes'],
        ['B4', 'Loan prepayment, early withdrawal, deposit renewal and repricing betas', 'Yes'],
        ['B5', 'Calibration, back-testing and validation entirely within the platform', 'Yes'],
        ['B6', 'Approved assumptions applied automatically to liquidity, IRRBB, FTP, stress testing and forecasting', 'Yes'],
        ['B7', 'Behavioural modelling included in the licence and implementation scope', 'Fully included'],
        ['F1', 'Complete FTP engine - matched maturity, pooled funding, liquidity premiums, basis and currency adjustments', 'Yes'],
        ['F2', 'FTP at transaction level, aggregated by product, business unit, affiliate and Group', 'Yes'],
        ['F3', 'FTP uses the same contractual and behavioural cashflows as liquidity and IRRBB', 'Yes'],
        ['F4', 'Allocation of funding costs, operating expenses, expected credit losses and capital charges', 'Yes'],
    ],
    [700, 6634, 1600],
)
spacer()

heading('4. Behavioural Modelling & Assumptions')
capability(
    'B1', 'Native behavioural modelling engine',
    'Does the proposed solution include a native behavioural modelling engine capable of analysing historical '
    'transactional and balance data and independently deriving behavioural assumptions?',
    'Yes. The platform includes a native behavioural modelling engine that ingests historical transactional and balance '
    'data, performs statistical analysis, and derives behavioural assumptions independently within the platform.',
    [
        ('Sign in as the ALM Analyst. Go to Data → Data sources and open Balance history, then Account history.',
         'the history loaded for Ecobank Nigeria - 24 month-ends of balances by product, customer type and currency, and '
         'account-level history.'),
        ('Go to Assumptions → Behavioural models → Calibrate.',
         'a coverage table showing how many months of history each segment has (for example DDA · Retail · NGN: 24).'),
    ],
    ['Upload a further month of history (Data → Upload data, choose the file) and open Calibrate again: the coverage '
     'for each segment increases by one month.'],
)
capability(
    'B2', 'Statistics computed inside the platform',
    'Can the system perform statistical regression, time-series analysis and other relevant modelling techniques '
    'internally, without requiring Python, R, Excel or third-party analytical software?',
    'Yes. All statistical modelling including regression analysis, time-series decomposition and curve fitting is '
    'performed natively within the platform. No external tools such as Python, R, Excel or third-party software are required.',
    [
        ('In Calibrate, choose Model = Deposit stability & run-off and Segment = DDA · Retail · NGN, then click Fit model.',
         'the fit statistics on screen - R², RMSE, MAPE, p-values and 95% confidence intervals - calculated in the '
         'browser session with nothing downloaded.'),
    ],
    ['Choose another segment (for example TD · Corporate · NGN) and fit again: every statistic is recalculated '
     'for that segment.'],
)
capability(
    'B3', 'Core and non-core deposits, stability, decay and runoff',
    'Can the solution calculate core and non-core deposit balances, deposit stability, decay rates and expected runoff '
    'profiles using historical data?',
    'Yes. The engine segments deposits into core and non-core categories based on historical behaviour, calculates deposit '
    'stability metrics, derives decay rates and generates expected runoff profiles. Segmentation is configurable by deposit '
    'type, client type, tenor, currency and affiliate.',
    [
        ('With the Deposit stability & run-off model fitted (B2), read the results panel.',
         'the core and non-core (volatile) split, stability measures, the decay rate and half-life, and a run-off profile chart.'),
        ('Change Core method from Minimum balance to Volatility and click Fit model.',
         'a different core amount, calculated by the second method.'),
    ],
    ['Change Segment by to product, customer type, currency or tenor band: the list of segments changes accordingly.',
     'Change Scope to Ecobank Ghana: the same model is fitted on Ghana’s own history.'],
)
capability(
    'B4', 'Prepayment, early withdrawal, renewal and repricing betas',
    'Can the solution independently estimate loan prepayment rates, early withdrawal behaviour, deposit renewal rates and '
    'repricing betas?',
    'Yes. The behavioural engine models loan prepayment rates, early withdrawal patterns, deposit renewal behaviour and '
    'repricing betas using historical data. Outputs are model-derived assumptions that can be reviewed, adjusted and '
    'approved by authorised users before application.',
    [
        ('In Calibrate choose Model = Loan prepayment and click Fit model.',
         'an annual prepayment rate (CPR) with its confidence interval.'),
        ('Choose Model = Term deposit, select the period and click Fit model.',
         'the renewal (roll-over) rate and the early-withdrawal rate.'),
        ('Choose Model = Repricing beta, Policy series = CBN_MPR (the Central Bank of Nigeria policy rate) and click Fit model.',
         'the beta with its standard error, p-value, R², confidence interval and the best lag in months.'),
    ],
    ['Run the repricing beta for Ecobank Ghana with the BOG_POLICY series and compare the beta with Nigeria’s.'],
)
capability(
    'B5', 'Calibration, back-testing and validation',
    'Can users calibrate, back-test and validate behavioural models entirely within the proposed solution?',
    'Yes. The platform provides built-in calibration, back-testing and validation tools. Users compare model outputs against '
    'observed outcomes, assess model fit, review confidence intervals and adjust parameters within the platform. Model '
    'versions are tracked with full audit trails.',
    [
        ('On the Deposit stability & run-off model set Back-test hold-out = 3 months and Tolerance = MAPE 10%, then Fit model.',
         'predicted against actual balances for the three held-out months, the errors (MAE, RMSE, MAPE, bias) and a Pass or '
         'Fail verdict.'),
        ('Click Save to model register, then open the Model register tab.',
         'the saved model run with its segment, data window, parameters, fit statistics, back-test result and status Draft.'),
    ],
    ['Set the tolerance to MAPE 1% and fit again: the back-test now shows Fail.',
     'Sign in as the Organisation Admin and open Admin → Audit log: each fit and save is recorded with who and when; '
     'entries cannot be edited or deleted.'],
)
capability(
    'B6', 'Approved assumptions flow into every calculation',
    'Once approved, are behavioural assumptions automatically applied to liquidity risk, IRRBB, FTP, stress testing and '
    'forecasting without manual transfer or re-entry?',
    'Yes. Once behavioural assumptions are approved through the platform’s maker-checker workflow, they are '
    'automatically applied across all dependent modules - liquidity risk, IRRBB, FTP, stress testing and forecasting. '
    'No manual transfer, re-entry or file export is required.',
    [
        ('As the ALM Analyst, in the Model register select the saved model run and click Propose as assumption.',
         'exactly what will change (for example “core share 60% → 58%”) and the status Proposed - waiting for approval.'),
        ('Sign in as the Approver. Go to Approvals → Waiting for me and click Review on the request.',
         'the proposed assumption in full - each setting before and after - then click Approve.'),
        ('Sign in as the ALM Analyst. Set As of = 31 Aug 2026 and go to Run & results → Run now → Execute.',
         'a new run version for Ecobank Nigeria · 31 Aug 2026.'),
        ('Go to Run & results → Interest rate → Behavioural analysis.',
         '“Patterns this run applied” naming the version just approved. Liquidity → Maturity & repricing gap, '
         'Interest rate → NII & EVE, FTP & profitability and Stress & scenarios all use it - nothing was re-entered.'),
    ],
    ['As the ALM Analyst, try to approve your own proposal in Approvals: it is refused - the person who makes a change '
     'cannot approve it.',
     'Propose a second change and leave it unapproved, then run: the run still uses the previously approved assumption.',
     'As the Approver, reject a proposal without a reason: rejection needs a reason; once given, the proposal is not used.'],
)
capability(
    'B7', 'Included in scope',
    'Is the complete behavioural modelling, calibration and back-testing functionality included in the proposed licence '
    'and implementation scope, or does it require an additional module, external consultancy or a separate modelling platform?',
    'Fully included. The behavioural modelling engine, calibration tools and back-testing functionality are all part of the '
    'core platform scope and the proposed commercial terms.',
    [('Repeat B1 to B6 above.', 'every step happened in the same platform - no separate module, export or external tool.')],
    [],
)
spacer()

heading('5. FTP & Profitability')
capability(
    'F1', 'Complete FTP engine',
    'Is the complete FTP engine included in the proposed commercial solution, including matched-maturity FTP, pooled '
    'funding, liquidity premiums and basis/currency adjustments?',
    'Yes. The FTP engine is fully included in the proposed scope and commercial terms. It supports matched-maturity FTP, '
    'pooled funding rate allocation, liquidity premium assignment, and basis and currency adjustments.',
    [
        ('Go to Assumptions → Rules & scenarios and open FTP method & curve.',
         'the default method (matched maturity), the method and curve per product class, and funding pools.'),
        ('Go back (← Rules & scenarios) and open FTP add-ons.',
         'the liquidity premium (for example 25 bps on loans) and the currency basis adjustment (40 bps on USD positions).'),
        ('Go to Run & results → FTP & profitability → Transfer pricing and expand a loan line.',
         'the method applied, the base rate from the curve, each add-on with its reason, and the all-in transfer rate.'),
        ('Click Compare methods and pick a product.',
         'the transfer rate under matched maturity, duration, average life, repricing term and pooled, side by side.'),
    ],
    ['Look at a USD position: the currency basis add-on appears only on non-local-currency lines.'],
)
capability(
    'F2', 'Transaction-level FTP with aggregation',
    'Can the solution calculate FTP at individual transaction level and automatically aggregate the results by product, '
    'business unit, affiliate and Group?',
    'Yes. FTP is calculated at the individual instrument/transaction level and automatically aggregated by product, business '
    'unit, affiliate and Group. Users can drill down from Group-level profitability to the underlying transaction detail.',
    [
        ('Set Scope = Group (As of 31 Jul 2026) and open FTP & profitability → Transfer pricing.',
         'the Group view, consolidated from Ecobank Nigeria and Ecobank Ghana - no separate Group run is needed.'),
        ('Drill down: Group → Ecobank Nigeria → a business unit → a product → the positions.',
         'totals that add up at every level, down to each individual position.'),
    ],
    ['Switch the roll-up between business unit, product and affiliate: margins are shown for each grouping.'],
)
capability(
    'F3', 'One set of cashflows for FTP, liquidity and IRRBB',
    'Does the FTP engine use the same contractual and behavioural cashflows as the liquidity and IRRBB engines?',
    'Yes. All engines operate on a single, consistent set of cashflow data. The contractual and behavioural cashflows used by '
    'the FTP engine are the same cashflows used by the liquidity and IRRBB engines. There is no duplication or separate data '
    'pipeline.',
    [
        ('As the ALM Analyst go to Assumptions → Rules & scenarios → Loan prepayment, set a prepayment rate (for '
         'example 8% a year) and save. As the Approver, approve it in Approvals.', ''),
        ('As the ALM Analyst, with As of = 31 Aug 2026, go to Run & results → Run now → Execute.',
         'a new run version.'),
        ('Use the run label at the top to switch between the previous and the new version, and compare Liquidity → '
         'Maturity & repricing gap, FTP & profitability → Transfer pricing (loan rates) and Interest rate → NII & EVE.',
         'all three change together: loans repay earlier in the gap, loan transfer rates shorten, and EVE moves - one set of cashflows.'),
    ],
    [],
)
capability(
    'F4', 'Full product and customer profitability',
    'Can the system allocate funding costs, operating expenses, expected credit losses and capital charges to support '
    'product and customer profitability analysis?',
    'Yes. The profitability module supports multi-layer cost allocation including funding costs (via FTP), operating expense '
    'allocation, expected credit loss attribution and capital charges. This enables full product-level and customer-level '
    'profitability analysis.',
    [
        ('Go to Run & results → FTP & profitability → Profitability.',
         'a waterfall from client interest through transfer pricing, operating expenses, expected credit loss and the capital '
         'charge to risk-adjusted profit, with RAROC.'),
        ('Switch between Product view and Customer view and drill down.',
         'profitability by product and by customer, down to individual positions.'),
        ('Read the cost pool reconciliation panel.',
         'for each operating cost pool, allocated plus unallocated equals the pool - nothing is lost or double counted.'),
    ],
    ['Open Assumptions → Rules & scenarios → Operating cost allocation, Expected credit loss and Capital charge to '
     'see the inputs; a change goes to Approvals and is used by the next run once approved.',
     'Set Scope = Group to see profitability consolidated across Nigeria and Ghana.'],
)
spacer()

heading('6. Demonstration Environment')
lead('Set-up.', 'The test environment is configured for Ecobank Group. Affiliates were onboarded through the platform’s '
     'own onboarding flow, market data is loaded once by Group for every affiliate, and Group-default assumptions are '
     'approved through maker-checker.')
table(
    ['Affiliate', 'Status', 'Month-end runs', 'Notes'],
    [
        ['Ecobank Nigeria', 'Live', '2', '31 Jul 2026 (signed off) and 31 Aug 2026'],
        ['Ecobank Ghana', 'Live', '1', '31 Jul 2026'],
        ['Ecobank Group', 'Consolidated', '-', 'No separate Group run: the Group view consolidates each Live affiliate’s '
         'official run for the month-end (e.g. 31 Jul 2026 = Nigeria + Ghana)'],
    ],
    [2000, 1400, 1500, 4034],
)
spacer()

heading('7. Notes')
lead('Data loading.', 'In the test environment historical balance, account and position data are loaded by file upload '
     'through the platform’s data sources, where they are checked and admitted by Ecobank users. Automated connectors '
     'to source systems are configured during implementation.')
lead('Governance.', 'Every assumption change, model proposal and run sign-off passes through maker-checker approval; the '
     'person who raises a change cannot approve it, and every action is recorded in an audit log that cannot be edited.')
lead('Shared environment.', 'Changes made while testing (for example approving a new assumption) are visible to everyone '
     'using the environment. A version is never overwritten - earlier versions and runs stay available.')

heading('8. Next Steps')
lead('Next steps.', 'Ecobank’s business team validates the capabilities above using Section 2 to sign in. Qucoon is '
     'available to clarify any point or to set up named reviewer accounts.')
plain('Please let us know if any further clarification is required.')

heading('9. Sign-off')

sign = copy.deepcopy(T_SIGN)
trs = sign.findall(qn('w:tr'))
names = [
    ('', 'Head of ALM', 'Ecobank Group'),
    ('', 'Group Chief Risk Officer', 'Ecobank Group'),
    ('', 'Engagement Lead', 'Qucoon Limited'),
]
for tr in trs[1:]:
    sign.remove(tr)
for name, role, org in names:
    tr = copy.deepcopy(trs[1])
    cells = tr.findall(qn('w:tc'))
    for tc, val in zip(cells, [name, role, org, '', '']):
        p = tc.find(qn('w:p'))
        runs = p.findall(qn('w:r'))
        if runs:
            set_text(p, val)
    sign.append(tr)
add(sign)

d.core_properties.title = 'Clarification Response & Validation Guide - Ecobank Group ALM Platform'
d.save(OUT)
print('->', OUT)
