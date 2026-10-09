# CollectFlow UI Redesign — Phase 1 Design Strategy

## Product design strategy

CollectFlow should feel like a focused financial operations workspace, not a generic dashboard. The redesign will optimize for three recurring jobs:

1. **Find risk quickly** — outstanding receivables, aging exposure, overdue invoices, and collection progress.
2. **Complete financial work safely** — create orders, issue invoices, record cash plus TDS, and confirm irreversible actions without losing context.
3. **Audit with confidence** — preserve legal snapshots, immutable invoice fields, payment history, role restrictions, and server-confirmed outcomes.

### Experience principles

- Make customer, document number, status, due date, and outstanding balance the dominant scan path.
- Separate **Orders** (unbilled commercial commitments) from **Invoices** (issued receivables) in navigation while using the shared invoice resource documented by the API.
- Replace nested modals with dedicated creation flows and contextual side panels; reserve dialogs for short confirmations.
- Keep dense desktop tables, purpose-built tablet layouts, and stacked mobile summaries with persistent record identity.
- Show financial mutations as pending until confirmed; never display payment, conversion, cancellation, or deletion as committed optimistically.
- Expose only role-appropriate actions while preserving clear read-only states for sales and viewer roles.
- Use Indian numbering, ₹ formatting, two-decimal precision where operationally relevant, GST/TDS terminology, and April–March fiscal years throughout.

## Proposed information architecture

```text
CollectFlow
├── Overview
│   ├── Financial dashboard
│   └── AR aging explorer
├── Revenue operations
│   ├── Orders
│   ├── Invoices
│   ├── Payments
│   └── Customers
├── Performance
│   ├── Sales targets
│   └── Reports & export
└── Administration
    ├── Users & roles
    ├── Financial years
    ├── GST & TDS
    └── Security
```

- **Desktop:** collapsible left navigation, page-level top bar, global search, fiscal-year context, and role-aware quick actions.
- **Tablet:** compact icon rail with an expandable navigation sheet; tables retain essential financial columns.
- **Mobile:** bottom navigation for Overview, Orders, Invoices, and More; records become compact summaries with actions in a bottom sheet.
- **Global search:** customer, PO number, and invoice number, with record type and outstanding amount visible before selection.

## Three visual directions

### A. Precision Enterprise

- **Typography:** Sora for headings and controls; Manrope for body and financial tables; tabular numerals for money.
- **Palette:** white and cool gray surfaces, deep navy structure, restrained cobalt actions, emerald success, amber warnings, and vermilion risk.
- **Density:** compact and highly scannable; thin dividers, 4–6px radii, minimal shadow, strong column alignment.
- **Navigation:** fixed dark navigation rail against a light operational canvas.
- **Charts:** direct labels, muted comparison series, crisp gridlines, and no decorative gradients.
- **Forms:** structured sections with labels above fields; line items resemble a spreadsheet; totals stay visible in a sticky summary rail.
- **Mobile:** priority-field record summaries; secondary accounting detail expands inline.
- **Best for:** finance teams that value speed, predictability, and audit clarity above visual softness.

### B. Calm Modern SaaS

- **Typography:** Outfit for headings; Figtree for body and controls; generous but disciplined line height.
- **Palette:** bright neutral canvas, charcoal text, desaturated teal primary, soft blue information, sage success, coral risk.
- **Density:** balanced; more breathing room than A, with 6–8px radii and subtle surface separation.
- **Navigation:** light sidebar grouped by job area, with a compact colored active marker.
- **Charts:** rounded bars, quiet fills, plain-language annotations, and accessible legends.
- **Forms:** guided sections and progressive disclosure; inline customer creation; friendly validation placed beside the affected field.
- **Mobile:** stacked summaries with clear primary actions and comfortable touch targets.
- **Best for:** mixed finance, sales, and executive audiences who need a lower learning curve.

### C. Premium Analytics

- **Typography:** Space Grotesk for headings and key metrics; DM Sans for body; oversized tabular KPI numerals.
- **Palette:** graphite navigation and headers, pearl content surfaces, cyan analytical accents, mint positive signals, amber aging, and coral delinquency.
- **Density:** spacious analytical overview paired with compact operational tables.
- **Navigation:** narrow dark rail; Overview opens as a command center with adjustable analytical panels.
- **Charts:** layered comparisons, benchmark lines, richer tooltips, and coordinated aging selections.
- **Forms:** focused full-page workflows with a live financial calculation panel and review stage.
- **Mobile:** executive-first KPI feed; operational tables become filtered record queues.
- **Best for:** leadership visibility and analytical storytelling, with a more distinctive premium identity.

## Recommendation

**Recommend A — Precision Enterprise.** CollectFlow’s highest-risk work involves dense accounting records, statutory immutability, and frequent comparison across invoices. This direction delivers the strongest hierarchy and fastest scanning while remaining contemporary. Selected ideas from B—plain-language validation and guided form sections—will soften complex workflows without reducing density.

Approval of this plan commits Phase 1 to **Precision Enterprise**. Choosing B or C instead should happen before implementation.

## Screen map

| Area | Primary view | Key secondary view or action | Roles |
|---|---|---|---|
| Sign in | Credential form and rate-limit/error state | Session expiry return | All |
| Overview | KPIs, YoY, aging, executive attainment | Aging-filtered receivables queue | All |
| Orders | Unbilled PO/contract list | Order detail, edit, convert, delete | Read all; mutate by role |
| Invoices | Issued invoice list | Invoice detail, payment timeline, cancel | Read all; mutate admin/finance |
| Payments | Recent payments ledger | Record or reverse payment | Read all; mutate admin/finance |
| Customers | Searchable directory | Customer profile and order history | Role-dependent |
| AR aging | Bucket totals and delinquent records | Invoice/customer detail | All |
| Sales targets | Executive attainment | Quota configuration | Read all; configure admin |
| Reports | Fiscal-year export workspace | Secure XLSX export | All documented roles |
| Users & roles | Team accounts | Role, password, quota actions | Admin |
| Settings | FY, GST, TDS, password | Add/remove reference data | Role-dependent |

## Coverage of the 14 documented workflows

The handover labels combined workflows 6/7 and 10/11, yielding 13 headings but 14 journeys.

| # | Workflow | Planned coverage |
|---|---|---|
| 1 | Authentication and session termination | Sign-in, logout, expiry, invalid credentials, and rate-limit states |
| 2 | Customer creation and modification | Directory, profile panel, create/edit form, GSTIN validation |
| 3 | Create PO or direct invoice | Guided commercial terms, line items, review, server confirmation |
| 4 | Edit order metadata and allowed fields | Read-only statutory fields and explicit editable operational fields |
| 5 | Convert PO to tax invoice | Focused conversion confirmation with Net-30 date preview |
| 6 | Record cash payment | Invoice-aware payment flow with outstanding balance guard |
| 7 | Record TDS withholding | Cash + TDS settlement breakdown and section selection |
| 8 | Review receivables and aging | Dashboard aging analysis and delinquent invoice queue |
| 9 | Cancel eligible order/invoice | Payment precondition, required reason, server-confirmed result |
| 10 | Manage sales executives | Users/roles administration and executive assignment |
| 11 | Assign sales quotas | FY target editor with documented breakdown preview |
| 12 | Export financial audit reports | Single-use ticket flow and fiscal-year XLSX export |
| 13 | Team user administration | Create/edit/delete/reset flows with last-admin and self-delete guards |
| 14 | RBAC enforcement | Role-aware navigation, controls, read-only states, and 401/403 handling |

## Phase 1 implementation after approval

Only the following prototype scope will be built:

1. **Responsive application shell** — Precision Enterprise navigation, top bar, global search treatment, fiscal-year context, and role switcher for prototype review.
2. **Dashboard** — supplied KPI, YoY, aging, and executive mock fixtures; aging interaction demonstrates the future drill-down behavior without claiming unsupported API integration.
3. **Orders and invoices listing** — mock-backed search, FY/executive/status filters, sorting, pagination treatment, desktop table, tablet reduction, and mobile record summaries.
4. **Representative detail view** — the supplied partial invoice with customer snapshot, line item, cash/TDS settlement, due date, immutable-field treatment, and payment history.
5. **Required states** — loading skeletons, empty results, validation examples, permission-disabled actions, server error presentation, and unconfirmed mutation states.
6. **Review stop** — no customer, payment, report, user, or settings implementation beyond navigation destinations and documented screen mapping.

## Technical details

- Frontend-only TanStack Start/React prototype using the uploaded JSON as read-only mock fixtures.
- Semantic design tokens in `src/styles.css`; responsive, accessible components with keyboard navigation, visible focus, and WCAG-conscious contrast.
- Separate shareable pages for dashboard, orders, invoices, and representative detail; no production API calls, credentials, backend, database, or deployment.
- Financial calculations displayed by the prototype will mirror documented fixture values and rules; no replacement financial engine will be introduced.
- Mutating interactions will demonstrate validation and confirmation behavior locally, then return to the unchanged fixture state.

## API and data requirements to resolve before real integration

1. OpenAPI defines request bodies but no usable success-response schemas for dashboard, lists, details, payments, settings, targets, exports, or errors.
2. Confirm whether `invoice_id` and `order_id` always share one stable identifier through PO conversion.
3. The aging summary has bucket totals, but invoice listing does not document an aging-bucket filter; true bucket drill-down needs backend clarification.
4. “Reports” currently means one secure two-sheet XLSX export; no other report types are documented.
5. Confirm whether target retrieval returns one fiscal year or target history.
6. Provide representative detail payloads for paid, cancelled, overdue, foreign-currency, multi-line, and multi-payment records.
7. Define stable 400/401/403/404/429 error response shapes and confirm role/session-revocation behavior.
8. Confirm guaranteed list-row fields versus detail-only fields before integration.
