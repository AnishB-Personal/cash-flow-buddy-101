# CollectFlow Phase 3 — Complete frontend workflows

## Scope and boundaries
Complete remaining workflows using approved Design B—not a redesign. Preserve Dashboard, Orders, Invoices, searches, filters, contained drawers and `/design-comparison`. No original-repository changes, production connection, publication, new database/authentication or replacement financial engine.

**Demo Mode — No actual financial records are modified.** Financial actions follow **form → validation → financial review/intended changes → confirmation/submission → verified predefined result**. Supported scenarios: order creation/editing, conversion, partial/full payments, cash/TDS settlements, cancellation and corrections. Unsupported inputs reach review but never fabricated success. **Reset Demo** restores the immutable approved baseline; scenarios remain isolated in memory.

## Verified references and gaps to resolve
Reviewed original handover/OpenAPI, relevant router implementations and current frontend. FastAPI stays authoritative. Stage 0 presents a discrepancy register before dependent work:

- **Permissions:** docs/source disagree on sales draft edits and targets. Source restricts edits/conversion/payments to finance/admin; target GET/POST also permits finance/admin. Users GET is authenticated, not admin-only. Use action-specific, conservative permissions; account administration remains admin-only. Verify viewer/create discrepancies before widening access.
- **Item edits:** creation supports full items; update supports descriptions/IDs only, not quantity/price/tax or insertion/deletion. Issued description updates conflict with immutability commentary: keep issued items locked pending clarification. Source permits issued remarks/due-date/executive edits, not commercial identity/amounts. Conversion—not update invoice-number/date fields—implements issuance.
- **Corrections:** DELETE payment then POST replacement, not atomic edit. Show reversal success/replacement failure honestly. Duplicate matching is invoice/remittance/cash amount; idempotency is separate, not a five-minute duplicate window.
- **Coverage:** recent-payment API caps at 100 with no full-ledger pagination. Customer detail gives invoice summaries; invoice detail gives payment history. Export has one Invoices & Collections worksheet despite Payments Ledger references. Do not invent endpoints or claim complete history.
- **Fixtures:** customer lifetime/count totals exceed supplied history; source customer aggregates and executive “outstanding” include unbilled value. One executive target lacks detail data. Map explicitly, distinguish order value from issued receivables, and label incomplete history without inventing transactions.
- **Unsupported:** persisted financial item edits, credit notes/refunds, partial cancellation, disable/invite/email account flows, FY edits and rate edit/reactivation. Identify limitations rather than add dead controls.
- **Dates/export:** source ticket TTL is 300 seconds versus 60 in some docs. Mocks retain **Aging as of 30 Apr 2026**; backend aging uses its clock. Record a consistent server reporting-date requirement for later integration.

## Rules for every stage
Reuse existing tokens, formatting, controls, list/card patterns and overlay containment; add domain-specific forms. Include loading/empty/error/denied states, inline validation, retry, duplicate-submit protection, unsaved-change confirmation and focus restoration. Keep global/screen searches independent and role/FY/scenario context across navigation; recheck permission on confirmation.

**Desktop/mobile acceptance:** actual-browser checks at 1440/768/390/320px and embedded mobile preview; no page overflow, clipped amounts/actions or overlap. Readable desktop right-aligned numeric columns; stacked mobile cards/forms; internally scrolling sheets and reachable footer actions.

**Validation/reporting:** stage Vitest/Testing Library tests plus full regressions at checkpoints; inspect harness-managed build/type results without duplicating manual builds. Browser-check workflows/runtime/network and inspect demo XLSX contents. Report failures, warnings and unexecuted checks; mock tests do not establish hosted authentication/security.

**Approval checkpoint after each stage:** demonstrate complete allowed workflows, denied actions and evidence; stop before the next stage.

## Stage 0 — Contracts and demo foundation
- **Screens/workflows:** preserve workspace; add scenario selection/Reset Demo and common review-confirm-result sequence; approve contract register and supported scenarios.
- **Components:** form sections/errors, searchable reference pickers, review/confirmation and submission/result states, read/action adapters.
- **API dependencies:** typed OpenAPI/source mapping only; no live requests.
- **Mocks:** complete verified before/after snapshots and supported-input fingerprints. Baseline reset: ₹5,31,000 invoiced, ₹2,00,000 cash, ₹9,000 TDS, ₹2,09,000 settled, ₹3,22,000 receivables, ₹2,95,000 unbilled. Records/payments/summaries/targets/date must reconcile; financial outputs are literal snapshots, not runtime calculations.
- **Permissions/validation:** action-specific policy; schemas at forms and adapter entry, money precision/finite values, dates/references; no sensitive logs/storage.
- **Tests/acceptance:** isolation/reset, unsupported review/no mutation, duplicate confirmation, cross-route context and existing aging regressions; full review readable on every width.
- **Checkpoint:** approve contracts, catalogue and foundation.

## Stage 1 — Customers and financial references
- **Screens/workflows:** `/customers` directory/create/edit/details/history/guarded deletion; `/settings` FY/GST/TDS tabs. Add/list/seed/delete unused FY; add/deactivate rates. Separate orders/invoices/payments history; never rewrite issued billing snapshots.
- **Components:** customer form, domain lists/cards, history tabs, reference selectors, destructive confirmation.
- **API dependencies:** GET/POST customers; GET/PUT/DELETE customer ID; GET/POST financial-years, POST seed, DELETE FY; GET taxes, POST GST/TDS, DELETE rate ID (deactivation).
- **Mocks:** map handover phone/lifetime fields to real responses; isolated success/errors, inactive rates and linked-record deletion failures; incomplete history explicitly labeled.
- **Permissions/validation:** verified roles read; sales creates customers; finance/admin edits/deletes/maintains settings. Name duplicates/GST normalization/contact fields, ISO dates/start-before-end, rate representation and history guards; flag extra frontend restrictions.
- **Tests/acceptance:** duplicates/retry, immutable billing snapshots, FY deletion, rate history, permission/selector updates; desktop tables/mobile cards link to existing details.
- **Checkpoint:** approve customers/references.

## Stage 2 — Orders and invoice lifecycle
- **Screens/workflows:** extend approved lists/drawers with create, allowed edit, pre-creation items, PO conversion and guarded unissued deletion; supported recurring/direct creation. Customer/FY/executive, identity/currency/FX/items or manual amounts → verified review → result. Persisted financial item edits remain unsupported.
- **Components:** document/item forms, locked fields, total review, conversion form/contextual actions.
- **API dependencies:** GET/POST invoices, GET/PUT/DELETE ID, POST ID/convert-to-invoice; customer/user/FY/tax reads; distinct create/update/conversion payloads.
- **Mocks:** verified creation/metadata/description edit/recurring/conversion snapshots; frozen billing identity, net-30 output and FX example; no live tax/FX engine.
- **Permissions/validation:** sales creates unbilled orders; finance/admin edits/converts/deletes and creates issued documents. Unique PO/invoice IDs, FY boundaries, executive references, positive quantity/FX, nonnegative price, allowed currency/tax and legal locks.
- **Tests/acceptance:** lifecycle/item ownership/duplicates/locks, unsupported review-only inputs, FY/currency and aging reconciliation; desktop item rows/mobile stacked fields retain full review amounts.
- **Checkpoint:** approve document workflows and locks.

## Stage 3 — Payments, settlements and cancellation
- **Screens/workflows:** `/payments` ledger/details; shared form from ledger/invoice drawer. Cash/TDS/section/date/mode/remittance/notes → review → partial/full/cash-only/TDS-only/combined result. Correction reviews reversal/replacement separately; cancellation reviews reason and requires zero payments.
- **Components:** invoice picker, cash/TDS review, history, correction steps and retry/results.
- **API dependencies:** POST payments, DELETE payment ID, GET payments/recent with coverage label, invoice detail, POST invoice ID/cancel; no invented pagination.
- **Mocks:** verified settlements/reversal/replacement, failure after reversal, zero-payment cancellation. Existing INV-2026-042 must show blocked cancellation while its payment remains.
- **Permissions/validation:** finance/admin mutations; verified roles read. Nonnegative cash/TDS, positive settlement, date/mode, remittance/idempotency, overpayment/cancelled/paid guards; next balances only from snapshots.
- **Tests/acceptance:** KPI/cash/TDS agreement, duplicate/idempotent replay, overpayment, correction recovery, cancellation/aging/reset; mobile review retains invoice, settlement and prior/next balance.
- **Checkpoint:** approve outcomes and correction safety.

## Stage 4 — Sales targets and performance
- **Screens/workflows:** `/sales-targets`, executive/FY selection, annual/half-year/quarter/month targets, monthly/yearly bottom lines and attainment. Overrides/backend-default periods → verified review/save → contributing records.
- **Components:** target form, executive selector, period controls, attainment/details.
- **API dependencies:** GET/POST user ID/targets (GET FY query, POST FY payload), GET users/dashboard summary; no invented monthly-actuals API.
- **Mocks:** reconciled target/summary snapshots, missing-history states and verified distribution/attainment; separate unbilled/receivables.
- **Permissions/validation:** finance/admin target reads/writes; eligible executive/FY and nonnegative inputs; no independent distribution/attainment engine.
- **Tests/acceptance:** overrides/default fixtures, FY/assignment isolation, missing targets, denied roles/drill-downs; mobile sections retain annual/periodic values.
- **Checkpoint:** approve target permissions/semantics.

## Stage 5 — Users and account administration
- **Screens/workflows:** `/users`, create/name/role/reset-password/guarded delete; admin-only management. Review role effects; demo reset acknowledgement without real credentials. Block self/last-admin/historically linked deletion.
- **Components:** user form, role selector, account drawer/protected review.
- **API dependencies:** GET/POST users, PUT/DELETE ID, PUT ID/role, POST ID/reset-password; real session revocation stays backend responsibility.
- **Mocks:** disposable users and guarded examples; no credential persistence/genuine login claims.
- **Permissions/validation:** admin mutations, username normalization/length/characters, valid roles/password requirements and deletion guards; explain backend role/reset session invalidation without presenting mock switching as authentication.
- **Tests/acceptance:** direct-route/confirmation guards, duplicate/action matrix, sensitive-data non-retention; mobile confirms account/action, never passwords in review.
- **Checkpoint:** approve account safety.

## Stage 6 — Reports, exports and final acceptance
- **Screens/workflows:** `/reports`, financial summaries, FY/ALL filters, linked records and workbook preview. Demonstrate ticket/download/expiry/reuse/errors; real sanitized demo XLSX downloads, not a production-security claim.
- **Components:** report filters, preview tables/cards, download status/fixture adapter.
- **API dependencies:** dashboard/invoice reads; POST export/token → GET export/excel with encoded FY/ticket; preserve single-use/300s, filename/type and formula-injection defenses. No unauthenticated production links.
- **Mocks:** verified FY/ALL workbook matching selected snapshot/current worksheet schema, safe text and expired/consumed-ticket cases; unsupported report types deferred.
- **Permissions/validation:** verified roles including viewer export; validated/encoded filters, safe spreadsheet strings, duplicate-download protection; no real tokens.
- **Tests/acceptance:** inspect workbook rows/types/settlements/safe strings; expiry/reuse/errors/context/reset; readable mobile preview; reverify all workflows at every width/embedded overlay.
- **Final checkpoint:** workflow/permission matrix, reconciliation, test/build/type/browser evidence, unresolved contracts and integration handoff. Stop for final frontend approval; integration/publication require separate authorization.

## Technical boundaries
Distinct TanStack content routes with specific metadata; retain approved component trees. Extend shared in-memory context with isolated snapshots/reset; comparison always uses baseline. Query keys include FY/scenario. Browser-safe typed adapters validate inputs/DTOs and return whole verified snapshots; later FastAPI calls replace adapters, not forms. React Hook Form/Zod validates forms and adapter entry; safe text rendering/no credential logs. Future backend independently validates/authenticates/authorizes all writes. No server functions, role tables, database or authentication in this phase.
