"""
Generate onboarding demo data for Ecobank's 33 African affiliates.

Structure is taken from the real core-banking extract (Ultrapay Post
Migration.xlsx):

  * three-level GL hierarchy — category / level1 / level2
  * account numbers are the six-digit level-2 GL code plus a five-digit
    sequence, exactly as Ultrapay emits them (200802 -> 20080200001)
  * a legacy account number carried through migration
  * account class, partial lien amounts, monthly turnover
  * maker / checker / status on every row

Category mapping from that file: 10 and 20 are assets, 30 is capital,
40 is liabilities, 50 and 60 are P&L (out of scope for a position book).

Amounts are in MILLIONS of the affiliate's functional currency, matching
the convention the Nigeria seed and the existing Ghana demo file already
use. Balance sheets balance exactly, with retained earnings as the residual
— which is how a real trial balance closes.

Deterministic: seeded per affiliate, so re-running reproduces byte-identical
files and a diff means a real change.
"""

import csv
import os
import random

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo_data", "affiliates"
)
AS_OF = "2026-07-31"

HEADER = [
    "id", "accountNumber", "legacyAccountNumber", "accountClass", "branchCode", "category",
    "productClass", "currency", "amount", "maturityDate", "nextRepricingDate", "behaviouralTag",
    "rateType", "interestRatePct", "hqlaLevel", "hqlaHaircutPct", "lcrCashflowRole", "lcrRatePct",
    "asfFactorPct", "rsfFactorPct", "irrbbRateSensitive", "approxDurationYears", "legalEntityCode",
    "orgUnitCode", "glAccountCode", "commonCoaCode", "counterpartyId", "performingStatus",
    "provisionAmount", "lienAmount", "lienReason", "monthlyCredit", "monthlyDebit", "maker",
    "checker", "recordStatus", "notes",
]

# ── The 33 African affiliates ────────────────────────────────────────────
# Ethiopia is excluded: it is a representative office, not a banking
# subsidiary, so it has no balance sheet to onboard.
# (code, name, country, currency, regulator, region, total assets in local mm, story)
AFFILIATES = [
    # UEMOA — one currency, one central bank, eight countries. The reason
    # the Common COA exists: eight local charts, one reporting basis.
    ("CI", "Ecobank Côte d'Ivoire", "Côte d'Ivoire", "XOF", "BCEAO", "UEMOA", 2_850_000, "flagship"),
    ("SN", "Ecobank Senegal", "Senegal", "XOF", "BCEAO", "UEMOA", 1_240_000, "concentration"),
    ("ML", "Ecobank Mali", "Mali", "XOF", "BCEAO", "UEMOA", 690_000, "npl"),
    ("BF", "Ecobank Burkina Faso", "Burkina Faso", "XOF", "BCEAO", "UEMOA", 610_000, "standard"),
    ("BJ", "Ecobank Benin", "Benin", "XOF", "BCEAO", "UEMOA", 540_000, "standard"),
    ("TG", "Ecobank Togo", "Togo", "XOF", "BCEAO", "UEMOA", 470_000, "interbank"),
    ("NE", "Ecobank Niger", "Niger", "XOF", "BCEAO", "UEMOA", 280_000, "thin_buffer"),
    ("GW", "Ecobank Guinea-Bissau", "Guinea-Bissau", "XOF", "BCEAO", "UEMOA", 96_000, "small"),
    # CEMAC — same shape again, different currency and regulator.
    ("CM", "Ecobank Cameroon", "Cameroon", "XAF", "BEAC / COBAC", "CEMAC", 1_180_000, "standard"),
    ("GA", "Ecobank Gabon", "Gabon", "XAF", "BEAC / COBAC", "CEMAC", 520_000, "concentration"),
    ("CG", "Ecobank Congo", "Congo-Brazzaville", "XAF", "BEAC / COBAC", "CEMAC", 340_000, "npl"),
    ("TD", "Ecobank Chad", "Chad", "XAF", "BEAC / COBAC", "CEMAC", 210_000, "thin_buffer"),
    ("CF", "Ecobank Centrafrique", "Central African Republic", "XAF", "BEAC / COBAC", "CEMAC", 78_000, "small"),
    ("GQ", "Ecobank Guinée Équatoriale", "Equatorial Guinea", "XAF", "BEAC / COBAC", "CEMAC", 130_000, "small"),
    # Anglophone and other West Africa — every one its own currency.
    ("NG", "Ecobank Nigeria", "Nigeria", "NGN", "CBN", "West Africa", 2_450_000, "flagship"),
    ("GH", "Ecobank Ghana", "Ghana", "GHS", "BoG", "West Africa", 26_500, "concentration"),
    ("GN", "Ecobank Guinea", "Guinea", "GNF", "BCRG", "West Africa", 4_100_000, "small"),
    ("SL", "Ecobank Sierra Leone", "Sierra Leone", "SLE", "BSL", "West Africa", 5_600, "small"),
    ("LR", "Ecobank Liberia", "Liberia", "LRD", "CBL", "West Africa", 34_000, "dollarised"),
    ("GM", "Ecobank Gambia", "Gambia", "GMD", "CBG", "West Africa", 12_800, "small"),
    ("CV", "Ecobank Cabo Verde", "Cape Verde", "CVE", "BCV", "West Africa", 41_000, "small"),
    # Central Africa outside CEMAC.
    ("CD", "Ecobank RD Congo", "DR Congo", "CDF", "BCC", "Central Africa", 1_950_000, "dollarised"),
    ("ST", "Ecobank São Tomé", "São Tomé and Príncipe", "STN", "BCSTP", "Central Africa", 2_300, "small"),
    # East Africa.
    ("KE", "Ecobank Kenya", "Kenya", "KES", "CBK", "East Africa", 118_000, "npl"),
    ("UG", "Ecobank Uganda", "Uganda", "UGX", "BoU", "East Africa", 1_420_000, "standard"),
    ("TZ", "Ecobank Tanzania", "Tanzania", "TZS", "BoT", "East Africa", 780_000, "standard"),
    ("RW", "Ecobank Rwanda", "Rwanda", "RWF", "BNR", "East Africa", 390_000, "standard"),
    ("BI", "Ecobank Burundi", "Burundi", "BIF", "BRB", "East Africa", 310_000, "thin_buffer"),
    ("SS", "Ecobank South Sudan", "South Sudan", "SSP", "BoSS", "East Africa", 96_000, "crisis"),
    # Southern Africa.
    ("MW", "Ecobank Malawi", "Malawi", "MWK", "RBM", "Southern Africa", 480_000, "standard"),
    ("ZM", "Ecobank Zambia", "Zambia", "ZMW", "BoZ", "Southern Africa", 14_600, "interbank"),
    ("ZW", "Ecobank Zimbabwe", "Zimbabwe", "USD", "RBZ", "Southern Africa", 620, "dollarised"),
    ("MZ", "Ecobank Mozambique", "Mozambique", "MZN", "BdM", "Southern Africa", 38_000, "fx_mismatch"),
]

# ── Real Ultrapay level-2 GL codes, by role ──────────────────────────────
# Taken from the Chart of Account sheet. Nigeria's seeded GL already uses
# these, so an onboarded affiliate reconciles against the same structure.
GL = {
    "cash_till":      ("200102", "CASH IN TILL"),
    "cash_transit":   ("200103", "CASH IN TRANSIT"),
    "cash_atm":       ("200104", "CASH IN ATM"),
    "cbn":            ("200101", "CASH AND CENTRAL BANK BALANCES"),
    "nostro":         ("200301", "DUE FROM BANKS - NOSTRO"),
    "placement":      ("200401", "PLACEMENTS WITH BANKS"),
    "tbill":          ("200501", "TREASURY BILLS"),
    "bond_govt":      ("200502", "GOVERNMENT BONDS"),
    "bond_corp":      ("200503", "CORPORATE BONDS"),
    "fixed_income":   ("200802", "FIXED INCOME INVESTMENT RECEIVABLE"),
    "loan_corp":      ("200601", "LOANS AND ADVANCES - CORPORATE"),
    "loan_od":        ("200602", "OVERDRAFTS - CORPORATE"),
    "loan_sme":       ("200603", "LOANS AND ADVANCES - SME"),
    "loan_mortgage":  ("200604", "MORTGAGE LOANS"),
    "loan_retail":    ("200605", "PERSONAL LOANS - RETAIL"),
    "loan_staff":     ("200606", "STAFF LOANS"),
    "loan_agric":     ("200607", "AGRICULTURAL FINANCE"),
    "loan_trade":     ("200608", "TRADE FINANCE - IMPORT"),
    "loan_asset":     ("200609", "ASSET FINANCE - LEASES"),
    "fixed_asset":    ("100101", "FIXED AND OTHER ASSETS"),
    "depreciation":   ("101301", "CUMM. DEPRECIATION LEVEL2"),
    "prepaid":        ("101201", "FIXED ASSETS ACCOUNTS"),
    "ca_retail":      ("400102", "CURRENT"),
    "ca_corp":        ("400105", "CURRENT - CORPORATE"),
    "savings":        ("400101", "SAVINGS"),
    "fd_retail":      ("400103", "FIXED"),
    "fd_corp":        ("400106", "FIXED - CORPORATE"),
    "target":         ("400104", "TARGET"),
    "domiciliary":    ("400107", "DOMICILIARY DEPOSITS"),
    "interbank":      ("400301", "DUE TO BANKS"),
    "borrowing":      ("400302", "LONG TERM BORROWINGS"),
    "eurobond":       ("400303", "DEBT SECURITIES ISSUED"),
    "int_payable":    ("400202", "INTEREST PAYABLE"),
    "other_liab":     ("400401", "OTHER LIABILITIES AND ACCRUALS"),
    "mgr_cheque":     ("400402", "MANAGERS CHEQUES PAYABLE"),
    "share_capital":  ("300101", "SHARE CAPITAL"),
    "retained":       ("300201", "RETAINED EARNINGS AND RESERVES"),
}


def n(v, ccy):
    """Round to the currency's convention. XOF/XAF and friends have no minor unit."""
    zero = {"XOF", "XAF", "GNF", "BIF", "RWF", "UGX", "TZS", "CDF", "SSP", "MWK", "STN"}
    return int(round(v)) if ccy in zero else round(v, 2)


def row(**kw):
    """A position row with the defaults a benign asset would carry."""
    base = {
        "accountClass": "Customer", "branchCode": "HQ001", "maturityDate": "",
        "nextRepricingDate": "", "behaviouralTag": "N/A", "rateType": "N/A",
        "interestRatePct": "", "hqlaLevel": "", "hqlaHaircutPct": 0, "lcrCashflowRole": "",
        "lcrRatePct": "", "asfFactorPct": "", "rsfFactorPct": "", "irrbbRateSensitive": "No",
        "approxDurationYears": "", "counterpartyId": "", "performingStatus": "Performing",
        "provisionAmount": "", "lienAmount": 0, "lienReason": "", "monthlyCredit": 0,
        "monthlyDebit": 0, "maker": "FLEXCUBE-IF", "checker": "SYSTEM",
        "recordStatus": "ACTIVE", "notes": "",
    }
    base.update(kw)
    return base


def build(aff):
    code, name, country, ccy, regulator, region, total, story = aff
    rng = random.Random(f"ecobank-{code}-2026-07")
    A = float(total)  # target total assets

    le = f"LE-{code}"
    ou_tsy, ou_cib, ou_rtl = f"OU-{code}-TSY", f"OU-{code}-CIB", f"OU-{code}-RTL"
    seq = {}

    def acct(key):
        """Ultrapay's account number: six-digit level-2 GL code + 5-digit sequence."""
        gl = GL[key][0]
        seq[gl] = seq.get(gl, 0) + 1
        return f"{gl}{seq[gl]:05d}"

    def legacy(i):
        return f"{ccy}{rng.randint(1000000, 9999999):07d}{i:03d}"

    rows = []
    i = 0

    def add(**kw):
        nonlocal i
        i += 1
        key = kw.pop("key")
        kw.setdefault("accountNumber", acct(key))
        kw.setdefault("glAccountCode", GL[key][0])
        kw.setdefault("productClass", GL[key][1].title())
        rows.append(row(
            id=f"{code}-{i:03d}", legacyAccountNumber=legacy(i), currency=ccy,
            legalEntityCode=le, **kw,
        ))

    def j(pct):
        """Jitter, so 33 affiliates are not 33 copies of one shape."""
        return 1 + rng.uniform(-pct, pct)

    # ── Assets ──────────────────────────────────────────────────────────
    # Cash and central bank. The statutory reserve is genuinely encumbered:
    # a bank cannot sell it to meet an outflow, so it carries a full lien.
    till = A * 0.012 * j(0.2)
    add(key="cash_till", accountClass="Internal", category="Asset", amount=n(till, ccy),
        hqlaLevel="Level 1", lcrCashflowRole="HQLA", rsfFactorPct=0, orgUnitCode=ou_tsy,
        commonCoaCode="COA-11", monthlyCredit=n(till * 4, ccy), monthlyDebit=n(till * 3.8, ccy))

    add(key="cash_transit", accountClass="Internal", category="Asset", amount=n(A * 0.004 * j(0.3), ccy),
        hqlaLevel="Level 1", lcrCashflowRole="HQLA", rsfFactorPct=0, orgUnitCode=ou_tsy,
        commonCoaCode="COA-11")

    add(key="cash_atm", accountClass="Internal", category="Asset", amount=n(A * 0.006 * j(0.25), ccy),
        hqlaLevel="Level 1", lcrCashflowRole="HQLA", rsfFactorPct=0, orgUnitCode=ou_rtl,
        commonCoaCode="COA-11")

    reserve = A * 0.085 * j(0.15)
    add(key="cbn", accountClass="Internal", category="Asset", amount=n(reserve, ccy),
        hqlaLevel="Level 1", lcrCashflowRole="HQLA", rsfFactorPct=0, orgUnitCode=ou_tsy,
        commonCoaCode="COA-11", lienAmount=n(reserve * 0.72, ccy),
        lienReason=f"Statutory cash reserve requirement held at {regulator}",
        notes="Reserve portion is unavailable to meet outflows")

    # Due from banks. Nostro is a foreign-currency account by nature.
    nostro_ccy = "USD" if ccy != "USD" else "EUR"
    add(key="nostro", accountClass="Nostro", category="Asset", amount=n(A * 0.045 * j(0.35), ccy),
        maturityDate="2026-08-14", lcrCashflowRole="Inflow", lcrRatePct=100, rsfFactorPct=0,
        orgUnitCode=ou_tsy, commonCoaCode="COA-12", counterpartyId="CP-CORRESPONDENT-01",
        notes=f"Correspondent balances, {nostro_ccy} equivalent")

    add(key="placement", category="Asset", amount=n(A * 0.038 * j(0.4), ccy),
        maturityDate="2026-09-30", nextRepricingDate="2026-09-30", rateType="Fixed",
        interestRatePct=round(rng.uniform(4, 11), 2), lcrCashflowRole="Inflow", lcrRatePct=100,
        rsfFactorPct=15, irrbbRateSensitive="Yes", approxDurationYears=0.17,
        orgUnitCode=ou_tsy, commonCoaCode="COA-12", counterpartyId="CP-INTERBANK-01")

    # Securities. Treasury bills and government bonds are Level 1; a slice of
    # the bond book is pledged for a repo and carries a partial lien.
    tbill = A * 0.095 * j(0.25)
    add(key="tbill", category="Asset", amount=n(tbill, ccy), maturityDate="2026-12-15",
        rateType="Fixed", interestRatePct=round(rng.uniform(5, 18), 2), hqlaLevel="Level 1",
        lcrCashflowRole="HQLA", rsfFactorPct=5, irrbbRateSensitive="Yes",
        approxDurationYears=0.38, orgUnitCode=ou_tsy, commonCoaCode="COA-13",
        counterpartyId="CP-SOVEREIGN")

    bond = A * 0.072 * j(0.3)
    pledged = bond * rng.uniform(0.15, 0.4)
    add(key="bond_govt", category="Asset", amount=n(bond, ccy), maturityDate="2031-06-30",
        rateType="Fixed", interestRatePct=round(rng.uniform(6, 17), 2), hqlaLevel="Level 1",
        lcrCashflowRole="HQLA", rsfFactorPct=5, irrbbRateSensitive="Yes",
        approxDurationYears=round(rng.uniform(3.4, 4.6), 2), orgUnitCode=ou_tsy,
        commonCoaCode="COA-13", counterpartyId="CP-SOVEREIGN",
        lienAmount=n(pledged, ccy),
        lienReason=f"Pledged as collateral for {regulator} standing facility",
        notes="Partial lien — only the unpledged portion is eligible HQLA")

    add(key="bond_corp", category="Asset", amount=n(A * 0.021 * j(0.5), ccy),
        maturityDate="2029-03-31", rateType="Fixed", interestRatePct=round(rng.uniform(8, 19), 2),
        hqlaLevel="Level 2A", hqlaHaircutPct=15, lcrCashflowRole="HQLA", rsfFactorPct=15,
        irrbbRateSensitive="Yes", approxDurationYears=round(rng.uniform(2.1, 3.2), 2),
        orgUnitCode=ou_tsy, commonCoaCode="COA-13", counterpartyId="CP-CORP-ISSUER-01",
        notes="Level 2A carries a 15% haircut and counts toward the 40% cap")

    add(key="fixed_income", accountClass="Internal", category="Asset",
        amount=n(A * 0.008 * j(0.4), ccy), lcrCashflowRole="Inflow", lcrRatePct=100,
        rsfFactorPct=50, orgUnitCode=ou_tsy, commonCoaCode="COA-13",
        notes="Accrued investment income receivable")

    # ── Loan book ───────────────────────────────────────────────────────
    # Floating-rate loans reprice quarterly and mature years out. That
    # separation is the whole point of a repricing ladder.
    # A product line in a core banking system aggregates thousands of accounts
    # of mixed quality, so impairment is a separate smaller line beside the
    # performing bulk — which is also how a bank reports it. Impairing a whole
    # product line instead put 18% of the book into NPL on a single roll and
    # implied an insolvent bank.
    npl_target = {
        "npl": (0.13, 0.18), "crisis": (0.19, 0.26), "thin_buffer": (0.07, 0.11),
        "dollarised": (0.06, 0.10), "small": (0.04, 0.08), "interbank": (0.05, 0.08),
        "concentration": (0.04, 0.07), "fx_mismatch": (0.05, 0.09), "flagship": (0.03, 0.06),
        "standard": (0.04, 0.08),
    }[story]
    npl_share = rng.uniform(*npl_target)

    # The last column weights impairment toward the products that actually go
    # bad: agriculture and SME lending, not staff loans or mortgages.
    loans = [
        ("loan_corp",     0.185, "Floating", "2029-06-30", "2026-10-01", "CIB", 0.30, 1.4),
        ("loan_od",       0.062, "Floating", "2027-01-31", "2026-08-31", "CIB", 0.55, 1.9),
        ("loan_sme",      0.058, "Floating", "2028-09-30", "2026-10-01", "CIB", 0.42, 2.2),
        ("loan_mortgage", 0.049, "Fixed",    "2038-12-31", "",           "RTL", 0.06, 0.5),
        ("loan_retail",   0.055, "Fixed",    "2029-07-31", "",           "RTL", 0.18, 1.6),
        ("loan_staff",    0.009, "Fixed",    "2032-12-31", "",           "RTL", 0.03, 0.0),
        ("loan_agric",    0.031, "Floating", "2028-03-31", "2026-10-01", "CIB", 0.22, 2.6),
        ("loan_trade",    0.044, "Floating", "2027-04-30", "2026-10-31", "CIB", 0.61, 1.1),
        ("loan_asset",    0.026, "Fixed",    "2030-09-30", "",           "CIB", 0.12, 0.9),
    ]
    weight_total = sum(share * risk for _, share, _, _, _, _, _, risk in loans)
    gross_loans = sum(A * share for _, share, _, _, _, _, _, _ in loans)

    for k, share, rt, mat, repr_, unit, turn, risk in loans:
        gross = A * share * j(0.28)
        # This product's slice of the book's total impairment.
        impaired = min(gross_loans * npl_share * (share * risk / weight_total), gross * 0.45)
        performing = gross - impaired
        ou = ou_cib if unit == "CIB" else ou_rtl

        add(key=k, category="Asset", amount=n(performing, ccy), maturityDate=mat,
            nextRepricingDate=repr_, rateType=rt,
            interestRatePct=round(rng.uniform(9, 26), 2), rsfFactorPct=85,
            irrbbRateSensitive="Yes", approxDurationYears=round(rng.uniform(0.5, 6.5), 2),
            orgUnitCode=ou, commonCoaCode="COA-14",
            counterpartyId=f"CP-{unit}-{rng.randint(1, 40):03d}",
            performingStatus="Performing",
            monthlyCredit=n(performing * turn * 0.5, ccy),
            monthlyDebit=n(performing * turn * 0.45, ccy))

        # Only the riskier products carry a separately-reported impaired line.
        if impaired > gross * 0.004 and risk >= 0.9:
            band = rng.random()
            if band < 0.55:
                status, prov, dpd = "Substandard", rng.uniform(0.10, 0.25), rng.randint(91, 179)
            elif band < 0.85:
                status, prov, dpd = "Doubtful", rng.uniform(0.5, 0.75), rng.randint(180, 359)
            else:
                status, prov, dpd = "Loss", rng.uniform(0.9, 1.0), rng.randint(360, 900)
            add(key=k, category="Asset", amount=n(impaired, ccy), maturityDate=mat,
                nextRepricingDate=repr_, rateType=rt,
                interestRatePct=round(rng.uniform(9, 26), 2), rsfFactorPct=100,
                irrbbRateSensitive="No", approxDurationYears=round(rng.uniform(0.5, 3.0), 2),
                orgUnitCode=ou, commonCoaCode="COA-14",
                counterpartyId=f"CP-{unit}-{rng.randint(41, 70):03d}",
                performingStatus=status, provisionAmount=n(impaired * prov, ccy),
                notes=f"{dpd} days past due; non-accrual")

    # Non-earning assets. Depreciation is a credit balance sitting in the
    # asset category, which is how a ledger actually carries it.
    add(key="fixed_asset", accountClass="Internal", category="Asset",
        amount=n(A * 0.028 * j(0.3), ccy), rsfFactorPct=100, orgUnitCode=ou_tsy,
        commonCoaCode="COA-15", notes="Non-earning")
    add(key="depreciation", accountClass="Internal", category="Asset",
        amount=n(-A * 0.009 * j(0.3), ccy), rsfFactorPct=100, orgUnitCode=ou_tsy,
        commonCoaCode="COA-15", notes="Accumulated depreciation — credit balance")
    add(key="prepaid", accountClass="Internal", category="Asset",
        amount=n(A * 0.011 * j(0.35), ccy), rsfFactorPct=100, orgUnitCode=ou_tsy,
        commonCoaCode="COA-15", notes="Prepayments and sundry receivables")

    assets = sum(r["amount"] for r in rows if r["category"] == "Asset")

    # ── Liabilities ─────────────────────────────────────────────────────
    # Deposit mix drives LCR far more than the asset side does, so the
    # stories differentiate here.
    if story == "crisis":
        mix = {"ca_retail": .10, "ca_corp": .17, "savings": .07, "fd_retail": .05,
               "fd_corp": .21, "target": .02, "domiciliary": .09, "interbank": .13,
               "borrowing": .04}
    elif story == "interbank":
        mix = {"ca_retail": .13, "ca_corp": .14, "savings": .11, "fd_retail": .08,
               "fd_corp": .13, "target": .03, "domiciliary": .05, "interbank": .16,
               "borrowing": .05}
    elif story == "thin_buffer":
        mix = {"ca_retail": .12, "ca_corp": .19, "savings": .08, "fd_retail": .06,
               "fd_corp": .19, "target": .02, "domiciliary": .07, "interbank": .10,
               "borrowing": .04}
    elif story == "concentration":
        # A funding base leaning heavily on corporate and government term
        # money. Real in small markets, where one parastatal or ministry
        # account can be a material share of the whole deposit book.
        mix = {"ca_retail": .11, "ca_corp": .12, "savings": .09, "fd_retail": .06,
               "fd_corp": .30, "target": .02, "domiciliary": .05, "interbank": .06,
               "borrowing": .03}
    elif story == "fx_mismatch":
        mix = {"ca_retail": .13, "ca_corp": .12, "savings": .10, "fd_retail": .07,
               "fd_corp": .11, "target": .03, "domiciliary": .22, "interbank": .07,
               "borrowing": .04}
    elif story == "dollarised":
        mix = {"ca_retail": .11, "ca_corp": .13, "savings": .08, "fd_retail": .06,
               "fd_corp": .10, "target": .02, "domiciliary": .28, "interbank": .06,
               "borrowing": .03}
    else:
        mix = {"ca_retail": .18, "ca_corp": .15, "savings": .16, "fd_retail": .11,
               "fd_corp": .13, "target": .04, "domiciliary": .06, "interbank": .05,
               "borrowing": .03}

    spec = {
        # key            tag            asf  lcr%  class      unit   turnover
        "ca_retail":   ("Stable",       90,   5,  "Customer", "RTL", 1.30),
        "ca_corp":     ("Less Stable",  50,  25,  "Customer", "CIB", 1.90),
        "savings":     ("Stable",       95,   5,  "Customer", "RTL", 0.42),
        "fd_retail":   ("Stable",       95,   5,  "Customer", "RTL", 0.04),
        "fd_corp":     ("Volatile",     50,  40,  "Customer", "CIB", 0.06),
        "target":      ("Stable",       95,   3,  "Customer", "RTL", 0.22),
        "domiciliary": ("Less Stable",  50,  25,  "Customer", "CIB", 0.85),
        "interbank":   ("Volatile",      0, 100,  "Customer", "TSY", 0.30),
        "borrowing":   ("N/A",         100,   0,  "Customer", "TSY", 0.00),
    }
    mats = {"fd_retail": "2027-01-31", "fd_corp": "2026-11-30", "target": "2027-06-30",
            "interbank": "2026-08-20", "borrowing": "2031-12-31"}

    for k, share in mix.items():
        tag, asf, lcr, cls, unit, turn = spec[k]
        amt = assets * share * j(0.1)
        ou = {"RTL": ou_rtl, "CIB": ou_cib, "TSY": ou_tsy}[unit]
        coa = "COA-21" if k in ("interbank", "borrowing") else "COA-22"
        common = dict(
            key=k, accountClass=cls, category="Liability", maturityDate=mats.get(k, ""),
            nextRepricingDate=mats.get(k, "") if k in ("interbank", "fd_corp") else "",
            behaviouralTag=tag, rateType="Fixed" if asf else "Floating",
            lcrCashflowRole="Outflow", lcrRatePct=lcr, asfFactorPct=asf,
            irrbbRateSensitive="Yes" if k not in ("ca_retail", "savings") else "No",
            orgUnitCode=ou, commonCoaCode=coa,
        )

        if k == "fd_corp":
            # Corporate term money is where single-name funding risk lives, so
            # it is split across named depositors rather than booked as one
            # row. Booked as one row, the concentration measure only reports
            # the shape of the file. The concentration story gives one name a
            # dominant share; elsewhere it is genuinely spread.
            splits = ([0.46, 0.22, 0.14, 0.11, 0.07] if story == "concentration"
                      else [0.24, 0.21, 0.19, 0.14, 0.12, 0.10])
            for d, sh in enumerate(splits, start=1):
                piece = amt * sh
                add(amount=n(piece, ccy), interestRatePct=round(rng.uniform(4, 16), 2),
                    approxDurationYears=round(rng.uniform(0.1, 1.2), 2),
                    counterpartyId=f"CP-CIB-{d:03d}",
                    monthlyCredit=n(piece * turn, ccy), monthlyDebit=n(piece * turn * 0.9, ccy),
                    notes="Single largest depositor" if (d == 1 and story == "concentration") else "",
                    **common)
            continue

        cp = {"interbank": "CP-INTERBANK-01", "borrowing": "CP-DFI-01"}.get(k, "")
        add(amount=n(amt, ccy), interestRatePct=round(rng.uniform(0.5, 14), 2),
            approxDurationYears=round(rng.uniform(0.05, 2.4), 2), counterpartyId=cp,
            monthlyCredit=n(amt * turn, ccy), monthlyDebit=n(amt * turn * 0.94, ccy), **common)

    # The three biggest affiliates have issued term paper.
    if story == "flagship":
        add(key="eurobond", category="Liability", amount=n(assets * 0.035, ccy),
            maturityDate="2030-05-15", behaviouralTag="N/A", rateType="Fixed",
            interestRatePct=round(rng.uniform(7, 10), 2), lcrCashflowRole="Outflow",
            lcrRatePct=0, asfFactorPct=100, irrbbRateSensitive="Yes",
            approxDurationYears=3.4, orgUnitCode=ou_tsy, commonCoaCode="COA-23",
            counterpartyId="CP-BONDHOLDERS", notes="Senior unsecured notes")

    # Non-deposit liabilities. A suspense account is deliberately included:
    # it must not be counted as a customer deposit.
    add(key="int_payable", accountClass="Internal", category="Liability",
        amount=n(assets * 0.012 * j(0.3), ccy), behaviouralTag="N/A",
        lcrCashflowRole="Outflow", lcrRatePct=100, asfFactorPct=0, orgUnitCode=ou_tsy,
        commonCoaCode="COA-24", notes="Accrued interest payable")
    add(key="other_liab", accountClass="Internal", category="Liability",
        amount=n(assets * 0.018 * j(0.3), ccy), behaviouralTag="N/A",
        lcrCashflowRole="Outflow", lcrRatePct=100, asfFactorPct=0, orgUnitCode=ou_tsy,
        commonCoaCode="COA-24", notes="Sundry creditors and accruals")
    add(key="mgr_cheque", accountClass="Suspense", category="Liability",
        amount=n(assets * 0.006 * j(0.4), ccy), behaviouralTag="N/A",
        lcrCashflowRole="Outflow", lcrRatePct=100, asfFactorPct=0, orgUnitCode=ou_rtl,
        commonCoaCode="COA-24",
        notes="Suspense — excluded from customer deposits despite the product name")

    liabilities = sum(r["amount"] for r in rows if r["category"] == "Liability")

    # ── Capital ─────────────────────────────────────────────────────────
    # Share capital is set, then retained earnings closes the balance sheet.
    # That residual is exactly how a trial balance balances.
    equity = assets - liabilities
    share = round(equity * rng.uniform(0.45, 0.62), 2)
    add(key="share_capital", accountClass="Internal", category="Capital", amount=n(share, ccy),
        behaviouralTag="N/A", asfFactorPct=100, orgUnitCode=ou_tsy, commonCoaCode="COA-31",
        notes="Paid-up share capital")

    retained = equity - sum(r["amount"] for r in rows if r["category"] == "Capital")
    add(key="retained", accountClass="Internal", category="Capital", amount=n(retained, ccy),
        behaviouralTag="N/A", asfFactorPct=100, orgUnitCode=ou_tsy, commonCoaCode="COA-32",
        notes="Reserves and retained earnings — closes the balance sheet")

    return rows


def trial_balance(rows, ccy):
    """Roll the position book up to level-2 GL codes, which is the grain a
    core banking system reports a trial balance at."""
    totals = {}
    for r in rows:
        totals[r["glAccountCode"]] = totals.get(r["glAccountCode"], 0) + float(r["amount"])
    return [
        {"glAccountCode": gl, "orgUnitCode": "", "currency": ccy,
         "endingBalance": n(v, ccy), "asOfDate": AS_OF}
        for gl, v in sorted(totals.items())
    ]


def main():
    os.makedirs(OUT, exist_ok=True)
    summary = []

    for aff in AFFILIATES:
        code, name, country, ccy, regulator, region, total, story = aff
        rows = build(aff)

        a = sum(r["amount"] for r in rows if r["category"] == "Asset")
        l = sum(r["amount"] for r in rows if r["category"] == "Liability")
        c = sum(r["amount"] for r in rows if r["category"] == "Capital")
        assert abs(a - l - c) < max(2.0, abs(a) * 1e-9), f"{code} does not balance: {a - l - c}"
        assert len(rows) >= 30, f"{code} has only {len(rows)} records"

        # One folder per affiliate. The filenames keep their country prefix
        # even inside the folder: onboarding is done through a file picker,
        # and thirty-three files all called position_book_2026-07.csv are
        # indistinguishable once they land in a downloads folder.
        adir = os.path.join(OUT, code)
        os.makedirs(adir, exist_ok=True)

        pb = os.path.join(adir, f"{code}_position_book_2026-07.csv")
        with open(pb, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=HEADER)
            w.writeheader()
            w.writerows(rows)

        tb = trial_balance(rows, ccy)
        with open(os.path.join(adir, f"{code}_gl_trial_balance_2026-07.csv"),
                  "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["glAccountCode", "orgUnitCode", "currency",
                                              "endingBalance", "asOfDate"])
            w.writeheader()
            w.writerows(tb)

        npl = sum(r["amount"] for r in rows
                  if r["performingStatus"] in ("Substandard", "Doubtful", "Loss"))
        loans = sum(r["amount"] for r in rows if r["commonCoaCode"] == "COA-14")
        # Mirror what the engine measures: concentration is per *counterparty*,
        # and deposits with no counterparty are unattributed rather than being
        # treated as one enormous depositor. An aggregate retail current-account
        # line is thousands of customers, not a single name.
        deps = [r for r in rows if r["commonCoaCode"] == "COA-22"]
        dep_total = sum(r["amount"] for r in deps)
        by_cp = {}
        for r in deps:
            if r["counterpartyId"]:
                by_cp[r["counterpartyId"]] = by_cp.get(r["counterpartyId"], 0) + r["amount"]
        largest = max(by_cp.values(), default=0)
        unattributed = dep_total - sum(by_cp.values())

        summary.append({
            "code": code, "name": name, "country": country, "ccy": ccy,
            "regulator": regulator, "region": region, "records": len(rows),
            "gl_lines": len(tb), "assets": a,
            "npl": (npl / loans * 100) if loans else 0,
            "conc": (largest / dep_total * 100) if dep_total else 0,
            "unattributed": (unattributed / dep_total * 100) if dep_total else 0,
            "story": story,
        })
        print(f"{code:3} {len(rows):3} rows  {len(tb):3} GL lines  "
              f"assets {a:>14,.0f} {ccy}  NPL {summary[-1]['npl']:5.2f}%  "
              f"top depositor {summary[-1]['conc']:5.2f}%  [{story}]")

    write_broken_files()
    write_manifest(summary)
    return summary


STORY_TEXT = {
    "flagship": "Largest books in the Group. Both have issued term paper, so the ladder has a long-dated liability.",
    "concentration": "One depositor holds a double-digit share of the funding base — a real single-name breach to resolve.",
    "npl": "Impaired lending well above the 5% supervisory ceiling, with provisioning that does not fully cover it.",
    "thin_buffer": "Deposit mix skewed to volatile corporate money, so the LCR buffer is thin under stress.",
    "interbank": "Heavy reliance on interbank takings — the first funding to disappear in a market freeze.",
    "dollarised": "A large share of the book is in foreign currency, so the cross-currency funding mismatch is the risk.",
    "fx_mismatch": "Foreign-currency liabilities fund local-currency lending. Depreciation raises funding cost without raising asset yield.",
    "crisis": "Stressed on every axis at once: high NPL, volatile funding, thin buffer.",
    "small": "Small balance sheet, full structure. Proves the platform does not assume scale.",
    "standard": "A conventional, reasonably balanced book — the control case.",
}


def write_broken_files():
    """Files that fail validation on purpose, for practising the staging gate.

    Each breaks in a different way, so the failure list is a real list rather
    than one repeated message.
    """
    ke = os.path.join(OUT, "KE")
    src = os.path.join(ke, "KE_position_book_2026-07.csv")
    with open(src, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    broken = [dict(r) for r in rows[:34]]
    broken[1]["id"] = broken[0]["id"]                      # duplicate primary key
    broken[2]["hqlaLevel"] = "Level 1"
    broken[2]["lcrCashflowRole"] = "HQLA"
    broken[2]["hqlaHaircutPct"] = ""                       # HQLA with no haircut stated
    broken[3]["maturityDate"] = "2026-01-15"               # matures before the as-of date
    broken[4]["orgUnitCode"] = "OU-KE-NOWHERE"             # not in the dimension
    broken[5]["amount"] = ""                               # no balance
    broken[6]["currency"] = "ZZZ"                          # not a currency
    broken[7]["category"] = "Revenue"                      # not a balance-sheet category
    broken[8]["performingStatus"] = "Probably Fine"        # not a classification
    broken[9]["lienAmount"] = str(float(broken[9]["amount"] or 0) * 3)  # lien exceeds balance

    with open(os.path.join(ke, "KE_validation_failures.csv"), "w", newline="",
              encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        w.writeheader()
        w.writerows(broken)

    # A book that is out by more than tolerance, so GL reconciliation blocks
    # sign-off rather than producing a plug to approve.
    tb_src = os.path.join(ke, "KE_gl_trial_balance_2026-07.csv")
    with open(tb_src, newline="", encoding="utf-8") as f:
        tb = list(csv.DictReader(f))
    tb[0]["endingBalance"] = str(round(float(tb[0]["endingBalance"]) * 1.35, 2))
    with open(os.path.join(ke, "KE_gl_trial_balance_OUT_OF_BALANCE.csv"), "w", newline="",
              encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["glAccountCode", "orgUnitCode", "currency",
                                          "endingBalance", "asOfDate"])
        w.writeheader()
        w.writerows(tb)


def write_manifest(summary):
    L = []
    A = L.append
    A("# Affiliate onboarding datasets")
    A("")
    A(f"Thirty-three African affiliates, {sum(s['records'] for s in summary)} position records, "
      f"as at {AS_OF}. One folder per affiliate, holding a position book and a GL trial balance, "
      "so every affiliate can be taken through the full onboarding path and reconciled.")
    A("")
    A("```")
    A("demo_data/affiliates/")
    A("  MANIFEST.md")
    A("  NG/  NG_position_book_2026-07.csv")
    A("       NG_gl_trial_balance_2026-07.csv")
    A("  KE/  KE_position_book_2026-07.csv")
    A("       KE_gl_trial_balance_2026-07.csv")
    A("       KE_validation_failures.csv               <- fails ten ways on purpose")
    A("       KE_gl_trial_balance_OUT_OF_BALANCE.csv   <- blocks reconciliation")
    A("  ... 31 more")
    A("```")
    A("")
    A("Filenames keep their country prefix even inside the folder. Onboarding runs through a "
      "file picker, and thirty-three files all called `position_book_2026-07.csv` are "
      "indistinguishable once they land in a downloads folder.")
    A("")
    A("## Where the structure comes from")
    A("")
    A("`ecobank_ALM/Ultrapay Post Migration.xlsx`, a real core-banking extract. What it "
      "dictates here:")
    A("")
    A("| From the extract | How it appears in these files |")
    A("|---|---|")
    A("| Three-level GL — category / level1 / level2 | `glAccountCode` is the six-digit level-2 code |")
    A("| Account numbers embed their GL code | `200601` + `00001` -> `20060100001` |")
    A("| `accountoldnumber` survives migration | `legacyAccountNumber` |")
    A("| `accountclass` | Customer / Internal / Suspense / Nostro |")
    A("| `accountlienamount` | `lienAmount` — an amount, because real liens are partial |")
    A("| Monthly credit and debit turnover | `monthlyCredit` / `monthlyDebit`, which drive the activity split |")
    A("| Maker, checker, status on every row | `maker` / `checker` / `recordStatus` |")
    A("")
    A("Category mapping from that file: **10 and 20 are assets, 30 is capital, 40 is "
      "liabilities**. 50 and 60 are income and expense, which a position book does not carry.")
    A("")
    A("Amounts are in **millions of the affiliate's functional currency**, the convention the "
      "Nigeria seed and the original Ghana demo file already use. Every balance sheet balances "
      "exactly, with retained earnings as the residual — which is how a trial balance closes.")
    A("")
    A("## The 33")
    A("")
    A("| Code | Affiliate | Currency | Regulator | Rows | Total assets | NPL | Top depositor |")
    A("|---|---|---|---|---|---|---|---|")
    for s in summary:
        A(f"| `{s['code']}` | {s['name']} | {s['ccy']} | {s['regulator']} | {s['records']} | "
          f"{s['assets']:,.0f} | {s['npl']:.2f}% | {s['conc']:.2f}% |")
    A("")
    A("Ethiopia is absent deliberately: it is a representative office, not a banking "
      "subsidiary, so it has no balance sheet to onboard.")
    A("")
    A("## Why the currency blocks matter")
    A("")
    A("Eight UEMOA affiliates share the XOF and BCEAO; six CEMAC affiliates share the XAF and "
      "BEAC. Nineteen others each run their own currency. That is the case for the Common Chart "
      "of Accounts in one table: consolidation has to reconcile thirty-three local charts onto "
      "one reporting basis, and eight of them are not even distinguishable by currency.")
    A("")
    A("Zimbabwe reports in USD, so it is the affiliate where the reporting currency and the "
      "functional currency coincide — worth having one of those in the set.")
    A("")
    A("## What each one demonstrates")
    A("")
    by_story = {}
    for s in summary:
        by_story.setdefault(s["story"], []).append(s["code"])
    for st, codes in sorted(by_story.items(), key=lambda kv: -len(kv[1])):
        A(f"**{', '.join(codes)}** — {STORY_TEXT[st]}")
        A("")
    A("## Practising the failure path")
    A("")
    A("| File | What it does |")
    A("|---|---|")
    A("| `KE/KE_validation_failures.csv` | Breaks ten different ways: duplicate key, HQLA with no "
      "haircut, maturity before the as-of date, unmapped org unit, missing balance, unknown "
      "currency, invalid category, invalid credit classification, lien exceeding the balance |")
    A("| `KE/KE_gl_trial_balance_OUT_OF_BALANCE.csv` | Out by 35% on one GL line, so "
      "reconciliation blocks sign-off instead of offering a plug to approve |")
    A("")
    A("## Suggested order for a demo")
    A("")
    A("1. **NG** or **CI** — the flagship books, everything populated")
    A("2. **SN**, **GA** or **GH** — a single-name depositor breach to find and explain")
    A("3. **KE** — impaired lending above the ceiling, then the two broken files above")
    A("4. **SS** — stressed on every axis, so the dashboard lights up")
    A("5. **ST** or **CF** — the smallest books, proving nothing assumes scale")
    A("6. Any two UEMOA affiliates — same currency, same regulator, different local GL")
    A("")
    A("_Generated deterministically; re-running the generator reproduces these files byte for "
      "byte, so a diff means a real change._")

    with open(os.path.join(OUT, "MANIFEST.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    s = main()
    print()
    print(f"{len(s)} affiliates, {sum(x['records'] for x in s)} position records total")
    print(f"min records in any file: {min(x['records'] for x in s)}")
    import json
    json.dump(s, open(os.path.join(
        r"C:\Users\AMARAC~1\AppData\Local\Temp\claude\c--Users-AmarachiOrdor-Documents-Consulting-Demo\165aa85e-dc16-4644-8469-e4f8a8675fdf\scratchpad",
        "summary.json"), "w"), indent=1)
