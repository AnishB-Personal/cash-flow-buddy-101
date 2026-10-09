# CollectFlow — Final Aging Date Correction

## Scope

Correct reporting-date accuracy only. Preserve the approved Design B styling, navigation, dashboard composition, tables and drawers. Keep the original backend untouched, use mock data only, and do not publish or connect to production.

## Verified findings

- The selected workspace classifies invoice 101 using a hardcoded “Current / Not Due” association, without a reporting date.
- The shared fixtures contain one issued invoice, **INV-2026-042**, due **12 May 2026**, with a payment dated **20 April 2026** and **₹3,22,000** outstanding. The other record is an unbilled order.
- The raw aging summary contains five categories; the frontend presents six. The original backend defines six boundaries: current, 1–30, 31–60, 61–90, 91–180, and over 180 days.

## 1. Establish an explicit snapshot date

Use **`asOfDate = "2026-04-30"`**, displayed as **“Aging as of 30 Apr 2026”**.

This is a chosen mock month-end reporting date, not a claimed original extraction date. It follows the supplied invoice, order and payment dates and precedes the invoice’s due date, so it reconciles the existing current-aging classification without altering any transactions. Never silently substitute the viewer’s current date.

Expected reconciliation:

| Record | Aging outcome at 30 Apr 2026 |
|---|---|
| INV-2026-042, due 12 May 2026 | Not overdue; 0 days overdue; Current / Not Due; ₹3,22,000 |
| PO-NEXUS-881, unbilled | Excluded from receivables aging |
| Other five aging categories | No contributing issued invoices; ₹0 |

Payment status remains **Partial**; payment status and overdue status are separate concepts.

## 2. Apply one reusable date rule

- Replace ID-based aging membership with a small, date-only reporting helper that accepts an explicit reference date and returns days overdue, overdue indicator and bucket.
- Match the verified backend boundaries: due today or later means 0 days overdue/current; overdue buckets cover 1–30, 31–60, 61–90, 91–180 and 181+ days. Retain the approved visible “180+ days” label.
- Use UTC calendar-day comparisons so local timezone and time-of-day cannot move an invoice across a boundary.
- Exclude unbilled orders, cancelled invoices and non-positive balances from aging. Preserve the backend’s null-due-date treatment (0 days overdue) without inventing a due date.
- Build every aging amount and drill-down from the same eligible issued-invoice records and helper. Normalize the fixture aging summary to the six verified categories without changing invoice or payment amounts.

## 3. Make the reporting context visible

- Add **“Aging as of 30 Apr 2026”** to the dashboard aging section, AR Aging page and aging-filtered invoice results, including empty results.
- Show the same context beside invoice overdue information in desktop tables, mobile cards and invoice details, using existing metadata styling. Include days overdue without introducing new columns or restructuring the drawer.
- Keep the reference comparison at `/design-comparison`; apply only date-label and aging-consistency corrections there where it consumes shared aging data. Do not redesign or expand its workflows.

## Technical boundaries

Keep the reference date in shared mock reporting metadata and pass it through reusable selectors/helpers, not component-local constants. Future integration can supply the API’s reporting date and authoritative aging fields through this boundary. This helper classifies dates and aggregates supplied outstanding amounts only; it does not calculate payments, taxes, balances or historical ledgers.

During implementation, replace the superseded ID-membership architecture rule and record the explicit-date requirement; do not retain conflicting instructions.

## Validation and final approval

- Add regression cases for due before/on/after the reference date; 0, 1, 30, 31, 60, 61, 90, 91, 180 and 181 days; timezone stability; null due dates; paid/cancelled/unbilled exclusions; and partial-but-overdue invoices.
- Test all six drill-downs against contributing records, dashboard aging totals against issued outstanding, and matching statuses/date labels across dashboard, invoice lists/cards and details.
- Use test-only date variants to demonstrate overdue behavior; do not add financial records to the application fixtures.
- Assert unchanged invoiced ₹5,31,000, cash ₹2,00,000, TDS ₹9,000, settlements ₹2,09,000, issued outstanding ₹3,22,000 and unbilled order value ₹2,95,000.
- Run relevant and existing frontend tests. Check the harness-managed build/type results; do not duplicate its standalone build/typecheck commands. Report any failed or unexecuted checks explicitly.
- Verify actual rendering and drill-down at 1440px desktop, 768px tablet, 390px mobile and 320px narrow mobile, including the embedded preview and drawer date labels.

Report the selected date and justification, final classifications, unchanged financial totals and validation results. Stop for final approval; no remaining-module implementation, backend integration or publication.
