# Stage 1 — Customer management and financial references

Status: implemented for review. Stage 2, production integration and deployment remain unauthorized.

## Implemented
- Separate `/customers` and `/settings` content routes, existing Design B shell/tokens and route-specific metadata.
- Customer directory with independent search, state filter, alphabetical sort, pagination and mobile cards.
- Customer create/edit/delete with schema errors, verified-example selection, review, explicit confirmation, submitting/result states, duplicate guards and unsaved-input discard/focus restoration.
- Customer billing/contact details and separate issued invoices, unbilled orders and payments tabs. Only supplied records for selected FY appear. Payment rows open their source invoice drawer; no additional transaction history is fabricated.
- Supplied lifetime fields are clearly separated from available history and never reused as issued-receivable KPIs. Fixture `phone` maps to source `phone_1`; `lifetime_billed` maps to an explicitly labeled supplied aggregate.
- Financial-year list/add/seed/delete. The source's nine literal April–March standard years are seeded without duplicates; years with linked orders/invoices cannot be deleted. New years update shared selectors; reset/scenario switch restores a valid baseline FY.
- GST/TDS list/search/status/add/deactivate. Deactivated rows remain visible only as mock reference history and are excluded from active-reference helpers. Historical invoice tax and payment TDS references never change. No FY edit, rate edit or reactivation controls.
- Existing loading, empty, error/retry and denied preview states apply to both pages.
- In-memory shared master snapshots survive navigation; Reset Demo restores the original masters, documents, totals and 30 April 2026 reporting date. A/B/C always reads unchanged baseline.

## Supported mock scenarios
- Create sanitized `Demo Reference Services Pvt Ltd` (no linked transactions), edit its contact/address, and delete it.
- Update an existing customer's master contact/address while preserving issued billing snapshots.
- Reject Acme/Nexus deletion because supplied invoices/orders are linked.
- Add `FY 2027-28`; delete unused years; reject deletion of `FY 2026-27`; seed exact source standard years.
- Add literal demo GST 3% and TDS 1% references; deactivate existing or added rates without changing historic amounts.
- Duplicate customer/FY errors, invalid-input errors, stale context/permission errors and review-only custom inputs. Custom valid inputs do not yield fabricated save results.

Demo identity/contact values are invented sanitized scenario data, visibly marked as demo; they are not supplied customer history or real business details. No new financial transactions are introduced.

## Permission and validation coverage
Source authority: read-only inspection of original `app/routers/customers.py` and `settings.py`.
- All four roles read customer/reference records. Admin/finance/sales create customers; only admin/finance edit/delete customers or maintain references.
- Forms and adapter boundaries use shared Zod schemas; confirmation rechecks action permissions, references, duplicate consumption and snapshot freshness. Result snapshots supplied by a caller are ignored.
- Billing-name trim/case-insensitive duplicates; uppercase GSTIN structure; optional email/phone/postal/country validation; lengths and control-character restrictions; real ISO calendar dates/start-before-end; finite explicit percentage input, 0–100%, up to three decimal places.
- Percent-to-fraction mapping is API representation only; authoritative invoice totals and settlements are neither recalculated nor changed.
- No server functionality was added, so real server-side validation/authentication/security is untested and remains a mandatory integration dependency.

## Files
Added: `src/data/references.ts`, `src/components/collectflow/reference-workflows.tsx`, `src/routes/customers.tsx`, `src/routes/settings.tsx`, `src/test/references.test.ts`, `src/test/references-ui.test.tsx`, `STAGE_1_REVIEW.md`.

Modified: `src/components/collectflow/session.tsx`, `workspace.tsx`, `src/data/demo-policy.ts`, `demo-contracts.ts`, `records.ts`, `src/styles.css`, `src/test/app-routing.test.tsx`, `AGENTS.md`, `roadmap.md` and authorization memory.

Unchanged: approved plan, baseline JSON, financial/aging authority, comparison tree, original FastAPI repository. Generated route tree is maintained automatically, not authored.

## Validation
- Full Vitest regression suite: **87 tests passed across 10 files**; covers all prior Stage 0 and financial tests plus Stage 1 schemas, mappings, isolation, roles, guards, workflows and routes. No test failures remain.
- Harness-managed build/type checks: latest observed `build OK`; standalone build/typecheck commands intentionally not duplicated.
- Actual Playwright workflows at 1440/768/390/320: customer creation, review/confirmation/result, linked deletion rejection, reference mutation, cross-route persistence, reset and no page overflow. Desktop/tablet tables and mobile forms/cards visually inspected.
- Embedded phone: form contained within frame, internally scrollable, confirmation controls reachable; comparison route loads separately.
- Additional browser checks: role matrix, directory filtering/pagination, GST errors, linked master edit versus preserved invoice identity, incomplete payment history, duplicates, review-only inputs, unsaved discard, preview error/empty/loading/denied states, FY seed and TDS add.
- Browser runtime errors: none; responsive workflow run recorded no `/api/` requests.
- Initial JSX/type defects were corrected; a case-sensitive error assertion and hidden desktop/mobile selector assumptions were corrected. Browser assertions were adjusted to wait for role-render completion. Latest runs supersede the initial failures.

## Remaining limitations and tracked discrepancies
- Existing Recharts zero-size warning in layout-free unit tests remains tracked; no corresponding browser runtime error observed.
- Source/doc disagreement on finance settings/customer deletion: implemented source permissions, not admin-only documentation.
- Source lacks GSTIN/contact length validation; frontend/adapter restrictions are explicitly stronger and do not prove server security.
- Source tax GET exposes active rates only; inactive demo history is not a fabricated endpoint.
- Source normalizes rates only when >1, making 1 ambiguous; UI labels percent and sends fractions. Upper bound/precision are frontend restrictions.
- Source FY deletion does not distinguish nonexistent FY; demo rejects absent references rather than claiming successful deletion.
- Supplied customer lifetime aggregates exceed available history. No full ledger, missing records or replacement aggregate calculations are added.
- New reference selectors are exposed through shared provider/active helpers; document creation and payment registration remain gated to their own stages.
- No confirmed Stage 1 defect remains; server integration and production security checks were not performed by design.

Approval requested for Stage 1 only. Do not proceed to Stage 2 automatically.