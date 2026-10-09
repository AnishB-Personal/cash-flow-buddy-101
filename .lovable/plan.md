# CollectFlow Phase 3 — Complete frontend workflows

## Goal and non-negotiables
Complete the remaining frontend using the approved Design B shell, typography, tokens, tables/cards and contained drawers—not a redesign. Preserve Dashboard, Orders, Invoices, search/filtering and six-bucket aging behavior; keep `/design-comparison` separate. Use sanitized data only. No production connection, publication, original-repository changes, new database/authentication or replacement financial engine.

**Demo Mode — No actual financial records are modified.** Financial workflows follow **form → validation → review of financial details/intended changes → confirmation/submission → predefined verified result**. Success is available only for supported scenarios; other valid inputs can reach review but never produce fabricated transactions. Provide **Reset Demo** to restore the approved dataset and totals. Keep baseline and scenario data isolated; use in-memory state only.

## Verified references and contract gaps
Reviewed the original handover/OpenAPI and current `app/routers/{customers,invoices,payments,users,settings,export}.py`, plus the existing frontend and tests. Source behavior informs adapters; FastAPI remains authoritative. These issues must be documented before dependent work:

1. **Permissions conflict:** handover permits sales draft edits/admin-only targets; source restricts invoice updates to finance/admin and permits finance/admin target reads/writes. User-directory GET is authenticated rather than admin-only. Use action-specific, conservative UI permissions; keep administration admin-only, sales creation/read but no edits, target management finance/admin. Verify viewer/create permission discrepancies before widening any access; do not infer authority from an endpoint merely accepting authentication.
2. **Line-item editing is limited:** create accepts quantity/price/tax/items, but update accepts descriptions and item IDs only. No quantity/price/tax editing or adding/removing persisted items. Source updates descriptions even on issued records despite an immutability comment. Support documented-safe unbilled description edits; keep issued item/financial edits locked pending clarification. Issued remarks/due date/executive edits are implemented; commercial identity and amounts remain locked. `invoice_number`/`invoice_date` appear in update schema but are not used for issuance: conversion is the dedicated workflow.
3. **Payment correction is delete/re-record**, not PUT/edit or credit-note adjustment. Two independent requests are not atomic; represent reversal success followed by replacement failure honestly. Source duplicate matching is invoice + remittance + cash amount, not a five-minute window. Idempotent replay is separately supported.
4. **History/report limits:** recent payments GET is capped at 100 and has no full-ledger pagination/filter API. Customer detail returns invoice summaries; invoice detail supplies payment history. Secure export currently produces one **Invoices & Collections** worksheet, not a separate Payments Ledger report despite handover wording. Do not invent endpoints or claim complete historical coverage.
5. **Fixture mismatches:** customer lifetime totals/counts exceed the supplied two-record history; customer source aggregates include unbilled amounts. Executive “outstanding” also includes unbilled value, and one executive target lacks a target-detail fixture. Map fields explicitly, label order value versus issued receivables, and show unavailable history rather than inventing historical transactions. Do not silently change backend meanings to make mocks match.
6. **Settings/account limits:** FY supports list/create/seed/delete, GST/TDS list/create/deactivate, not general edit/reactivate. Account administration supports create/name/role/delete/reset-password, not disable/invite/email delivery. Do not add unsupported operations.
7. **Exports/date contract:** ticket source expiry is 300 seconds versus 60 in some docs. Backend aging uses its clock, while mocks use **30 Apr 2026**. Preserve explicit mock reporting labels and record future integration requirements for a consistent server reporting date; do not change backend now.

Unresolved capabilities stay review-only or clearly unavailable. Stage 0 presents the discrepancy register and safe scope for approval; no blocker justifies replacing backend behavior.

## Shared delivery and acceptance rules
Each stage includes loading/empty/error/permission states, inline validation, recoverable submission errors, duplicate-submit protection, keyboard focus restoration, unsaved-change confirmation and contextual success navigation. Reuse selectors, controls, formatting, list/card patterns and overlay containment; extend with domain-specific forms rather than forcing customer/payment data into invoice-shaped components.

**Every stage checkpoint:** demonstrate complete allowed workflows and denied actions at 1440/768/390/320px plus the embedded mobile preview. No page overflow, clipped amounts/actions or overlapping text. Desktop: readable right-aligned financial columns, sorting/search/filters/pagination where supported. Mobile: stacked cards/forms, scrollable contained sheets, visible footer actions, accessible labels and touch targets. Global search and screen search remain independent; role, FY and active demo context survive navigation. Approve each stage before starting the next.

**Verification:** run relevant Vitest/Testing Library tests, then full regression suite at checkpoints; inspect harness-managed build/type results (do not duplicate manual builds/typechecks). Use real browser workflow checks, screenshots and runtime/network evidence; inspect downloaded mock XLSX contents. Report failures, warnings and unexecuted checks explicitly. No hosted-auth/security verification is claimed from mock UI tests.

## Stage 0 — Contract and demo foundation
- **Screens/workflows:** retain approved workspace; add unobtrusive demo scenario selection/reset and review/confirmation/result states. Establish action permissions and integration readiness register.
- **Reusable components:** form sections, field errors, searchable document/customer/executive selectors, confirmation/review panel, pending/result states; separate read/query and action adapters.
- **API dependencies:** typed request/response mapping against handover OpenAPI and source; no requests to a live service. Record every source/document mismatch above.
- **Mock requirements:** immutable baseline; independently verified before/after scenario snapshots and supported input fingerprints. Scenario records, payments, KPIs, customers, targets and reporting date must agree across screens. Initial approval totals remain ₹5,31,000 invoiced, ₹2,00,000 cash, ₹9,000 TDS, ₹2,09,000 settled, ₹3,22,000 receivables and ₹2,95,000 unbilled.
- **Permissions/validation:** action-specific checks rather than general `canWrite`; validate schemas at forms and adapter entry, permissions again on confirmation, finite amounts/paise precision, dates and references. No secrets/passwords in logs or stored demo data.
- **Tests/acceptance:** isolation, atomic snapshot switching, unsupported-input review without mutation, duplicate submission, reset, cross-route role/FY state and all existing aging/date regressions. Desktop/mobile review details must show every intended change before confirmation.
- **Checkpoint:** approve contract register, scenario catalogue and foundation before module work.

## Stage 1 — Customers and financial references
- **Modules/screens:** Customers directory/details/history/create/edit; Settings tabs for FY, GST and TDS. Separate content routes `/customers`, `/settings` and navigable details as appropriate.
- **Workflows:** search/select customer; inspect separately labeled orders, issued invoices and payments; create/edit contact and billing fields; guarded customer deletion. List/add FY, seed standard years, delete unused FY; add GST/TDS and deactivate rates. Show historical billing snapshots unchanged after customer/rate changes.
- **Reusable components:** customer form, reference pickers, domain list/cards, history tabs and guarded destructive confirmation.
- **API dependencies:** GET/POST `/api/customers`, GET/PUT/DELETE `/api/customers/{id}`; GET/POST `/api/settings/financial-years`, POST `…/seed`, DELETE `…/{code}`; GET `/api/settings/taxes`, POST/DELETE `…/taxes/gst` and `…/taxes/tds/{id}`.
- **Mock requirements:** map `phone`/`lifetime_billed` to actual `phone_1`/aggregate fields; retain baseline untouched. Add isolated customer/reference success/error fixtures, inactive-rate states and linked-record deletion failures; no invented historical sales.
- **Permissions/validation:** all verified roles read; sales creates customers; finance/admin edits/deletes customers and maintains references. Validate unique names/GST normalization, contact/address fields, ISO FY dates/start-before-end, rate representation and linked-history guards. Do not invent stricter business rules without flagging them.
- **Tests/acceptance:** customer duplicate/error handling, snapshot immutability, FY deletion guard, deactivation history, permission matrix and selector refresh. Desktop history tables/mobile cards link back to approved details without losing context.
- **Checkpoint:** approve directory/reference workflows before financial document creation.

## Stage 2 — Orders and invoice lifecycle
- **Modules/screens:** extend existing Orders/Invoices with create, edit, line-item entry and conversion; preserve listings/drawers. Include recurring/direct invoice creation where contracts permit, and guarded deletion of unissued orders.
- **Workflows:** select customer/FY/executive; enter PO/document identity, currency/exchange rate, items or supported manual amounts; review verified totals; submit supported creation scenario. Edit permitted metadata/descriptions; convert PO with invoice number/date/due date and frozen billing snapshot; view result in Orders/Invoices/aging. Financial edit controls for persisted items remain unavailable.
- **Reusable components:** document form, line-item editor, locked-field presentation, scenario-total review, conversion form and contextual drawer actions.
- **API dependencies:** GET/POST `/api/invoices`, GET/PUT/DELETE by ID, POST `/{id}/convert-to-invoice`; customer/user/FY/tax reads. Use distinct create/update/conversion payloads.
- **Mock requirements:** verified creation, metadata/description edit, recurring/direct and conversion snapshots; customer refresh/issuance snapshot, known net-30 output, supported multi-currency example. Amounts/tax/FX outcomes are supplied, not calculated live.
- **Permissions/validation:** sales creates unbilled orders; finance/admin edits/converts/deletes and creates issued documents. Validate unique PO/invoice IDs, FY date boundaries, sales executive references, positive quantities/FX, nonnegative prices, allowed currency/tax; honor legal locks and deletion guards.
- **Tests/acceptance:** create/edit/convert end-to-end, field locks, incorrect item ownership, duplicate IDs, unsupported amount inputs review-only, FY/currency handling, unbilled exclusion and cross-screen reconciliation. Desktop item rows/mobile stacked items remain fully editable before creation; reviews never clip totals.
- **Checkpoint:** approve complete document workflows and financial locks.

## Stage 3 — Payments, settlements and cancellation
- **Modules/screens:** `/payments` ledger/details/history; shared payment form from ledger and invoice drawer; correction sequence and invoice cancellation.
- **Workflows:** choose issued invoice, enter cash/TDS, section/date/mode/remittance/notes; review then submit verified partial/full, cash-only, TDS-only and combined scenarios. Show result/history and consistent balances. Correction reviews reversal and replacement separately; cancellation requires no active payments and reason confirmation.
- **Reusable components:** invoice picker, cash/TDS review, payment history, correction steps, cancellation confirmation and retry/result states.
- **API dependencies:** POST `/api/payments`, DELETE `/api/payments/{id}`, GET `/api/payments/recent?limit=…`, invoice detail, POST `/api/invoices/{id}/cancel`. Do not imply server pagination beyond recent-history coverage.
- **Mock requirements:** verified partial/full settlement, reversal intermediate state, successful replacement and replacement-failure state, zero-payment cancellation. INV-2026-042 with its existing payment must demonstrate blocked cancellation, not pretend eligibility.
- **Permissions/validation:** finance/admin records/reverses/cancels; verified roles read history. Nonnegative cash/TDS, positive combined settlement, valid date/mode, duplicate remittance and idempotency rules, cancelled/paid guards and overpayment rejection. Review settlement amount without constructing new authoritative balances; scenario outcomes provide them.
- **Tests/acceptance:** cash/TDS breakdown and KPI reconciliation, idempotent replay, overpayment/duplicate failures, reversal/replacement recovery, cancellation guard, aging membership and reset. Mobile review must retain invoice, payment components, prior/next balance and accessible confirmation actions.
- **Checkpoint:** approve financial scenario results and correction safety.

## Stage 4 — Sales targets and performance
- **Modules/screens:** `/sales-targets`, executive/FY selection, annual/half-year/quarter/month targets, monthly/yearly bottom-line fields and attainment view.
- **Workflows:** assign eligible sales executive, inspect existing targets, enter overrides or request backend-default periodic values, review and demonstrate verified save; inspect performance and contributing records.
- **Reusable components:** executive selector, target form, period controls, attainment display and linked record listing.
- **API dependencies:** GET/POST `/api/users/{id}/targets?fy=…` (FY in POST payload); GET `/api/users`, GET `/api/dashboard/summary` for performance. No invented monthly actuals API.
- **Mock requirements:** reconcile target-detail versus executive summary coverage in isolated snapshots; explicit unavailable target/history states. Preverified distribution and attainment values; split unbilled order value from issued receivables.
- **Permissions/validation:** target reads/writes finance/admin per source; no sales/viewer editor. Validate FY/executive references and nonnegative target inputs; never calculate backend-default targets or attainment independently.
- **Tests/acceptance:** explicit overrides/default-output fixtures, FY/assignment isolation, missing targets, denied roles and performance drill-down consistency. Desktop comparison/mobile period sections retain annual and periodic values.
- **Checkpoint:** approve target permissions and performance semantics.

## Stage 5 — Users and account administration
- **Modules/screens:** `/users`, create/profile/role update, password reset and guarded deletion; admin-only navigation/actions.
- **Workflows:** create sanitized demo user; edit name/role; review role effects; simulate reset acknowledgement without creating actual credentials; blocked self/last-admin/historically linked deletion and permitted demo deletion.
- **Reusable components:** user form, role selector, protected-action review and account detail drawer.
- **API dependencies:** GET/POST `/api/users`, PUT/DELETE `/{id}`, PUT `/{id}/role`, POST `/{id}/reset-password`. Authentication/session revocation stays future backend responsibility.
- **Mock requirements:** disposable user fixtures plus self/last-admin/linked-executive examples; no credential persistence or genuine login claims.
- **Permissions/validation:** admin only mutations; username normalization/length/character rules, valid roles, password requirements, self/last-admin safeguards and historical linkage. Explain actual backend session invalidation after role/reset changes; do not simulate a secure authenticated system.
- **Tests/acceptance:** guards through direct navigation and confirmation, role action matrix, duplicate user errors and sensitive-data non-retention. Mobile confirmation fully identifies account/action without exposing password in review.
- **Checkpoint:** approve account-safety demonstrations.

## Stage 6 — Reports, exports and full acceptance
- **Modules/screens:** `/reports`, existing financial summaries, Invoices & Collections export preview; payment history coverage explicitly labeled.
- **Workflows:** select FY/all years; inspect report data and linked documents; demonstrate request-ticket/download success plus expiry/reuse/errors. Provide a real downloadable sanitized fixture XLSX labeled demo; production ticket exchange remains an adapter placeholder, not a security claim.
- **Reusable components:** report filters, preview table/cards, export status and downloadable fixture adapter.
- **API dependencies:** GET `/api/dashboard/summary`, invoice reads, POST `/api/export/token` → GET `/api/export/excel?fy=…&ticket=…`. Preserve single-use/300-second contract, filename/content type and server formula-injection defenses. No unauthenticated static production URL.
- **Mock requirements:** preverified FY/ALL XLSX matching the selected scenario and existing worksheet contract; expired/consumed-ticket simulations. Unsupported report types are explicitly deferred, not dead controls.
- **Permissions/validation:** verified roles including viewer may export; validate/encode filters and IDs, prevent duplicate download attempts and unsafe spreadsheet strings; never expose real tokens.
- **Tests/acceptance:** inspect workbook rows/types/cash/TDS/settled values and safe text, expiry/reuse/error handling, report/context/reset consistency. Mobile readable preview/download states; all earlier workflows verified across all four widths and embedded overlays.
- **Final checkpoint:** present completed workflow/permission matrix, tests and build/type/browser evidence, scenario reconciliation, unresolved contracts and integration handoff. Stop for final frontend approval; backend integration/publication need separate authorization.

## Technical implementation boundaries
Use distinct TanStack content routes and route-specific metadata; reuse the current shell/provider without replacing approved component trees. Extend the provider with a separate demo snapshot/context and reset; archived comparisons always use baseline. Query keys include FY/scenario where applicable; route loading uses TanStack Query patterns. Typed browser-safe adapters return validated DTOs; mock handlers match supported inputs and return complete literal verified snapshots. Later FastAPI calls replace adapters, not forms. React Hook Form/Zod validate both form and adapter inputs; render strings safely and never log credentials. Future backend must independently validate/authenticate/authorize all writes. No new server functions, database, role tables or authentication in this frontend phase.
