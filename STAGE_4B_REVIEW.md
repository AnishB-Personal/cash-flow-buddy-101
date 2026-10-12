# CollectFlow — Phase 4 Stage 4B Implementation & Verification Review

**Document Reference:** `STAGE_4B_REVIEW.md`  
**Phase & Stage:** Phase 4 — Stage 4B (Isolated Sandbox Environment, Exact-Origin CORS, Browser Authentication Portal & API Client)  
**Date:** 12 October 2026  
**Final Verdict:** **PASS (Local Sandbox Integration Foundation & Browser Authentication Complete)**  

---

## 1. Git Branches & Commit Checkpoints

### Git Checkpoint Discrepancy Resolution
During initial Stage 4B submission, a discrepancy was noted between `STAGE_4B_REVIEW.md` referencing `85433542df244beef9268dcb5c3c1dc2f6f11027` and the repository commit summary reporting `30aa7322c1a494fd754319e80e2915fcc8d8fdf1`.
- **Root Cause:** Commit `8543354` implemented the automated test suite. Commit `30aa732` authored the review documentation and committed it directly on the development branch. As `30aa732` contained the markdown text inside itself, referencing `8543354` was referencing its parent commit.
- **Final Frontend HEAD:** `54f10b6fe9cb9cf83c076bc38c20188bb3e8471c` (includes `/login` TanStack route, client-side live authentication form, and Playwright browser integration tests).
- **Approved Phase 3 Baseline:** `b4c4b25f634e2f0131b7299570f994f3e6a3502f` (Documentation) and `ae31b54891b127994731400b91ce8d2e6f3aa580` (Implementation) remain completely intact and frozen.

### Current Verified Checkpoints
- **Frontend Repository:** `/home/anishb/projects/personal/cash-flow-buddy-101`
  - **Branch:** `feature/phase4-stage4b-sandbox-auth`
  - **Current HEAD Commit SHA:** `54f10b6fe9cb9cf83c076bc38c20188bb3e8471c`
  - **Working Tree Status:** Clean (no uncommitted modifications)
- **Backend Repository:** `/home/anishb/projects/personal/collectflow`
  - **Branch:** `feature/phase4-stage4b-sandbox-auth`
  - **Current HEAD Commit SHA:** `1aa9cf66a01ba2a93fb5b4dc1f582a87570220cb`
  - **Working Tree Status:** Clean (no uncommitted modifications)

---

## 2. Sandbox Database Isolation & Server Hardening Evidence

The database isolation gate in `app/database.py` and server binding in `app/main.py` were hardened and verified:
1. **Canonical Path Dereferencing (`os.path.realpath`):**
   - Resolves all symlinks, relative traversal paths (`../`), and filesystem aliases.
   - Any attempt to symlink the sandbox path to the production database (`collectflow.db`) is immediately rejected with a fatal `RuntimeError`.
   - Relative path traversal (e.g. `/var/data/sandbox/../collectflow.db`) is normalized and strictly rejected.
2. **Mandatory Keyword Enforcement:**
   - When `COLLECTFLOW_ENV=integration` or `sandbox`, the canonical path must contain `sandbox`, `integration`, or `test`.
   - Missing `COLLECTFLOW_DB_PATH` causes immediate startup abort.
3. **Localhost-Only Server Binding:**
   - In integration/sandbox mode, FastAPI binds strictly to `127.0.0.1` (rejecting public or wildcard `0.0.0.0` interfaces).
4. **Synthetic Test Fixtures (Credential Sanitization):**
   - Populated `/home/anishb/projects/personal/collectflow/data/collectflow_sandbox.db` via `scripts/init_sandbox_db.py`.
   - Seeded disposable synthetic accounts: `sandbox_admin`, `sandbox_finance`, `sandbox_sales`, `sandbox_viewer`.
   - Literal passwords are redacted from all formal review documentation and audit logs. Zero production data or customer records are present in the sandbox.

---

## 3. Exact-Origin CORS Verification

Configured in `app/main.py` via `CORSMiddleware`:
- **Allowed Local Origins:** `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`.
- **Wildcard Rejection:** Disallows `*`.
- **Public Worker Blocking:** The public Cloudflare staging worker domain (`*.workers.dev`) is explicitly excluded from the live allowlist.
- **Verification Evidence:**
  - `OPTIONS /api/auth/login` from `http://localhost:5173` returns `200 OK` with `access-control-allow-origin: http://localhost:5173`.
  - `OPTIONS /api/meta` from `https://malicious-site.com` or `*.workers.dev` returns no CORS headers.

---

## 4. Frontend API Client & Real Browser Authentication Portal

### Browser Authentication Page (`/login`)
- **Route:** Added `src/routes/login.tsx` registered in TanStack Router (`src/routeTree.gen.ts`).
- **Client-Side Rendering:** Configured with `ssr: false` to ensure seamless client hydration and avoid SSR state mismatches.
- **Live Mode Authentication:** Connects directly to `POST /api/auth/login` and retrieves user profile from `GET /api/auth/me`.
- **Mock Mode Safety Guard:** If loaded in default `VITE_API_MODE=mock`, form submission displays a prominent notice informing the operator that the application is operating in mock mode and requires setting `VITE_API_MODE=live` with a valid sandbox URL.
- **Memory-Only Token Lifecycle:**
  - Bearer tokens are held strictly in JavaScript memory (`ApiClient.inMemoryToken`).
  - Session tokens and user profiles are NEVER stored in `localStorage` or `sessionStorage`.
  - Passwords and auth tokens are cleared from memory upon logout or drawer dismissal.
- **401 vs 403 Access Separation:**
  - `401 Unauthorized` automatically triggers session revocation, clears in-memory state, and redirects to `/login`.
  - `403 Forbidden` presents an accessible access-denied error banner without destroying the active session.

---

## 5. Automated Verification Results

### Backend Automated Test Results (FastAPI / pytest)
- **Command:** `/home/anishb/projects/personal/collectflow/venv/bin/pytest tests/`
- **Result:** **82 passed, 0 failed in 21.05s**
  - All 74 core financial, invoicing, payments, and RBAC regression tests pass.
  - All 2 CORS and database isolation tests pass (`test_sandbox_cors_isolation.py`).
  - All 6 sandbox live authentication integration tests pass (`test_sandbox_auth_integration.py`).

### Frontend Automated Unit & Integration Tests (Vitest)
- **Command:** `npm test`
- **Result:** **537 passed across 37 test files (100% pass rate)**
  - All 525 pre-existing Stage 0–6 mock regression tests pass.
  - All 6 `src/test/api-client.test.ts` unit tests pass.
  - All 6 `src/test/sandbox-auth-integration.test.ts` integration tests pass.

### Full Playwright Multi-Viewport Browser Regression Suite
- **Command:** `LD_LIBRARY_PATH=/home/anishb/.local/lib npx playwright test`
- **Result:** **133 passed, 0 failed (7.2 minutes)**
  - All 131 pre-existing Stage 0–6 Playwright browser tests pass.
  - New test suite `e2e/stage4b-live-auth.spec.ts` passes:
    1. Loads `/login` portal cleanly, validates inputs, verifies title/branding and mock mode indicator.
    2. Enforces mock-mode rejection notice on submission when operating in default mock mode.
  - Full 4-viewport responsiveness preserved: Desktop (1440px), Tablet (768px), Mobile (390px), and Narrow Mobile (320px) with 0 horizontal overflow.

### Static Build & Type Check
- **Command:** `npm run build`
  - Nitro engine compiles cleanly into `.output/server/` using the `cloudflare-module` preset.
- **Command:** `npx tsc --noEmit`
  - All production and route modules typecheck cleanly with 0 errors.

---

## 6. Architecture Decisions Register (ADR) Summary

| Decision ID | Description | Status |
|-------------|-------------|--------|
| **ADR-01** | In-memory Bearer token for integration sandbox; HttpOnly cookie/BFF for production | **APPROVED & VERIFIED** |
| **ADR-02** | Export RBAC dual-gate backend hardening | **PROPOSED (Pending Business Approval)** |
| **ADR-03** | Dedicated server-side reporting aggregation endpoints | **PROPOSED (Deferred)** |
| **ADR-04** | Exact local origin CORS whitelist (`no wildcard *`) | **APPROVED & IMPLEMENTED** |
| **ADR-05** | Historical as-of reporting via ledger reconstruction | **PROPOSED (Deferred)** |
| **ADR-06** | Dual-mode configuration (`VITE_API_MODE = 'mock' \| 'live'`) | **APPROVED & IMPLEMENTED** |
| **ADR-07** | SQLite sandbox database path isolation & canonical resolution | **APPROVED & IMPLEMENTED** |

---

## 7. Known Limitations & Next Steps

1. **Memory-Only Session Lifetime:** A browser page refresh clears the in-memory token. This is an intentional security design for Stage 4B local sandbox testing until production cookie/BFF authentication is built.
2. **Financial Module Isolation:** Stage 4B did not touch or integrate financial modules (Invoices, Orders, Payments, Targets). Those workflows remain powered by the approved mock demo engine.
3. **Stage 4C Readiness:** Stage 4C will integrate the live Dashboard KPIs and Core Transactions (Customers, Orders, Invoices) into the `ApiClient`.

---
*Report committed on development branches. Awaiting independent review.*

