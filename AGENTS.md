<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the comparison frontend independent from the original FastAPI repository; source behavior informs adapters but never replaces backend authority.
- Keep financial mock fixtures shared across all three design compositions so comparisons use identical facts without a financial calculation engine.
- Use concept-scoped semantic CSS tokens and distinct dashboard layouts, with shared interaction logic for consistent comparison behavior.
- Keep the selected workspace and archived comparison in separate component trees; the comparison remains reachable at /design-comparison so design references are not overwritten.
- Use reusable document selectors, listings and contextual drawers for the selected workspace; all amounts originate in sanitized fixtures and aging membership uses the supplied snapshot, not current-date recalculation.
- Keep implemented financial screens in distinct TanStack content routes and deferred modules explicitly identified; this preserves navigable integration boundaries without pretending unfinished workflows are complete.
- Use an explicit optional portal container for embedded preview overlays; mobile drawers must scroll inside their own viewport instead of inheriting desktop positioning.
- Match mock role visibility to verified FastAPI permissions; sales may read all records but only finance/admin may edit, convert, cancel or record payments.
- Keep mock role and fiscal-year state in a shared in-memory provider across financial routes; navigation must not silently restore permissions or reset financial context, and no new authentication or persistence is introduced.
