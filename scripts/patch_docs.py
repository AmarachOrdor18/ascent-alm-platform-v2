import io, glob, os

# ── Guide fixes: stale navigation + em dashes ─────────────────────────────
p = 'docs/POST_RUN_AND_RULES_GUIDE.md'
with io.open(p, encoding='utf-8') as f:
    t = f.read()

fixes = [
    ("**FX rates — direct upload.** Go to **Reference Data → FX Rates**, use the bulk-upload control, and",
     "**FX rates — direct upload.** Go to **Group Settings → Reference Data → Currency & FX Rates** (Group & Affiliate Management → the Group row's Settings), use the bulk-upload control, and"),
    ("**Economic indicators — create the series first, then upload.** Go to **Reference Data → Economic Indicators**, click **+ New series**, and create:",
     "**Economic indicators — create the series first, then upload.** Go to **Group Settings → Reference Data → Economic Indicators**, click **+ New series**, and create:"),
    ("**Yield curves — manual entry, no upload path.** Go to **Reference Data → Yield Curves**, pick",
     "**Yield curves — manual entry, no upload path.** Go to **Group Settings → Reference Data → Interest Rates & Curves**, pick"),
    ("**Holiday calendars — manual entry.** Go to **Reference Data → Holiday Calendar**, click **New",
     "**Holiday calendars — manual entry.** Go to **Group Settings → Reference Data → Holiday Calendar**, click **New"),
    ("Go to **Business Rules → Product Characteristics**. Create a rule (or fork the Group default) and",
     "Go to **Group Settings → Business Rules → Product Characteristics** (the Group row's Settings). Create a rule (or fork the Group default) and"),
]
for old, new in fixes:
    assert old in t, old[:60]
    t = t.replace(old, new)
t = t.replace(' — ', ' - ')
with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(t)
print('guide done')

# ── Demo script fixes ─────────────────────────────────────────────────────
p = 'Ascent_ALM_Demo_Script_Mapped_to_Agenda (1).md'
with io.open(p, encoding='utf-8') as f:
    t = f.read()

# 1. Rewrite the Connectors & Data Sources section for the new split
old_start = '### Connectors & Data Sources\n'
i = t.index(old_start)
j = t.index('### Interest rates and curves', i)
new_section = """### Data Sources & Connections (affiliate Settings)

"This is the affiliate's Data Sources page, inside that affiliate's Settings. The principle behind this screen is that everything about an affiliate - including how its data arrives - lives in one place.

The top half is the feed wiring. For each data domain - the position book, the general ledger, market rates, FX rates, the counterparty register and economic indicators - we decide how the data arrives: from a system connection or by file substitution where no connection exists. We also set the freshness SLA for the domain and the business owner who is accountable for it. If a feed goes stale past its SLA, the platform flags it and we know exactly who to chase - the owner, not the platform.

Below the wiring is the Connections list. This is where connections are added, tested, configured or retired - one inventory of the systems that feed this affiliate. View details expands a connection to show its endpoint, authentication basis, refresh cadence and which of this affiliate's domains depend on it, without leaving the page.

At Group level, the same section becomes Connection Health. That view is deliberately monitoring-only: a matrix of every affiliate across every domain, showing what feeds each domain, whether the connection behind it is live, who owns it, and how fresh the data is - with a filter to focus on one affiliate and a single click through to that affiliate's own configuration. The Group sees the health of the estate; each affiliate configures its own feeds.

So the split is: the Group owns the inventory view, each affiliate owns its wiring, and a stale feed is always visible with a name attached to it."

"""
t = t[:i] + new_section + t[j:]

# 2. Reference-data sections now live under Group Settings - add nav pointers
nav_note = '\n\n*(Reached from: Group & Affiliate Management → "Group settings" → Reference Data section.)*\n'
for header in ['### Interest rates and curves\n', '### Currency and Foreign Exchange Rates\n',
               '### Economic Indicators\n', '### Holiday Calendar\n']:
    assert header in t, header
    t = t.replace(header, header.rstrip('\n') + nav_note, 1)

# 3. Business Rules registry is now Rule Coverage on Group Settings
old = '"This is the Business Rules registry. This is where every configurable rule in the platform is registered - the register a model-governance review reads.'
assert old in t
t = t.replace(old, '"This is the Rule Coverage view, inside the Group\'s Settings. This is where every configurable rule in the platform is registered - the register a model-governance review reads. It sits alongside the rule editors themselves, so coverage and editing are one place.')

# 4. Validation Rules intro - reflect the settings placement
old = '"This is the Validation Rules screen. Data-quality checks run as a gate before any calculation, and because these are configuration rather than code, a bank can add its own check without waiting for a release.'
assert old in t
t = t.replace(old, '"This is the Validation Rules screen, reached from the Settings page. Data-quality checks run as a gate before any calculation, and because these are configuration rather than code - the rule set is persisted, versioned like every other rule - a bank can add its own check without waiting for a release.')

# 5. Em dashes throughout
t = t.replace(' — ', ' - ').replace('—', '-')
with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(t)
print('demo script done')
