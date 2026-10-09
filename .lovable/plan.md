# CollectFlow — Selected UI Refinement

## Approved direction

Create one cohesive interface using **Design B’s visual language, Outfit/Figtree typography, colors, grouped sidebar, and KPI treatment**, with **Design A’s financial table detail** and **Design C’s contextual drawer interaction**.

This phase covers the application shell, dashboard, orders, invoices, record details, search/filter interactions, and responsive/state refinements only. Remaining modules and backend integration stay out of scope.

## 1. Final application shell

- Make the selected interface the first screen at `/`; remove A/B/C selection from the primary experience.
- Preserve the comparison independently at `/design-comparison` as a reference, without mixing comparison controls into the application.
- Group navigation into Overview, Revenue Operations, Performance, and Administration as specified in your brief.
- Keep Dashboard, AR Aging, Orders, and Invoices usable in this phase. Mark remaining modules clearly as not implemented; do not present sample fragments as completed modules.
- Verify navigation and action visibility against the original permission references. Use synthetic role contexts to demonstrate permission states, not a new login system.

## 2. Financial dashboard

- Retain B’s prominent KPI cards while distinguishing total invoiced, issued outstanding, cash collected, TDS recognized, settlement rate, overdue receivables, and unbilled orders/value.
- Label cash-plus-TDS performance **Settlement Rate** and rename the comparison chart **Invoiced vs Settlements**, keeping cash and TDS separately inspectable.
- Preserve financial-year context and consistent INR formatting.
- Separate recent orders and recent invoices into clearly labeled views so an unbilled PO never receives an invoice-total or receivables label.
- Keep the original six aging categories and supplied mock totals. Use an explicit fixture-to-category association for drill-down rather than recalculating aging from today’s date.
- Aging selection opens or filters the issued-invoice queue only; zero-value categories show an appropriate empty result.

## 3. Separate orders and invoices

### Orders

Show PO number, customer, order date, order value, unbilled value, executive, and status. Use document-appropriate detail labels and contextual View Order, Edit Order, and Convert to Invoice affordances where permitted.

### Invoices

Show invoice number, customer, invoice total, cash/TDS settlement detail, outstanding, due date, overdue indicator, executive, and payment status. Exclude unissued orders from this listing.

### Shared table behavior

- Combine B’s styling with A’s denser, right-aligned financial columns.
- Provide independent page search, relevant status/executive filters, sorting, working pagination with page-size selection, result counts, and contextual row menus.
- Reset pagination when filters change; disable page movement only when there are no further results.
- Keep all financial values grounded in the supplied fixtures; do not fabricate extra invoices merely to populate pages.
- Remove irrelevant global actions and redundant listing links.
- Financial mutation affordances explain their unconnected status; no change appears saved. Full creation, editing, payment, cancellation, and issuance workflows remain outside this phase.

## 4. Record details and mobile cards

- Desktop: a responsive side drawer with document identity, financial summary, customer snapshot, commercial terms, line items, and invoice payment history.
- Mobile: a full-width detail sheet with stacked sections, a scrollable body, a visible close control, and accessible footer actions.
- Orders show Order Value/Unbilled Value and issuance status, not Invoice Total/Outstanding receivables.
- Invoice cards preserve invoice number, customer, invoice total, outstanding, due date, payment status, and overdue indicator. Order cards use their distinct document semantics.
- Constrain drawers, overlays, menus, and filters to the actual viewport or embedded mobile preview frame. Do not rely on desktop positioning inside a mobile frame.

## 5. Search, readability, and states

- Give global search its own query and supported mock results across orders, invoices, and customers. Opening a result selects its correct record detail without silently changing table filters.
- Keep table search restricted to the current screen.
- Increase sidebar, header, legend, metadata, filter, and action readability; retain restrained status styling and tabular numerals.
- Provide visible keyboard focus, accessible names, touch-sized controls, Escape dismissal, focus return, and reduced-motion support.
- Demonstrate loading, empty, retryable error, and permission-denied states without adding backend behavior.

## Technical approach

- Keep the existing React/TanStack/Vite foundation and independent mock-only architecture. No original repository edits, production calls, database, authentication, or FastAPI changes.
- Split the final shell, dashboard, document listings, record drawer, and search into reusable components; retain the comparison separately.
- Use shared typed fixture selectors for issued invoices, orders, fiscal-year subsets, and aging membership. Treat backend contracts as authority, not a new financial engine.
- Replace design-specific branching in the shared dialog primitive with an explicit reusable drawer/portal pattern that supports viewport containment.
- Define selected-design colors, typography, surfaces, and states through semantic CSS tokens; isolate comparison styles from the final interface.
- Give each new content route unique CollectFlow metadata.
- Record the approved design preferences and updated scope in project memory, and architecture rules in `AGENTS.md`, during implementation.

## Verification and approval checkpoint

Use actual browser rendering at **1440px desktop, 768px tablet, 390px mobile, and 320px narrow mobile**, plus the embedded mobile preview.

Verify:

- No unintended page-level horizontal scrolling, clipped controls, or overflowing drawers.
- Complete financial information in tables/cards and readable chart labels.
- Issued receivables reconcile with supplied dashboard/aging values; unbilled orders never appear in aging results.
- Independent global/table search, filters, sorting, pagination, navigation, row menus, drawer dismissal, and state recovery.
- Role-based visibility follows verified references; unavailable modules/actions are clearly identified.
- Focused fixture/selector and interaction regression tests pass, and the preview reports no build or runtime errors.

Present the refined interface and stop for your approval before implementing remaining modules or integrating the backend. Do not publish or deploy.
