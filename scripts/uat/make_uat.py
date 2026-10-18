"""Builds the Ascent ALM UAT workbook (release note, test cases, test data, summary), modelled on the
client's own UAT sheets. Output path is the first CLI argument."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

OUT = sys.argv[1]
NAVY = "0B3B4F"
HEAD = PatternFill("solid", fgColor=NAVY)
BAND = PatternFill("solid", fgColor="EEF4F6")
WHITE = Font(bold=True, color="FFFFFF")
BOLD = Font(bold=True)
WRAP = Alignment(wrap_text=True, vertical="top")
THIN = Side(style="thin", color="C9D3D8")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

ADMIN, APPROVER, ANALYST, VIEWER, AFFADMIN = "Organisation Admin", "Approver", "ALM Analyst", "Viewer", "Affiliate Admin"

# (feature, profile, email ref, steps, expected)
CASES = [
    # ── Access & security ──
    ("Sign-in & session", ADMIN, "Platform", "Open the platform URL\n*Sign in with the Organisation Admin email and password", "User is signed in and lands on the organisation onboarding (first time) or Home"),
    ("Sign-in & session", ADMIN, "Platform", "Signed in, refresh the browser page", "User stays signed in on the same screen"),
    ("Sign-in & session", ANALYST, "Platform", "Sign in with a wrong password", "Sign-in is refused with 'Invalid email or password'"),
    ("Sign-in & session", ADMIN, "Platform", "Click Sign out (bottom of the sidebar)", "User returns to the sign-in screen; Back button does not show any data"),
    ("Roles & menu", VIEWER, "Platform", "Sign in as a Viewer\n*Review the sidebar", "Only Home, Assumptions, Run & results, Approvals, Reports and Admin (Notifications) are visible; no Data upload, no setup or user management"),
    ("Roles & menu", ANALYST, "Platform", "Sign in as an ALM Analyst\n*Open Admin", "Users & roles and Organisation setup are not available to the analyst"),
    ("Security controls", APPROVER, "Platform", "Raise any approval request as user A\n*Try to approve the same request as user A", "Approve/Reject buttons are disabled: 'a maker cannot be their own checker'"),
    ("Security controls", ADMIN, "Platform", "Open My Account\n*Change your own name\n*Try to approve a request you raised earlier", "Approval is still refused - segregation of duties is by user, not by name"),
    ("Security controls", AFFADMIN, "Platform", "Sign in as an Affiliate Admin\n*Check the scope shown in the header and the affiliate lists", "Only the user's own affiliate is visible; no other affiliate's data can be opened"),
    ("Security controls", ADMIN, "Platform", "Admin > Audit log\n*Filter by module", "Every sign-in-relevant change, upload, approval and run is listed with who, when and outcome; entries cannot be edited"),
    # ── Organisation onboarding ──
    ("Organisation onboarding", ADMIN, "Onboarding", "First sign-in as Organisation Admin: welcome screen > Get started\n*Step 1 Organisation: enter organisation name, reporting currency USD, cycle Monthly, fiscal year end 31 Dec\n*Click Save & continue", "Step 1 is saved and Step 2 Affiliates & people opens"),
    ("Organisation onboarding", ADMIN, "Onboarding", "On Step 2, refresh the browser", "The wizard re-opens on Step 2 with Step 1 data retained"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Step 2 Affiliates: click Add affiliate\n*Enter NG, Ecobank Nigeria, Nigeria, CBN, NGN\n*Save", "Ecobank Nigeria is listed with status Onboarding"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Step 3 Organisation defaults: review group limits, FTP default (Matched maturity + liquidity premium), active currencies, market data loaded by Group\n*Scroll to the bottom and click Save & continue", "Defaults are saved; the page scrolls fully and Step 4 Review opens"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Admin > Organisation setup > Organisation & defaults > Assumptions: open each Group-default assumption (FTP method & curve, FTP add-ons, cost allocation, credit loss, capital charge, product characteristics, deposit behaviour)", "Each ships with an industry-standard baseline and shows its status (Shipped default / Pending approval / Approved) with what happens if missing; 'Set up' opens its editor in a side panel"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Step 2 Affiliates & people: after adding Ecobank Nigeria, in 'Your people' click 'Invite its admin' for Nigeria (or assign an existing user)", "Affiliate Admin login linked to Nigeria only; temporary password shown once for a new user"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Step 2 Affiliates & people: click 'Upload users (CSV)'\n*Download the template, add a Group analyst and two Nigeria users, then upload it", "Every row is checked (name, work email, role, affiliateCode) before anything is created; created sign-ins are confirmed with each person's affiliate; bad roles or unknown affiliate codes are rejected with a reason and nothing is created for those rows"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Step 4 Review: check the summary (Organisation, Affiliates, Organisation defaults) and click Complete setup", "'Organisation ready' is shown; Go to Home opens Home"),
    ("Organisation onboarding", ADMIN, "Onboarding", "Sign out and sign in again", "User lands on Home - the onboarding wizard is not shown again"),
    ("Organisation onboarding", ANALYST, "Onboarding", "Sign in as an ALM Analyst for the first time", "Analyst lands on Home; no onboarding wizard"),
    # ── Affiliate activation ──
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Sign in as the Nigeria Affiliate Admin (first time)", "Affiliate onboarding opens: 'Let's get Ecobank Nigeria ready'"),
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Step 1 Confirm affiliate: check pre-filled details > Save & continue\n*Step 2 Data sources: set Positions and General ledger to File upload, add owners", "Steps saved; refreshing the browser resumes on the same step"),
    ("Column mapping", AFFADMIN, "Data", "Step 2 > Positions > Upload a sample file (loans.csv)", "Each standard field shows the matched file column; required fields without a match are flagged; unused columns listed as ignored"),
    ("Column mapping", AFFADMIN, "Data", "Change one match using the dropdown > Save mapping", "Mapping saved for this affiliate's source only"),
    ("Column mapping", AFFADMIN, "Data", "Data > Upload data > drop 2_Nigeria_NG/special_tests/MAPPING_TEST_loans_renamed_columns.csv\n*Map the 5 renamed columns inline > Send to lobby\n*Reject it, then upload the same file again", "First upload asks for the 5 columns inline; the second upload matches them automatically with no question"),
    ("Column mapping", AFFADMIN, "Data", "Try to continue Step 2 with a required field unmatched", "Blocked until a column is picked or 'skip for now' is ticked"),
    ("Column mapping", AFFADMIN, "Data", "Data > Data sources > Loans > Column mapping", "The same mapping screen opens and can be changed later"),
    ("Column mapping", ANALYST, "Data", "As an ALM Analyst open a source > Column mapping", "Mapping can be viewed but not changed"),
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Step 3 Users: assign an existing user, invite a new analyst, and bulk-upload users from a CSV", "Users are created/assigned for Nigeria only; admin roles cannot be granted"),
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Step 4 Configuration: review settings marked 'Inherited'\n*Tighten one limit threshold; try to loosen another", "Tightened value saves; loosened value keeps the organisation default and raises an approval request"),
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Step 5 Initial data: upload loans/deposits/treasury and gl_ledger\n*Review the suggested GL to common chart-of-accounts mapping and confirm", "Files admitted; GL mapping suggested automatically"),
    ("Affiliate onboarding", AFFADMIN, "Onboarding", "Step 6 Readiness check > Submit for activation", "All checks shown; activation request appears in Approvals; affiliate shows Testing"),
    ("Affiliate activation", APPROVER, "Onboarding", "Approvals > open the Ecobank Nigeria activation request > Approve", "Ecobank Nigeria status becomes Live"),
    # ── Market data ──
    ("Market & reference data", ADMIN, "Data", "Data > Market data > FX rates\n*Add NGN rate per USD as at 31 Jul 2026", "Rate is saved and listed"),
    ("Market & reference data", ADMIN, "Data", "Data > Market data > Yield curves > New curve NGN\n*Enter term rates (see Test Data) as at 31 Jul 2026 > Save", "Curve is saved and plotted"),
    ("Market & reference data", ADMIN, "B2/B4", "Data > Market data > Economic indicators\n*Create 'CBN policy rate' series and upload policy-rate_NG_only.csv", "24 monthly observations are listed for the series"),
    # ── Data loading ──
    ("Data loading", ANALYST, "Data", "Data > Upload data\n*Drop loans.csv, deposits.csv, treasury.csv, gl_ledger.csv together", "Each file is routed to its own source (Loans, Deposits, Treasury, General ledger) automatically; no affiliate or department is asked for"),
    ("Data loading", VIEWER, "Data", "Sign in as a Viewer and open Data", "No upload or admit actions are available"),
    ("Data loading", ADMIN, "Data", "Review the check panel for each file", "Rows, valid/invalid/duplicate counts, column matching, the as-of date read from the file and any unknown codes are shown before anything is saved"),
    ("Data loading", ADMIN, "Data", "Click Upload & admit", "Files are admitted; Data > History shows each load as Admitted"),
    ("Data loading", ADMIN, "Data", "Upload the same file again", "Upload is blocked as a duplicate file"),
    ("Data loading", ADMIN, "Data", "Data > Data sources > General ledger > Ledger check > Sign off", "Positions agree with the ledger within tolerance and the period is signed off"),
    ("Data loading", ADMIN, "Data", "Upload a file to the lobby instead (Send to lobby)\n*Open the source > Lobby > Reject with a reason", "The file is rejected and shown as Rejected in Data > History"),
    # ── Behavioural modelling ──
    ("Behavioural modelling", ADMIN, "B1", "Data > Upload data > drop balance-history.csv and account-history.csv together > Upload & admit", "Routed to Balance history and Account history; Assumptions > Behavioural models coverage shows 24 months per segment"),
    ("Behavioural modelling", ANALYST, "B1/B3", "Assumptions > Behavioural models > Ecobank Nigeria > Deposit stability & run-off > pick a deposit segment > Fit model", "Core and volatile share, stability measures, decay rate, half-life and run-off profile are produced from the uploaded history"),
    ("Behavioural modelling", ANALYST, "B2", "Review the fit statistics of the fitted model", "R², RMSE, MAPE, p-values and 95% confidence intervals are displayed; no external tool is used"),
    ("Behavioural modelling", ANALYST, "B3", "Change Core method between Minimum balance and Volatility and fit again", "Core amount changes per method; results are recalculated in the platform"),
    ("Behavioural modelling", ANALYST, "B3", "Change 'Segment by' (product, customer type, currency, tenor band)", "Segment list changes to the chosen segmentation"),
    ("Behavioural modelling", ANALYST, "B2/B4", "Model type Repricing beta > choose CBN policy rate series > Fit model", "Beta with standard error, p-value, R², confidence interval and best lag is produced"),
    ("Behavioural modelling", ANALYST, "B4", "Model type Loan prepayment > Fit model", "Annual prepayment rate (CPR) with confidence interval is produced"),
    ("Behavioural modelling", ANALYST, "B4", "Model type Term deposit > set period > Fit model", "Renewal rate and early-withdrawal rate are produced"),
    ("Behavioural modelling", ANALYST, "B5", "Set back-test hold-out to 3 months and a tolerance > Fit model", "Back-test shows predicted vs actual, MAE/RMSE/MAPE/bias and Pass or Fail"),
    ("Behavioural modelling", ANALYST, "B5", "Save to model register\n*Assumptions > Behavioural models > Model register tab", "The model run is listed with segment, data window, parameters, fit, back-test and status"),
    ("Behavioural modelling", ANALYST, "B6", "From the model register: Propose as assumption", "Proposal shows exactly what changes; status becomes Proposed and an approval request is raised"),
    ("Behavioural modelling", APPROVER, "B6", "Approvals > approve the proposed assumption", "Model register shows Approved"),
    ("Behavioural modelling", ANALYST, "B6", "Run & results > Run now > Execute\n*Check Liquidity > Maturity & repricing gap (behavioural), Interest rate > Behavioural analysis, NII, FTP deposit tenor, Stress", "All screens use the approved assumption without re-entry; Runs > run > Assumptions used lists the rule version"),
    ("Behavioural modelling", ANALYST, "B6", "Propose a second change but do NOT approve it\n*Run now", "The unapproved change is not used by the run"),
    ("Behavioural modelling", ADMIN, "B7", "Review that fitting, back-testing, register and approval all happen inside the platform", "No export, external tool or separate module is needed"),
    # ── Assumptions & rules ──
    ("Assumptions & rules", ANALYST, "B6", "Assumptions > Rules & scenarios > Product characteristics > set HQLA level and run-off factors for Nigeria products > Save", "Rule is saved and sent for approval"),
    ("Assumptions & rules", APPROVER, "B6", "Approve the product characteristics rule", "Rule becomes available to runs"),
    # ── Runs ──
    ("Run management", ANALYST, "Platform", "Run & results > Run now > Full ALCO Pack > as-of 31 Jul 2026 > Execute", "Run completes; 'v1 of Ecobank Nigeria 31 Jul 2026 created' with Request sign-off"),
    ("Run management", ANALYST, "Platform", "Click Request sign-off", "Run shows Pending sign-off; request appears in Approvals with LCR, NSFR and who ran it"),
    ("Run management", APPROVER, "Platform", "Approvals > approve the run sign-off", "Header shows 'Run: Ecobank Nigeria · 31 Jul 2026 · v1 · Signed off'; all screens use this run"),
    ("Run management", ANALYST, "Platform", "Run now again for 31 Jul 2026", "Blocked: '31 Jul is signed off - reopen it first'"),
    ("Run management", ANALYST, "Platform", "Run & results > Runs > open the run > Reopen with a reason\n*Run now", "v1 is frozen as Reopened; v2 is created (Provisional)"),
    ("Run management", VIEWER, "Platform", "Click the run pill in the header > choose v1", "v1 opens read-only with 'not the official figures' banner"),
    # ── Results ──
    ("Liquidity", VIEWER, "Platform", "Run & results > Liquidity", "LCR, NSFR, loan-to-deposit and funding by currency are shown from the signed-off run"),
    ("Cashflows", ANALYST, "F3", "Liquidity > Maturity & repricing gap", "Amortising loans are spread across time buckets; balances with no maturity and no pattern are shown as 'Not bucketed'"),
    ("Cashflows", ANALYST, "F3", "Interest rate > NII & EVE", "EVE method shows cash-flow present value; NII and EVE under the six regulatory shocks are shown"),
    ("Cashflows", ANALYST, "F3", "Approve a loan prepayment rule > Run now\n*Compare behavioural gap, FTP loan rates and EVE with the previous version", "All three change together - one shared cashflow set"),
    ("FTP", ANALYST, "F1", "Assumptions > Rules > FTP method & curve: default Matched maturity, add an NGN funding pool > Save", "Rule saved and sent for approval"),
    ("FTP", ANALYST, "F1", "Assumptions > Rules > FTP add-ons: liquidity premium, currency basis (40 bps USD), basis spread > Save", "Rule saved and sent for approval"),
    ("FTP", ANALYST, "F1", "After approval and a new run: FTP & profitability > Transfer pricing > expand a position", "Method applied, base rate, each add-on with its reason and all-in rate are shown; currency basis only on non-NGN lines"),
    ("FTP", ANALYST, "F1", "Transfer pricing > Compare methods > pick a product", "Rates under matched maturity, duration, average life, repricing term and pooled are shown side by side"),
    ("FTP", VIEWER, "F2", "Transfer pricing drill-down: Group > Ecobank Nigeria > business unit > product > positions", "Totals reconcile at each level down to individual positions"),
    ("FTP", VIEWER, "F2", "Switch roll-up between business unit, product and affiliate", "Margins are shown for each grouping"),
    ("Profitability", ANALYST, "F4", "Assumptions > Rules > Operating cost allocation, Expected credit loss, Capital charge > define and Save each", "Each rule saved and sent for approval"),
    ("Profitability", VIEWER, "F4", "After approval and a new run: FTP & profitability > Profitability", "Waterfall: client interest, FTP, operating expenses, ECL, capital charge, risk-adjusted profit and RAROC"),
    ("Profitability", VIEWER, "F4", "Toggle Product view / Customer view and drill down", "Profitability by product and by customer, down to positions"),
    ("Profitability", VIEWER, "F4", "Review the cost pool reconciliation panel", "Allocated + unallocated = each cost pool"),
    ("Stress testing", VIEWER, "Platform", "Run & results > Stress & scenarios > Supervisory stress", "Six regulatory rate shocks and the severe liquidity run are shown"),
    ("Stress testing", ANALYST, "Platform", "Stress & scenarios > What-if > choose a preset and move a lever", "Base vs scenario LCR, NSFR and survival update immediately"),
    ("Limits", VIEWER, "Platform", "Run & results > Limits", "Each limit shows current value, thresholds, headroom and status"),
    # ── Approvals & reports ──
    ("Approvals", APPROVER, "Platform", "Approvals > Waiting for me", "Only requests this user may decide: what changes, why, affiliate, who raised it and when"),
    ("Approvals", ANALYST, "Platform", "Approvals > Raised by me", "Requests this user raised, with their current status"),
    ("Approvals", APPROVER, "Platform", "Filter by type, affiliate, status and date; search", "List narrows accordingly"),
    ("Approvals", APPROVER, "Platform", "Open a rule-change request", "Side panel shows the changed settings against the previous version"),
    ("Approvals", APPROVER, "Platform", "Open a run sign-off request", "Shows affiliate, date, version, LCR, NSFR and who executed the run, with a link to open the run"),
    ("Approvals", APPROVER, "Platform", "Approve a request raised by another user", "Status becomes Approved; the item takes effect (e.g. rule usable in runs, run Signed off, affiliate Live)"),
    ("Approvals", APPROVER, "Platform", "Reject a request without a reason, then with a reason", "Reject needs a reason; once given, status becomes Rejected, the item does not take effect and the reason is visible to the requester"),
    ("Approvals", ANALYST, "Platform", "As an ALM Analyst open Approvals", "Requests are visible but Approve/Reject are disabled with the reason (no approval rights)"),
    ("Approvals", APPROVER, "Platform", "History tab > search and export", "Past decisions listed with decider and date; list can be searched and exported"),
    ("Control issues", ANALYST, "Platform", "Approvals > Control issues > New issue: title, description, source, severity, owner, due date > Raise issue", "Issue appears in the list at stage Identified"),
    ("Control issues", ANALYST, "Platform", "Approvals > Control issues board", "Issues shown in columns Open > In progress > Verified > Closed with severity, owner, due date and overdue warning"),
    ("Control issues", ANALYST, "Platform", "Open an issue > Advance to … through each stage", "Card moves across the board; each change recorded in the timeline"),
    ("Control issues", ANALYST, "Platform", "As the issue owner, try to advance it to Closed", "Blocked - the owner cannot close their own issue"),
    ("Control issues", APPROVER, "Platform", "As a different user, close the verified issue", "Issue Closed with closer and date recorded"),
    ("Control issues", ANALYST, "Platform", "Run & results > Limits > open a breached limit > Raise a remediation issue", "A control issue is created and linked to the limit breach"),
    ("Affiliate onboarding", ADMIN, "Onboarding", "Repeat affiliate set-up for Ecobank Ghana (GH, Bank of Ghana, GHS) and Ecobank Kenya (KE, Central Bank of Kenya, KES) using test-files 3_Ghana_GH and 4_Kenya_KE", "Both affiliates complete onboarding and go Live after approval"),
    ("Data loading", ANALYST, "Data", "Kenya: upload 4_Kenya_KE/NEGATIVE_TEST_positions_with_errors.csv", "Check panel lists the row errors; the file cannot be admitted"),
    ("Data loading", ANALYST, "Data", "Kenya: upload 4_Kenya_KE/NEGATIVE_TEST_gl_out_of_balance.csv and run the ledger check", "Ledger check reports the out-of-balance accounts; runs are flagged unreconciled (warning), not blocked"),
    ("Reports", ANALYST, "Platform", "Reports > ALCO & management packs > Generate pack from the signed-off run", "Pack is generated with sections from the run"),
    ("Reports", VIEWER, "Platform", "Open the pack > Download PDF / Excel", "Files download with the run's figures"),
    ("Reports", ANALYST, "Platform", "Reports > Regulatory returns > New return (CBN, monthly) > attach the run", "Return lists metrics against regulatory floors"),
    ("Reports", ANALYST, "Platform", "Reopen the run and create v2\n*Return to the pack built from v1", "Pack shows 'Superseded - based on v1'"),
]

CASES += [
    # ── Working context & notifications ──
    ("Working context", ANALYST, "Platform", "Header > Scope: choose Ecobank Nigeria\n*Header > As-of date: choose 31 Jul 2026", "Every screen now shows Nigeria at 31 Jul 2026"),
    ("Working context", ANALYST, "Platform", "Refresh the browser; then sign in on another browser", "Scope and as-of date are remembered on both"),
    ("Working context", AFFADMIN, "Platform", "As the Nigeria Affiliate Admin open the header Scope selector", "Fixed to Ecobank Nigeria; Group and other affiliates cannot be chosen"),
    ("Notifications", ADMIN, "Platform", "Header > bell after uploading market data", "A notification says market data was updated and names the affected affiliates; unread count shown"),
    ("Notifications", APPROVER, "Platform", "Header > bell while requests are pending", "Each pending request is listed; clicking opens it in Approvals"),
    ("Notifications", AFFADMIN, "Platform", "Header > bell after the activation request is approved", "A notification says the affiliate is Live"),
    # ── Market data ──
    ("Market & reference data", ADMIN, "Data", "Data > Market data > Status & upload > Upload data > drop 1_Group_market_data/market_data_2026-07-31.xlsx > Upload & admit", "FX (6), curves (NGN/GHS/KES/USD) and policy rates (CBN/BoG/CBK) loaded for 31 Jul 2026; status cards show date, who and age"),
    ("Market & reference data", ADMIN, "Data", "Admin > Audit log > filter module market data", "The upload is logged with who, when and affected affiliates"),
    ("Market & reference data", AFFADMIN, "Data", "As an Affiliate Admin open Data > Market data", "Market data can be viewed but not edited; who can fix it is shown"),
    # ── Group assumptions ──
    ("Assumptions & rules", ADMIN, "F1/F4", "Organisation onboarding Step 4 Assumptions > Upload Group assumptions > 1_Group_market_data/Group_assumptions_setup_values.xlsx", "FTP method and add-ons become active; cost allocation, credit loss, capital and product characteristics are Pending approval"),
    ("Assumptions & rules", ADMIN, "Onboarding", "Step 4 Assumptions > Change on Deposit behaviour", "Editor opens in a side panel inside onboarding; the shipped pattern shows as 'Shipped default'"),
    ("Assumptions & rules", ANALYST, "B6", "Assumptions > Rules & scenarios > open any rule", "A badge shows Approved & in use / Pending approval / Draft"),
    ("Assumptions & rules", AFFADMIN, "Platform", "As Nigeria Affiliate Admin open a Group default rule", "Read-only, with 'Save as' to create a Nigeria version"),
    ("Assumptions & rules", AFFADMIN, "Platform", "Save as > Nigeria version of Product characteristics > Save", "Saved as a Nigeria rule, pending approval; Group rule unchanged"),
    ("Assumptions & rules", ANALYST, "F3", "Run with a position whose product has no characteristic but whose GL maps to a common account that has one", "Treatment is taken from the common account; positions with neither are counted as 'Not classified'"),
    # ── Data sources ──
    ("Data loading", AFFADMIN, "Data", "Data > Data sources (Nigeria)", "Six standard sources: Loans, Deposits, Treasury, General ledger, Balance history, Account history; no market data source; no 'add source' needed"),
    ("Data loading", ANALYST, "Data", "Data > Upload data > drop 2_Nigeria_NG/special_tests/DERIVATION_TEST_loans_new_product.csv > give a reason > Upload & admit", "Reason required (31 Jul already loaded); product LOAN-AGRI created automatically; earlier load shown as Superseded"),
    ("Data loading", ANALYST, "Data", "Data > Structure > Products (Nigeria)", "LOAN-AGRI listed beside the earlier products; nothing removed"),
    ("Data loading", ANALYST, "Data", "Data > Upload data > drop the four files in 2_Nigeria_NG/2026-08-31_second_month > Upload & admit", "Added as 31 Aug loads; July loads and runs untouched (Data > History)"),
    ("Data loading", ANALYST, "Data", "Data > Data sources > Loans > Lobby > Withdraw a file you sent", "File withdrawn; History shows Withdrawn"),
    # ── Readiness ──
    ("Readiness", ANALYST, "Platform", "Run & results > Readiness (Scope Nigeria, 31 Jul 2026)", "Checklist: data collection, from Group (FX, curves, indicators), assumptions, governance; verdict Ready / Ready with warnings / Blocked"),
    ("Readiness", ANALYST, "Platform", "Click any ⚠ or ✗ item", "Says what it affects and names who can fix it; a fix button only if you can"),
    ("Readiness", ADMIN, "Platform", "Header Scope = Group > Run & results > Readiness", "Market data card and a matrix with one row per affiliate; clicking a cell switches scope to that affiliate"),
    ("Readiness", VIEWER, "Platform", "Home", "Executive dashboard with a small readiness strip and 'See readiness'"),
    ("Readiness", ANALYST, "Platform", "Run now with profitability rules still pending approval", "Run completes 'with warnings'; profitability is blank and says which rule to approve; other results normal"),
    ("Readiness", ANALYST, "Platform", "Header As-of 31 Aug 2026 > Run & results > Readiness", "Market data staleness warning (July rates > 30 days old), not a blocker"),
    ("Readiness", ANALYST, "Platform", "Upload 2_Nigeria_NG/special_tests/MISSING_FX_TEST_treasury_with_ZAR.csv for 31 Aug (with reason) > Run now", "Blocked: 'No FX rate for ZAR' with the Group users who can fix it"),
    ("Readiness", ADMIN, "Platform", "Data > Market data > FX rates > add ZAR for 31 Aug > rerun", "Blocker cleared; run completes"),
    ("Readiness", AFFADMIN, "Platform", "Run now for an affiliate that is not Live", "Blocked: affiliate not Live"),
    # ── Help ──
    ("Help & tour", VIEWER, "Platform", "Header ? > Getting started\n*Use → ← and Esc", "Tour walks Home, Data, Assumptions, Run & results (incl. Readiness), Approvals, Reports, the bell and the run pill"),
]

SCENARIOS = [
    # (title, profile, preconditions, steps, expected, type)
    ("Brand-new Organisation Admin signs in", ADMIN, "Organisation not yet set up", "Sign in as Organisation Admin", "'Preparing your workspace', then the welcome screen 'Let's get your organisation ready' with the 4 steps", "Onboarding"),
    ("Organisation Admin completes onboarding", ADMIN, "Scenario above", "Get started > complete all 4 steps > Complete setup", "'Organisation ready' > Home", "Onboarding"),
    ("Organisation Admin signs in again", ADMIN, "Organisation set up", "Sign out, sign in again", "Lands on Home; no wizard or welcome screen", "Onboarding"),
    ("Refresh during onboarding", ADMIN, "Onboarding in progress at Step 3", "Refresh the browser; sign in from another browser or device", "Wizard resumes at Step 3 with earlier answers kept, on both devices", "Onboarding"),
    ("Finish setup later", ADMIN, "Onboarding not complete", "Welcome screen > I'll do this later; then sign out and in", "Goes to Home; onboarding shows again at the next sign-in until completed", "Onboarding"),
    ("Org Admin creates an affiliate and assigns its admin", ADMIN, "Organisation set up", "Add Ecobank Nigeria; assign an existing user or invite a new one as Affiliate Admin", "Affiliate shows Onboarding; the Affiliate Admin is linked to Nigeria only", "Onboarding"),
    ("Brand-new Affiliate Admin signs in", AFFADMIN, "Affiliate Admin assigned to Nigeria", "Sign in as the Affiliate Admin", "Welcome screen 'Let's get Ecobank Nigeria ready' with the 6 steps", "Onboarding"),
    ("Affiliate Admin completes onboarding", AFFADMIN, "Scenario above", "Complete the 6 steps > Submit for activation; Approver approves", "Affiliate becomes Live; Affiliate Admin lands on Home at next sign-in", "Onboarding"),
    ("Organisation defaults inherited", AFFADMIN, "Org defaults set (limits, FTP method)", "Affiliate onboarding Step 4 Configuration", "Defaults shown as 'Inherited from organisation'; nothing re-entered", "Onboarding"),
    ("Affiliate tightens vs loosens a limit", AFFADMIN, "Org LCR amber limit set", "Tighten one threshold; try to loosen another", "Tightening saves; loosening keeps the org default and raises an approval request", "Negative"),
    ("Analyst signs in", ANALYST, "Organisation set up", "Sign in as ALM Analyst", "Home; no onboarding and no organisation setup in the menu", "Roles"),
    ("Approver signs in", APPROVER, "Pending requests exist", "Sign in as Approver > Approvals", "Pending items listed with what is being approved; can approve or reject others' requests", "Roles"),
    ("Viewer signs in", VIEWER, "A signed-off run exists", "Sign in as Viewer; open Home and results", "Can read results and reports; no upload, edit or setup actions anywhere", "Roles"),
    ("Affiliate user tries another affiliate", AFFADMIN, "Two affiliates exist (e.g. Nigeria, Ghana)", "As Nigeria's Affiliate Admin, look for Ghana in the scope picker, data sources, runs, users and approvals; paste a Ghana URL", "Ghana is never shown and cannot be opened - blocked by the database, not just hidden", "Negative"),
    ("User cannot change own role", ANALYST, "-", "Open My Account and Users & roles", "No way to change own role or scope", "Negative"),
    ("Maker cannot approve own request", ADMIN, "User has approval rights", "Raise a request (e.g. run sign-off) then try to approve it yourself", "Approve is blocked: maker cannot be checker", "Negative"),
    ("Self-approval after renaming", ADMIN, "Request raised by this user", "Change own name in My Account, then try to approve", "Still blocked - checks are by user, not name", "Negative"),
    ("Duplicate file upload", ANALYST, "A positions file already admitted", "Upload the same file again", "Blocked as a duplicate", "Negative"),
    ("File with errors", ANALYST, "-", "Upload a positions file with a missing required column or bad dates", "Check panel lists each problem by row and column; nothing is saved until fixed", "Negative"),
    ("Unknown product codes", ANALYST, "-", "Upload positions with a product code the platform doesn't know", "Flagged before saving; 'Create these' adds them; admit only after", "Data"),
    ("Reload a date", ANALYST, "Positions for 31 Jul admitted", "Upload corrected positions for 31 Jul > admit", "A reason is required; the old load shows as replaced in History; earlier runs show data changed since", "Data"),
    ("Market data loaded once by Group", ADMIN, "-", "Upload market_data_2026-07-31.xlsx to the Group Market data source", "FX, curves and policy rates loaded; affiliates see market data available and don't upload their own", "Data"),
    ("Run without market data", ANALYST, "No FX rate for the run date", "Run now for an affiliate whose currency has no rate", "Run is blocked with a clear reason", "Negative"),
    ("Full ALM workflow", ANALYST + " / " + APPROVER, "Affiliate Live, market data loaded", "Data upload > ledger check > propose assumption > approve > Run now > results > request sign-off > approve > generate ALCO pack", "Every step completes; results, limits and the pack all use the signed-off run", "End-to-end"),
    ("Assumption not approved is not used", ANALYST, "A proposal pending approval", "Run now before it is approved", "Run uses the previously approved assumption only", "Negative"),
    ("Approved assumption flows everywhere", ANALYST, "Behavioural model approved", "Run now; check liquidity gap, NII, FTP, stress, forecast", "All reflect the approved assumption without re-entry", "End-to-end"),
    ("Sign-off and reopen a run", ANALYST + " / " + APPROVER, "Signed-off v1 exists", "Reopen with reason > load corrected data > Run now > request sign-off > approve", "v1 frozen; v2 becomes the official figures; packs from v1 show 'Superseded'", "End-to-end"),
    ("Run on a signed-off date", ANALYST, "31 Jul is signed off", "Run now for 31 Jul", "Blocked until the run is reopened", "Negative"),
    ("Approver ran the run themselves", APPROVER, "Approver executed the run", "Try to approve its sign-off", "Blocked - the person who ran it can't sign it off", "Negative"),
    ("Viewing an older version", VIEWER, "v1 and v2 exist", "Run pill > choose v1", "Read-only, banner 'not the official figures', link back to official", "Runs"),
    ("Session persists across refresh", ANALYST, "Signed in", "Refresh the browser; close and reopen the tab", "Still signed in; same scope", "Platform"),
    ("Audit trail cannot be edited", ADMIN, "Activity exists", "Admin > Audit log", "Every action listed with who and when; no edit or delete option", "Negative"),
    ("Approval end to end", ANALYST + " / " + APPROVER, "Analyst saves a product characteristics rule", "Approver opens Approvals, reviews, approves; Analyst runs", "Rule moves Pending > Approved and the run uses it", "Approvals"),
    ("Rejected request", ANALYST + " / " + APPROVER, "Pending request exists", "Approver rejects it", "Item does not take effect; shows Rejected in History", "Approvals"),
    ("No approval rights", VIEWER, "Pending request exists", "Viewer opens Approvals", "Can see but cannot approve or reject; reason shown", "Negative"),
    ("Two approvers, one request", APPROVER, "Two approvers signed in on different devices", "Both try to approve the same request", "First decision wins; the second is told it is already decided", "Approvals"),
    ("Control issue lifecycle", ANALYST + " / " + APPROVER, "-", "Raise issue > advance through stages > owner tries to close > another user closes", "Each stage recorded; owner blocked from closing; closed by a different user", "Control issues"),
    ("Limit breach to control issue", ANALYST, "A limit is in breach", "Limits > breached limit > Raise a remediation issue", "Linked issue created; shown as already escalated on the limit", "Control issues"),
    ("Second and third affiliate", ADMIN + " / " + AFFADMIN, "Organisation set up", "Onboard Ghana and Kenya with their test files", "Each affiliate sees only its own data; Group sees all three", "End-to-end"),
    ("Negative data files", ANALYST, "Kenya onboarding", "Upload the two Kenya NEGATIVE_TEST files", "Row errors block admission; out-of-balance GL blocks ledger sign-off", "Negative"),
    ("Affiliate's own column names", AFFADMIN, "Affiliate uses different column names", "Map them once in onboarding; upload a later file with the same names", "Uploads match automatically with no re-mapping", "Data"),
    ("Group defaults before first run", ADMIN, "Organisation onboarding", "Complete the onboarding wizard without opening the Group-default assumptions under Admin > Organisation setup, then run an affiliate", "The shipped Group defaults apply: FTP prices on the default method and profitability explains what to set up", "Onboarding"),
]

# Scenarios that add something the step-by-step cases don't already cover, and the feature they join.
KEEP = {
    "Refresh during onboarding": "Organisation onboarding",
    "Finish setup later": "Organisation onboarding",
    "Market data loaded once by Group": "Market & reference data",
    "Unknown product codes": "Data loading",
    "Reload a date": "Data loading",
    "Run without market data": "Run management",
    "Approver ran the run themselves": "Run management",
    "Two approvers, one request": "Approvals",
    "Analyst signs in": "Roles & menu",
    "Approver signs in": "Roles & menu",
    "Affiliate user tries another affiliate": "Security controls",
    "User cannot change own role": "Security controls",
    "Full ALM workflow": "End-to-end",
    "Approval end to end": "End-to-end",
    "Group defaults before first run": "End-to-end",
}
NEGATIVE_WORDS = ("blocked", "refused", "cannot", "disabled", "not used", "never shown", "can't", "no way", "not be admitted", "fail")
CASE_TYPE = {i: ("Negative" if any(w in c[4].lower() for w in NEGATIVE_WORDS) else "Functional") for i, c in enumerate(CASES)}
for title, prof, pre, steps, exp, kind in SCENARIOS:
    if title in KEEP:
        CASES.append((KEEP[title], prof, "Platform", f"{steps}\n(Before this: {pre})", exp))
        CASE_TYPE[len(CASES) - 1] = "End-to-end" if KEEP[title] == "End-to-end" else ("Negative" if kind == "Negative" else "Functional")

# Execution order: each feature belongs to a phase; cases keep their written order inside a feature.
PHASES = [
    ("01 Sign in", ["Sign-in & session", "Working context", "Notifications"]),
    ("02 Organisation setup", ["Organisation onboarding"]),
    ("03 Group market data", ["Market & reference data"]),
    ("04 Affiliate onboarding", ["Affiliate onboarding", "Column mapping", "Affiliate activation"]),
    ("05 Load data", ["Data loading"]),
    ("06 Assumptions & models", ["Behavioural modelling", "Assumptions & rules"]),
    ("07a Readiness", ["Readiness"]),
    ("07 Run & sign-off", ["Run management"]),
    ("08 Results", ["Liquidity", "Cashflows", "FTP", "Profitability", "Stress testing", "Limits"]),
    ("09 Approvals & control issues", ["Approvals", "Control issues"]),
    ("10 Reports", ["Reports"]),
    ("11 Roles & security", ["Roles & menu", "Security controls", "Help & tour"]),
    ("12 End-to-end journeys", ["End-to-end"]),
]
phase_of = {f: (i, name) for i, (name, feats) in enumerate(PHASES) for f in feats}
feat_rank = {f: j for _, feats in PHASES for j, f in enumerate(feats)}
ordered = sorted(
    enumerate(CASES),
    key=lambda ic: (phase_of.get(ic[1][0], (99, ""))[0], feat_rank.get(ic[1][0], 99), ic[0]),
)


def navigation(steps: str) -> str:
    """The click path: the first line of the steps when it reads like 'Menu > Tab > Button'."""
    first = steps.split("\n")[0].lstrip("*")
    return first if ">" in first else ""


wb = Workbook()

# ── Release note ──
rn = wb.active
rn.title = "Release Note"
rn.append(["Ascent ALM - UAT Cycle 1 (Ecobank eProcess)"])
rn["A1"].font = Font(bold=True, size=13, color=NAVY)
rn.append(["S/N", "FEATURES", "Testability", "Profile Requirement", "Notes"])
features = []
for f, prof, *_ in CASES:
    if f not in [x[0] for x in features]:
        features.append([f, set()])
    next(x for x in features if x[0] == f)[1].add(prof)
NOTES = {
    "Behavioural modelling": "Requires 12+ months of uploaded history (test data supplied)",
    "Data loading": "Upload-based; automated connectors are a deployment item",
    "Affiliate onboarding": "Requires an Affiliate Admin login (created in Organisation onboarding Step 2, Affiliates & people)",
    "Market & reference data": "Group loads market data for all affiliates (Data > Market data: one file or manual entry)",
}
features.sort(key=lambda x: (phase_of.get(x[0], (99, ""))[0], feat_rank.get(x[0], 99)))
for i, (f, profs) in enumerate(features, 1):
    rn.append([i, f, "Ready", ", ".join(sorted(profs)), NOTES.get(f, "")])

# ── Test cases ──
tc = wb.create_sheet("Test Cases")
COLS = ["Test Case ID", "Seq", "Phase", "Feature", "Type", "Email Ref", "Signed in as", "Navigation (where)", "Depends on", "Steps", "Expected Result", "Tester Name", "Test Date", "Status", "Comments", "Screenshot"]
tc.append(COLS)
prev_by_phase: dict[str, str] = {}
# Where a case starts when its own steps don't name a menu path: the screen the phase works in,
# or - once a case in the phase has named one - the same screen as that case.
PHASE_SCREEN = {
    '01 Sign in': 'Sign-in page',
    '02 Organisation setup': 'Organisation setup wizard (opens after sign-in)',
    '03 Group market data': 'Data > Market data',
    '04 Affiliate onboarding': 'Affiliate setup wizard (opens after the Affiliate Admin signs in)',
    '05 Load data': 'Data > Data sources',
    '06 Assumptions & models': 'Assumptions > Behavioural models',
    '07a Readiness': 'Run & results > Readiness',
    '07 Run & sign-off': 'Run & results > Run now',
    '08 Results': 'Run & results',
    '09 Approvals & control issues': 'Approvals',
    '10 Reports': 'Reports',
    '11 Roles & security': 'Sign-in page, then the menu',
}
last_nav: dict[str, str] = {}
for seq, (orig, (f, prof, ref, steps, exp)) in enumerate(ordered, 1):
    case_id = f"TC_{seq:03d}"
    phase = phase_of.get(f, (99, "Other"))[1]
    depends = prev_by_phase.get(phase, "-")
    prev_by_phase[phase] = case_id
    nav = navigation(steps)
    if nav:
        last_nav[phase] = nav
    else:
        nav = f'Same screen as previous step: {last_nav[phase]}' if phase in last_nav else PHASE_SCREEN.get(phase, '')
    tc.append([case_id, seq, phase, f, CASE_TYPE[orig], ref, prof, nav, depends, "*" + steps, exp, "", "", "Not Tested", "", ""])
last = len(CASES) + 1
dv = DataValidation(type="list", formula1='"Pass,Fail,Blocked,Not Tested"', allow_blank=True)
tc.add_data_validation(dv)
dv.add(f"N2:N{last}")
tc.conditional_formatting.add(f"N2:N{last}", CellIsRule(operator="equal", formula=['"Pass"'], fill=PatternFill("solid", fgColor="D7F0DD")))
tc.conditional_formatting.add(f"N2:N{last}", CellIsRule(operator="equal", formula=['"Fail"'], fill=PatternFill("solid", fgColor="F8D7DA")))
tc.conditional_formatting.add(f"N2:N{last}", CellIsRule(operator="equal", formula=['"Blocked"'], fill=PatternFill("solid", fgColor="FFF1C9")))

# ── Test data ──
td = wb.create_sheet("Test Data")
td.append(["Item", "Value", "Notes"])
for row in [
    ("Platform URL", "(to be shared)", ""),
    ("Password (all test users)", "Ecobank@2026", "Change after first sign-in"),
    ("Organisation Admin", "adaeze.okonkwo@ecobank.com", "Second admin: david.adeyemi@ecobank.com"),
    ("Approver", "kofi.mensah@ecobank.com", "Second approver: fatima.bello@ecobank.com"),
    ("ALM Analyst", "chinwe.okafor@ecobank.com", "Also aminata.traore@ecobank.com"),
    ("Viewer", "yaw.boateng@ecobank.com", "Also samuel.owusu@ecobank.com"),
    ("Affiliate", "NG · Ecobank Nigeria · Nigeria · CBN · NGN", ""),
    ("As-of (run) date", "31 Jul 2026", ""),
    ("FX rate", "NGN per USD = 1,550 as at 31 Jul 2026", ""),
    ("NGN yield curve (31 Jul 2026)", "1M 26.0% · 3M 26.5% · 6M 27.0% · 1Y 27.5% · 3Y 26.0% · 5Y 24.5%", ""),
    ("Test files folder", "Consulting Demo\\test-files (see README.txt)", "One sub-folder per party"),
    ("Group market data", "1_Group_market_data/market_data_2026-07-31.xlsx", "FX rates, yield curves (NGN, GHS, KES, USD), policy rates (CBN, BoG, CBK) - upload once as Organisation Admin"),
    ("Nigeria (NG, CBN, NGN)", "2_Nigeria_NG: loans, deposits, treasury, gl_ledger, balance-history, account-history", "Behavioural history supplied for Nigeria only"),
    ("Ghana (GH, Bank of Ghana, GHS)", "3_Ghana_GH: loans, deposits, treasury, gl_ledger", ""),
    ("Kenya (KE, Central Bank of Kenya, KES)", "4_Kenya_KE: loans, deposits, treasury, gl_ledger", "Plus NEGATIVE_TEST files that must fail"),
    ("Back-test settings", "Hold-out 3 months · tolerance MAPE 10%", ""),
    ("Currency basis add-on", "USD 40 bps", ""),
]:
    td.append(list(row))

# ── Scenarios (end-to-end and negative checks) ──

# ── Summary ──
sm = wb.create_sheet("Summary")
sm.append(["SN", "Feature", "Fail", "Pass", "Blocked", "Not Tested", "Total", "Certify"])
for i, (f, _) in enumerate(features, 1):
    r = i + 1
    rng_f, rng_s = f"'Test Cases'!$D$2:$D${last}", f"'Test Cases'!$N$2:$N${last}"
    sm.append([
        i, f,
        f'=COUNTIFS({rng_f},B{r},{rng_s},"Fail")',
        f'=COUNTIFS({rng_f},B{r},{rng_s},"Pass")',
        f'=COUNTIFS({rng_f},B{r},{rng_s},"Blocked")',
        f'=COUNTIFS({rng_f},B{r},{rng_s},"Not Tested")',
        f"=SUM(C{r}:F{r})",
        f'=IF((C{r}+D{r})=0,"",D{r}/(C{r}+D{r}))',
    ])
tot = len(features) + 2
sm.append(["", "TOTAL", f"=SUM(C2:C{tot-1})", f"=SUM(D2:D{tot-1})", f"=SUM(E2:E{tot-1})", f"=SUM(F2:F{tot-1})", f"=SUM(G2:G{tot-1})", f'=IF((C{tot}+D{tot})=0,"",D{tot}/(C{tot}+D{tot}))'])
for c in sm[tot]:
    c.font = BOLD
for r in range(2, tot + 1):
    sm[f"H{r}"].number_format = "0%"

# ── Styling ──
def style(ws, header_row, widths):
    for c in ws[header_row]:
        c.fill, c.font, c.alignment, c.border = HEAD, WHITE, Alignment(wrap_text=True, vertical="center"), BOX
    for row in ws.iter_rows(min_row=header_row + 1):
        for c in row:
            c.alignment, c.border = WRAP, BOX
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

style(rn, 2, {"A": 6, "B": 34, "C": 12, "D": 44, "E": 60})
style(tc, 1, {"A": 10, "B": 6, "C": 24, "D": 20, "E": 12, "F": 9, "G": 18, "H": 36, "I": 11, "J": 55, "K": 50, "L": 14, "M": 12, "N": 12, "O": 28, "P": 14})
style(td, 1, {"A": 30, "B": 70, "C": 34})
style(sm, 1, {"A": 6, "B": 30, "C": 8, "D": 8, "E": 9, "F": 11, "G": 8, "H": 9})
tc.auto_filter.ref = f"A1:P{last}"
for r in range(2, last + 1):
    if r % 2 == 0:
        for c in tc[r]:
            c.fill = BAND

wb.save(OUT)
print(f"{len(CASES)} test cases, {len(features)} features -> {OUT}")
