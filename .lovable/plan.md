# CollectFlow — Interactive Visual Direction Comparison

## Goal

Build one frontend-only comparison experience containing three genuinely different, interactive CollectFlow dashboards. All options will use the same sanitized mock data, financial semantics, and feature inventory so the decision is based on design quality rather than different content.

This is a design-selection prototype only. It will not replace or modify the original FastAPI application, connect to production, introduce authentication or storage, or implement the complete product.

## Authoritative references

- Use the supplied handover, OpenAPI contract, mock fixtures, and permissions matrix.
- Inspect the original GitHub repository read-only, focusing on `app/`, `static/js/`, `docs/lovable-handoff/`, and `tests/`.
- Treat the original backend behavior and regression tests as authoritative where they clarify response shapes, calculations, roles, or workflow constraints.
- Keep the new React work independent and structured for later integration into a separate frontend repository.
- Document any discrepancy between source code, tests, OpenAPI, and handover instead of silently choosing or inventing behavior.

## Comparison experience

The first screen will be the actual dashboard comparison—not a marketing page.

- A persistent **A / B / C switcher** changes the entire visual system and dashboard composition, not just colors.
- Each option shows the same current fiscal year, KPI values, aging data, collection data, executive performance, and recent order/invoice records.
- Controls will demonstrate navigation, fiscal-year selection, chart inspection, aging selection, table filtering, row selection, sidebar behavior, and mobile navigation.
- A comparison tray will summarize the active option’s density, navigation model, table treatment, and mobile approach without obscuring the interface.
- A viewport preview control will present desktop and mobile compositions inside the experience; the layouts will also respond naturally when the browser itself is resized.
- Mock financial mutations will never appear committed. This comparison focuses on viewing, filtering, and navigation rather than pretending to save financial changes.

## Option A — Precision Enterprise

A compact operational workspace optimized for finance teams processing dense records.

- **Typography:** Sora headings and controls; Manrope body and tabular financial data.
- **Visual identity:** deep navy navigation, cool white work surface, cobalt actions, restrained semantic risk colors, thin rules, minimal shadow, 4–6px radii.
- **Layout:** fixed collapsible rail; compact header; high-density KPI strip; charts and aging arranged for rapid comparison; wide operational table.
- **KPI treatment:** concise labels, strong tabular numerals, deltas aligned consistently, minimal decoration.
- **Charts:** crisp gridlines, direct labels, square-ended bars, accessible categorical colors.
- **Table:** dense rows, strong column alignment, sticky identity column, visible status and balance hierarchy.
- **Mobile:** prioritized financial record summaries with expandable secondary details and a compact action bar.

## Option B — Calm Modern SaaS

A clean, approachable workspace balancing finance operations with ease of use for sales and executives.

- **Typography:** Outfit headings; Figtree body and controls.
- **Visual identity:** luminous neutral canvas, charcoal text, desaturated teal action color, soft blue information, sage positive state, coral risk, subtle elevation, 6–8px radii.
- **Layout:** light grouped sidebar; spacious page header; modular KPI row; balanced two-column insights; simplified recent-record list.
- **KPI treatment:** comfortable spacing, plain-language context, restrained supporting icons.
- **Charts:** rounded bars, soft fills, clear legends, and concise annotations.
- **Table:** fewer visible columns with progressive disclosure into a contextual detail panel.
- **Mobile:** touch-friendly bottom navigation, stacked KPI summaries, and comfortable record cards.

## Option C — Premium Analytics

A distinctive fintech command center emphasizing analytical clarity and executive confidence.

- **Typography:** Space Grotesk headings and metrics; DM Sans body; prominent tabular numerals.
- **Visual identity:** graphite structural surfaces, pearl content canvas, cyan analytical accent, mint performance, amber aging, coral delinquency, refined contrast, controlled depth.
- **Layout:** narrow dark rail; editorial dashboard header; asymmetrical analytical grid; prominent receivables narrative; premium recent-activity presentation.
- **KPI treatment:** large metrics with benchmark context and stronger visual rhythm.
- **Charts:** layered comparisons, benchmark lines, coordinated highlighting, richer tooltips, and more analytical labeling.
- **Table:** polished ledger treatment with grouped financial values and an integrated selected-record preview.
- **Mobile:** executive-first insight feed followed by operational queues and a compact command dock.

## Shared dashboard content

Every direction will include the same functional content:

1. Sidebar navigation covering Overview, Orders, Invoices, Payments, Customers, AR Aging, Targets, Reports, and Administration.
2. Dashboard header with fiscal-year context, search treatment, role identity, and relevant quick action affordances.
3. KPIs for invoiced revenue, cash collected, TDS recognized, settled amount, outstanding receivables, and collection rate.
4. Year-over-year invoiced-versus-collections visualization.
5. Receivables aging across Current, 1–30, 31–60, 61–90, and 90+ day buckets.
6. Collection composition and recovery progress.
7. Executive target attainment summary.
8. Recent orders and invoices using realistic Indian currency formatting, PO/invoice identifiers, due dates, statuses, cash, TDS, and outstanding balances.
9. Loading, empty, and error demonstrations accessible from a prototype-state control.

## Interaction design

- Selecting an aging bucket coordinates highlighting and filters the mock receivables shown below it.
- Search and status controls filter the shared mock order/invoice rows.
- Selecting a record opens each direction’s distinct detail treatment while preserving the same customer snapshot, line item, settlement, and payment facts.
- Sidebar collapse, mobile menu, fiscal-year selector, chart tooltips, table sorting, and pagination treatment will be functional.
- Keyboard focus, labels, contrast, reduced-motion support, and non-color status cues will be consistent across all options.

## Responsive comparison

Each direction will be designed independently at three layout ranges:

- **Desktop:** full navigation and analytical layout at 1280px and above.
- **Tablet:** compact navigation and reduced financial columns.
- **Mobile:** purpose-built navigation and stacked content around 390px; no desktop table squeezed into horizontal overflow.

The final verification will inspect all three options at desktop and mobile sizes for clipping, overlap, readability, interaction, and consistent mock values.

## Implementation structure

- Keep the existing TanStack Start/Vite foundation and build the prototype at `/`.
- Use a shared typed mock-data layer so values remain identical across A, B, and C.
- Give each concept its own dashboard composition and theme tokens; share only behavior and small primitives where doing so does not make the designs converge.
- Define all colors, shadows, radii, and typography as semantic tokens in the global design system.
- Load fonts from the document head and use accessible chart and icon components.
- Add route-specific metadata for the comparison page.
- Record the independent mock-frontend architecture in `AGENTS.md` after implementation.

## Boundaries

- No edits to the original GitHub repository.
- No FastAPI, SQLite, auth, database, or API integration changes.
- No real credentials or production requests.
- No complete customer, payment, report, user, settings, or mutation workflows in this stage.
- No deployment or publication.
- No selection will be presumed: after the interactive comparison is presented, implementation stops for explicit approval of A, B, C, or a clearly specified hybrid—especially the requested possibility of C’s premium quality with B’s operational simplicity.

## Validation and handoff

- Verify the project preview builds cleanly.
- Test A/B/C switching and core interactions.
- Check desktop and mobile screenshots for each direction.
- Confirm equal financial values and status semantics across all three.
- Present the comparison for review, summarize meaningful differences, and request explicit visual-direction approval before any broader frontend implementation.
