# CollectFlow Phase 3 — Complete frontend implementation

## Outcome and boundaries
Complete remaining user workflows without redesigning the approved Design B Dashboard, Orders, Invoices, searches, filters or contained drawers. Preserve `/design-comparison` separately. No original-repository changes, production connection, publication, new database/authentication or replacement financial engine.

**Demo Mode — No actual financial records are modified.** Every financial workflow follows **form → validation → review of financial details/intended changes → confirmation/submission → verified predefined result**. Success requires a supported scenario; other valid inputs reach review without fabricated success. Provide **Reset Demo**; keep immutable baseline and in-memory scenarios separate. Supported scenarios cover order creation/editing, conversion, partial/full payments, cash/TDS settlements, cancellation and payment corrections.

## Verified contracts and unresolved behavior
Reviewed original handover/OpenAPI, router implementations and current frontend. FastAPI remains authoritative. Before dependent implementation, approve a discrepancy register covering:

- **Permissions:** documentation/source disagree on sales draft edits and target administration. Source restricts edits/conversion/payments to finance/admin; target GET/POST also allows finance/admin. Users GET is authenticated, not admin-only. Use action-specific permissions, admin-only account administration and conservative access; verify viewer/create discrepancies before widening access.
- **Item editing:** create supports full items, but update accepts descriptions/IDs only—not quantities/prices/tax or item insertion/deletion. Source permits issued description updates despite immutability commentary. Keep issued items locked pending clarification; support safe unbilled description edits. Issued remarks/due date/executive changes exist; commercial identity/amounts remain locked. Update invoice-number/date fields do not implement issuance; use conversion.
- **Corrections:** payment correction is DELETE then POST, not an atomic edit. Demonstrate reversal success/replacement failure honestly. Duplicate detection matches invoice/remittance/cash amount; idempotency is separate, not a five-minute duplicate window.
- **Coverage:** recent-payment GET is capped at 100 without full-ledger pagination. Customer detail provides invoice summaries; invoice detail supplies payment history. Export currently contains one Invoices & Collections worksheet, despite documentation mentioning Payments Ledger. Do not invent endpoints or imply complete history.
- **Fixtures:** customer lifetime amounts/counts exceed supplied history; source customer aggregates and executive “outstanding” include unbilled value. One executive target lacks detail data. Map and label order value versus issued receivables explicitly; no invented historical transactions or silent changes to backend meanings.
- **Missing capabilities:** no persisted financial line-item editing, credit notes/refunds, partial cancellation, account disable/invite/email workflow, FY edit or GST/TDS edit/reactivate endpoints. Preserve these as explicitly unsupported where referenced, not nonfunctional controls.
- **Export/date discrepancies:** source tickets expire after 300 seconds versus 60 in some docs. Backend aging uses its clock; mocks retain **Aging as of 30 Apr 2026**. Record a consistent server reporting-date requirement for later integration.

## Acceptance applying to every stage
- Reuse approved tokens, formatting, selectors, list/card patterns and overlay containment. Add domain-specific forms rather than forcing customers/payments into invoice-shaped components.
- Include loading/empty/error/denied states, field errors, submission/retry states, duplicate-submit protection, unsaved-change confirmation and keyboard focus restoration.
- Verify 1440/768/390/320px and embedded mobile preview in the actual browser: no page overflow, clipped amounts/actions or overlapping text; desktop right-aligned readable amounts; mobile stacked cards/forms and internally scrolling sheets with accessible footer actions.
- Preserve independent global/screen searches, contextual navigation and shared role/FY/demo state. Recheck permission at confirmation, not only button visibility.
- Run stage Vitest/Testing Library tests and the full regression suite at checkpoints; inspect harness-managed build/type results without duplicating manual builds. Browser-check workflows, runtime/network errors and XLSX contents. Report failed, warning and unexecuted checks; mock tests do not verify hosted authentication/security.
- **Approval gate after every stage:** demonstrate its completed workflows and evidence, then stop before the next stage.

## Stage 0 — Contract and demo foundation
**Screens/workflows:** preserve workspace; add scenario selection, Reset Demo and reusable review/confirmation/result sequence. Present contract-gap register and supported scenario catalogue.

**Components:** form sections/errors, searchable reference pickers, review panel, guarded confirmation, submission/result states, typed read/action adapters.

**API dependencies:** map OpenAPI request/response types against source without calling a live service; record mismatches above.

**Mocks:** immutable baseline and independent, complete before/after snapshots with supported-input fingerprints. Verify records, payments, summaries, targets and reporting date agree. Reset restores ₹5,31,000 invoiced, ₹2,00,000 cash, ₹9,000 TDS, ₹2,09,000 settled, ₹3,22,000 receivables and ₹2,95,000 unbilled. Financial outputs are literal verified values, never runtime-calculated outcomes.

**Permissions/validation:** action-specific policy; schemas at form and adapter entry; finite nonnegative money/precision, dates and references; no sensitive logs/storage.

**Tests/desktop/mobile:** snapshot isolation, unsupported-input review/no mutation, reset, duplicate confirmation, cross-route context and existing aging regressions; complete financial review readable on all widths.

**Checkpoint:** approve contracts, scenario catalogue and foundation.

## Stage 1 — Customers and financial references
**Screens/workflows:** `/customers` directory/create/edit/details/history and guarded deletion; `/settings` FY/GST/TDS tabs. List/add/seed/delete unused FY; add/deactivate rates. Customer changes never rewrite issued billing snapshots; distinguish orders, invoices and payments in history.

**Components:** customer form, domain list/cards, history tabs, reference selectors, destructive confirmation.

**API dependencies:** GET/POST customers; GET/PUT/DELETE customer ID; GET/POST financial-years, POST seed, DELETE FY code; GET taxes; POST GST/TDS and DELETE rate ID (deactivation).

**Mocks:** map handover phone/lifetime fields to actual response fields; isolated customer/reference success/failure fixtures, inactive rates and linked-record deletion errors. Label incomplete history, without inventing sales.

**Permissions/validation:** verified roles read; sales creates customers; finance/admin edits/deletes and maintains settings. Validate name duplicates/GST normalization, contact fields, ISO FY dates/start-before-end, reference rates and history guards; flag any extra frontend restrictions.

**Tests/desktop/mobile:** duplicate/retry, immutable billing snapshot, FY deletion, deactivation history, permission matrix and selector updates; desktop history tables/mobile cards link to existing details.

**Checkpoint:** approve customers/references before document workflows.

## Stage 2 — Orders and invoice lifecycle
**Screens/workflows:** extend existing Orders/Invoices with creation, permitted editing, line-item entry, PO conversion and guarded unissued deletion. Include supported recurring/direct invoice creation. Select customer/FY/executive, enter identity/currency/FX/items or manual amounts, review verified totals, confirm and view result. Persisted item financial edits stay unsupported.

**Components:** document form, pre-creation item editor, locked fields, total review, conversion form, contextual actions.

**API dependencies:** GET/POST invoices; GET/PUT/DELETE ID; POST ID/convert-to-invoice; customer/user/FY/tax reads. Separate create/update/conversion payloads.

**Mocks:** verified creation, metadata/description edit, recurring/direct and conversion snapshots; frozen billing identity, known net-30 output and supported FX example. No live tax/FX financial engine.

**Permissions/validation:** sales creates unbilled orders; finance/admin edits/converts/deletes and creates issued documents. Validate unique PO/invoice IDs, FY boundaries, executive references, positive quantity/FX, nonnegative price, allowed currency/tax and legal/deletion locks.

**Tests/desktop/mobile:** create/edit/convert flows, item ownership, duplicates/locks, unsupported inputs review-only, FY/currency handling and cross-screen/aging reconciliation. Item rows become stacked mobile fields; review retains all amounts.

**Checkpoint:** approve document workflows and immutable-field behavior.

## Stage 3 — Payments, settlements and cancellation
**Screens/workflows:** `/payments` ledger/details; shared form from ledger/invoice drawer. Choose issued invoice; enter cash/TDS, section/date/mode/remittance/notes; review/confirm verified partial/full, cash-only, TDS-only and combined settlements. Correction separately reviews reversal/replacement; cancellation reviews reason and requires zero active payments.

**Components:** invoice picker, cash/TDS review, history, correction steps and recoverable submission states.

**API dependencies:** POST payments, DELETE payment ID, GET payments/recent with coverage label, invoice detail, POST invoice ID/cancel. No invented server pagination.

**Mocks:** verified settlement/reversal/replacement snapshots, replacement failure after successful reversal, zero-payment cancellation; existing INV-2026-042 demonstrates blocked cancellation while its payment remains.

**Permissions/validation:** finance/admin mutations; verified roles read. Nonnegative cash/TDS, positive combined settlement, valid date/mode, remittance duplicate/idempotency checks, overpayment/cancelled/paid guards. Authoritative next balances come only from snapshots.

**Tests/desktop/mobile:** cash/TDS/KPI agreement, duplicate and idempotent replay, overpayment, correction recovery, cancellation guard, aging/reset consistency. Mobile review shows invoice, settlement breakdown and previous/next balance with reachable actions.

**Checkpoint:** approve financial outcomes and correction safety.

## Stage 4 — Sales targets and performance
**Screens/workflows:** `/sales-targets`; executive/FY selection, annual/half-year/quarter/month targets, monthly/yearly bottom lines and attainment. Enter overrides or request backend-default periodic values; review verified save and inspect contributing records.

**Components:** target form, executive picker, period controls and attainment/detail views.

**API dependencies:** GET/POST user ID/targets (GET FY query, POST FY payload), GET users and dashboard/summary. No invented monthly-actuals API.

**Mocks:** reconciled target-detail/summary snapshots, missing-history states and verified distribution/attainment; separate unbilled from receivables.

**Permissions/validation:** finance/admin target reads/writes; eligible sales executives, valid FY and nonnegative inputs. Do not independently distribute targets or calculate attainment.

**Tests/desktop/mobile:** overrides/default fixtures, assignment/FY isolation, missing targets, denied roles and drill-down consistency; mobile period sections retain annual and periodic values.

**Checkpoint:** approve permissions and target/performance semantics.

## Stage 5 — Users and account administration
**Screens/workflows:** `/users`, create/name/role changes, password reset and guarded deletion; admin-only management. Review role effects; demonstrate reset acknowledgement without creating credentials. Block self/last-admin/linked-executive deletion.

**Components:** user form, role selector, account drawer and protected-action review.

**API dependencies:** GET/POST users, PUT/DELETE ID, PUT ID/role, POST ID/reset-password. Real session revocation remains backend responsibility.

**Mocks:** disposable users and self/last-admin/history-linked examples; no genuine login or credential-persistence claims.

**Permissions/validation:** admin mutations; username normalization/length/characters, valid roles, password requirements, last-admin/self/history guards. Explain backend role/reset session invalidation without pretending mock role switching is authentication.

**Tests/desktop/mobile:** direct-route and confirmation guards, duplicate users, action matrix and sensitive-data non-retention; account identified clearly in confirmation, passwords omitted from review.

**Checkpoint:** approve account-safety workflows.

## Stage 6 — Reports, exports and final acceptance
**Screens/workflows:** `/reports`, existing financial summaries, FY/ALL filters, linked records and Invoices & Collections workbook preview. Demonstrate ticket/download success, expiry/reuse/errors. Supply real sanitized demo XLSX downloads; production ticket handling stays an adapter contract, not a mock security claim.

**Components:** report filters, preview tables/cards, download status and fixture export adapter.

**API dependencies:** dashboard/summary and invoice reads; POST export/token → GET export/excel with encoded FY/ticket. Preserve single-use/300-second expiry, filename/type and formula-injection defenses. No unauthenticated production links.

**Mocks:** verified FY/ALL workbook matching selected snapshot, existing worksheet schema and safe text; expired/consumed-ticket scenarios. Unsupported report types explicitly deferred.

**Permissions/validation:** verified roles including viewer export; validate/encode filters, protect spreadsheet strings, prevent duplicate downloads and never expose real tokens.

**Tests/desktop/mobile:** inspect workbook rows/types/cash/TDS/settlements and safe strings, expiry/reuse/error states, context/reset consistency; readable mobile previews. Reverify every earlier workflow at all four widths and inside embedded overlays.

**Final checkpoint:** present workflow/permission matrix, reconciliation, test/build/type/browser evidence, unresolved contracts and integration handoff. Stop for frontend approval; integration/publication require separate authorization.

## Technical boundaries
Distinct TanStack content routes with route-specific metadata; retain approved component trees. Extend shared in-memory context with isolated demo snapshots/reset; comparison always reads baseline. Query keys include FY/scenario. Browser-safe typed adapters validate DTOs and supported inputs, returning whole predefined snapshots; future FastAPI calls replace adapters, not forms. React Hook Form/Zod validates form and adapter inputs; safely render text and never log credentials. Future backend independently authenticates, authorizes and validates writes. No server functions, role tables, database or authentication added in this phase.
