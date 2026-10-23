# 12 — Agricultural finance extension

The approved integration adds an owner-operated farm record book beside the
existing document-derived ledger. See `../AGRICULTURE.md` for the model,
arithmetic, permissions, migration, demo and acceptance procedures.

The existing invariants continue to govern `transaction`, extraction provenance,
indicators and readiness. Manual farm declarations are stored in `farm_entry`,
never fabricated as document-backed transactions or readiness inputs. A record
summary may show declared and extracted activity together only with separately
identified source subtotals and explicit limitations. It is not a `DERIVED`
document-ledger indicator. Attachments never promote a manual amount into an
extracted or independently verified fact.

Authorization comes from explicit `business_access` rows. Enterprise/cycle
references must belong to the selected business. Reviewers need an assigned
business grant; farm mutations require owner/platform-admin authority. Selected
business pointers and JWT context are navigation state, not ownership proof.

Shared overhead remains visibly unallocated and is counted once in business
totals. Source allocations reference immutable original amounts. Matching a
manual entry replaces its declared amount with a unique source reference and
retains the manual values in the audit history.

P0 pages are `/farm`, `/farm/enterprises`, `/farm/transactions`, `/farm/insights`
and `/farm/report`, all under the existing authenticated shell. The financial
report uses a single computed response containing its rows, source subtotals,
reporting period, warnings, generated timestamp and record-version fingerprint.
Insights are labeled rules-based. Demo fixtures are explicitly enabled only in
development/test and isolated by owner and business.
