# CollectFlow — Stage 0 review

## Implemented
- Browser-safe request types mapped from the approved OpenAPI and read-only source checks, plus an accessible contracts/gaps/scenario register.
- Explicit Demo Mode, shared in-memory role/FY/scenario context, independent whole snapshots, immutable baseline and Reset Demo.
- Reusable form sections/errors, searchable document reference picker, financial review, explicit confirmation, submission/result and unsaved-input protection with focus restoration.
- Verified order/invoice remarks rehearsals, active-payment cancellation rejection and unsupported-input review-only scenarios. These are foundation rehearsals, not Stage 2/3 production workflows.
- Zod validation at form/adapter boundaries, snapshot DTO validation, finite two-decimal money checks, valid references/calendar dates, action-specific permissions rechecked on confirmation, duplicate protection and context guards.
- Existing financial lists, dashboard and contextual drawer can consume the selected isolated snapshot. Existing backend-dependent actions remain unavailable; comparison continues reading baseline fixtures.

## Financial preservation
Reporting date: **30 April 2026**. Invoiced ₹5,31,000; cash ₹2,00,000; TDS ₹9,000; settled ₹2,09,000; receivables ₹3,22,000; unbilled ₹2,95,000. Payments, targets, aging and original records remain unchanged. Only predefined demo remarks change. Unbilled amounts are explicitly not receivables.

## Files added
- `src/data/api-contracts.ts`
- `src/data/demo-contracts.ts`
- `src/data/demo-policy.ts`
- `src/data/demo.ts`
- `src/components/collectflow/demo-controls.tsx` — DemoControls, ReferencePicker, FormSection, FieldError, FinancialReview, demo sequence and contract register
- `src/test/demo.test.ts`
- `src/test/demo-ui.test.tsx`
- `STAGE_0_REVIEW.md`

## Files modified
- `src/components/collectflow/session.tsx` — shared snapshot/reset/confirmation state
- `src/components/collectflow/workspace.tsx` — demo controls and selected snapshot consumption
- `src/components/collectflow/dashboard.tsx` — optional snapshot records
- `src/components/collectflow/record-list.tsx` — optional snapshot records
- `src/data/records.ts` — explicit record-source parameter; baseline remains default
- `src/styles.css` — approved-token demo controls and contained review forms
- `AGENTS.md`, `roadmap.md` — architecture rules and checkpoint status
- Project memory — Stage 0 authorization and individual-stage approval boundaries

Approved plan, financial fixture JSON, aging helper, original repository and comparison components/routes were not changed.

## Validation
- Final full Vitest run: **64/64 passing, 8/8 files** (37 existing + 27 new).
- Initial run exposed an unsaved-input subscription defect; fixed and regression-tested, including Escape/discard and focus restoration.
- Automated type check exposed form input/output inference mismatch; fixed with separate schema input/output types. Latest automated log: **build OK**, including type validation.
- Standalone build/type commands intentionally not duplicated; the harness performs them.
- Actual browser at 1440/768/390/320: complete form/review/confirmation/result, selected scenario across navigation, changed demo remarks in existing document drawer, baseline reset, no page overflow or drawer overflow.
- Embedded preview: review and contract sheets contained within their viewport, internally scrollable and confirmation reachable.
- Additional browser checks: blank-field validation, unsupported review/no confirmation, Escape discard, cancellation rejection, sales denial, error retry and FY reset.
- Browser captured **zero page runtime errors and zero API requests**.
- Existing Recharts zero-size warning remains in the layout-free aging unit-test environment only; actual chart rendering checked in the browser.
- Hosted authentication, production security, backend mutation execution and export workbook validation are not tested in Stage 0; no production connection exists and export workflow belongs to Stage 6.

## Unresolved contracts / next-stage gates
No confirmed Stage 0 implementation defect remains. Dependent-stage contract issues are recorded, not silently resolved: issued-item description ambiguity; incomplete customer/target history; recent-payment cap; non-atomic correction; export worksheet/TTL documentation conflict; unsupported account/reference operations; future server reporting-date requirement.

Financial action success scenarios beyond metadata rehearsals remain gated to their approved stages and require verified complete literal before/after fixtures. No new settlement, issuance or cancellation is fabricated by this foundation.

**Checkpoint:** Stage 0 is ready for review. Stages 1–6, backend integration and deployment remain unauthorized.