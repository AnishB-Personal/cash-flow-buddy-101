# CollectFlow Phase 4 Stage 4C: Target Architecture, Workflow Alignment & Integration Plan

**Document Reference:** `COLLECTFLOW_PHASE4_STAGE4C_INTEGRATION_PLAN.md`  
**Engagement Phase:** Phase 4 — Stage 4C (Target Architecture, Reorganization & Phased Implementation Plan)  
**Status:** **DRAFT — Awaiting Independent Architecture Review and Approval**  
**Target Repository:** `/home/anishb/projects/personal/cash-flow-buddy-101`  
**Target File Path:** `docs/plans/COLLECTFLOW_PHASE4_STAGE4C_INTEGRATION_PLAN.md`  
**Frontend Baseline Checkpoint:** `254f34127208b5d46c748927c5a39c8d0c84d03d` (`feature/phase4-stage4b-sandbox-auth`)  
**Backend Reference Checkpoint:** `1aa9cf6224fa7d37793b16b03bc21ef9a5ede766` (`feature/phase4-stage4b-sandbox-auth`)  
**Approved Phase 3 Release Checkpoint:** `b4c4b25f634e2f0131b7299570f994f3e6a3502f` (Preserved intact)  

---

## 1. Executive Summary & Product Architecture Mandate

The product owner has established two foundational architectural principles for CollectFlow Phase 4:

1. **Frontend UI/UX Is the Authoritative Reference:**
   The approved Phase 3 frontend experience (screens, TanStack routes, modern SaaS workflows, mobile responsiveness, and design tokens) is formally approved and accepted. The backend exists to power this experience authoritatively. No unnecessary UI redesigns will occur.
2. **Zero Legacy Data Preservation Constraint:**
   CollectFlow is under active pre-production development. There is **no requirement to preserve, migrate, or maintain backward compatibility with legacy development database records or obsolete API contracts**. All existing development data is disposable synthetic fixture data. The database schema and API contracts may be cleanly redesigned from scratch.
3. **Future Financial History Is Legally Immutable:**
   While legacy development records are disposable, the newly engineered application must strictly preserve financial history from the moment production business operations commence. This requires tamper-evident audit logging, double-entry style financial transaction tracking, immutable issued invoices, clear cash/TDS allocations, and explicit cancellation audit records.

### Architecture Options Assessment

| Evaluation Dimension | Option A: Minimal Legacy Integration | Option B: Full Rewrite from Scratch | Option C: Selective Rebuilding & Clean Modular Restructuring (**RECOMMENDED**) |
|---|---|---|---|
| **Core Concept** | Treat legacy backend and SQLite schema as immutable; wrap gaps in frontend adapters. | Discard all backend code and write a new backend without reusing verified security/isolation code. | Rebuild database schema cleanly from scratch; restructure backend into a modular monolith; reuse battle-tested security, isolation, and export utilities. |
| **Data Model Quality** | **Poor:** Burdened by denormalized columns (`customer_name` snapshot quirks in `invoices`), ambiguous order/invoice state, and rigid views. | **High:** Clean schema, but wastes verified engineering work on password security, locks, and CORS. | **Excellent:** Pristine relational schema with proper lifecycle modeling, strict foreign keys, and decimal arithmetic. |
| **Financial Authority** | **Failed:** Relies on client-side approximations for reporting and as-of aging. | **High:** Authoritative, but high implementation delay and regression surface. | **Authoritative:** Backend serves exact reporting aggregations, statutory tax calculations, and strict immutability. |
| **Effort & Risk** | Low upfront, massive ongoing maintenance penalty. | 14–18 Engineering Days; high defect discovery surface. | **7.5–8.5 Engineering Days;** fastest path to a production-grade product. |
| **Verdict** | **REJECTED** | **REJECTED** | **RECOMMENDED** |

---

## 2. Target Architecture: Clean Modular Monolith

CollectFlow will be structured as a **Modular Monolith** in FastAPI, organized into 8 discrete domain packages sharing a unified transactional data layer:

```
                          ┌────────────────────────────────────────────────────────┐
                          │              CollectFlow React Frontend                │
                          │        (Approved Phase 3 Modern SaaS UI/UX)            │
                          │      [Dual-Mode: VITE_API_MODE = 'mock' | 'live']      │
                          └───────────────────────────┬────────────────────────────┘
                                                      │ HTTPS / JSON API
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FastAPI Modular Monolith Core                                  │
│                                                                                                  │
│  ┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────────────────┐ │
│  │ 1. Identity & RBAC Domain │  │ 2. Customer Domain        │  │ 3. Orders & Billing Domain    │ │
│  │  - PBKDF2 Password Hashing│  │  - Master Directory       │  │  - Purchase Orders (Unbilled) │ │
│  │  - Ephemeral Live Sessions│  │  - Credit & GSTIN Master  │  │  - Commercial Invoices (Tax)  │ │
│  │  - Role Dependency Gates  │  │  - Exposure Analytics     │  │  - Legal Immutability Engine  │ │
│  └─────────────┬─────────────┘  └─────────────┬─────────────┘  └───────────────┬───────────────┘ │
│                │                              │                                │                 │
│  ┌─────────────┴─────────────┐  ┌─────────────┴─────────────┐  ┌───────────────┴───────────────┐ │
│  │ 4. Settlement & TDS Domain│  │ 5. Sales Targets Domain   │  │ 6. Reporting & Analytics Hub  │ │
│  │  - Cash / TDS Split (194C)│  │  - Multi-Period Quotas    │  │  - Server Aggregations (KPIs) │ │
│  │  - Overpayment Guards     │  │  - Tax-Exclusive Attain.  │  │  - Dynamic As-Of AR Aging     │ │
│  │  - Administrative Correct.│  │  - Executive Leaderboard  │  │  - 17-Col Excel & CSV Streams │ │
│  └─────────────┬─────────────┘  └─────────────┬─────────────┘  └───────────────┬───────────────┘ │
│                │                              │                                │                 │
│  ┌─────────────┴──────────────────────────────┴────────────────────────────────┴───────────────┐ │
│  │ 7. Statutory References (Indian Financial Years, GST Slabs, TDS Rates, Date Boundaries)     │ │
│  ├─────────────────────────────────────────────────────────────────────────────────────────────┤ │
│  │ 8. Audit & Integrity Core (BEGIN IMMEDIATE Serialization, Append-Only Trail, Redaction)     │ │
│  └──────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
│                                                 │                                                │
│                                                 ▼                                                │
│                        ┌────────────────────────────────────────────────┐                        │
│                        │         Persistence & Concurrency Layer        │                        │
│                        │  Development / CI: SQLite 3 (WAL Mode + FK)   │                        │
│                        │  Target Production: PostgreSQL 16+ Engine      │                        │
│                        │  Schema Management: Versioned Alembic/SQL DDL  │                        │
│                        └────────────────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Strategy: SQLite (Development) & PostgreSQL (Production Target)

### 3.1 Evaluation: Why SQLite for Local Dev and PostgreSQL for Production

Now that legacy database preservation is no longer a constraint, we evaluate the database strategy:

1. **Development & CI/CD Sandbox (SQLite 3 with WAL Mode):**
   - **Zero Operational Overhead:** Embedded, file-based, zero external daemon required, instant test teardown in pytest.
   - **Hardened Isolation:** Verified in Stage 4B with canonical path dereferencing (`os.path.realpath`) preventing symlink attacks against production files.
   - **Concurrency Safety:** Serialized write locks (`BEGIN IMMEDIATE`) eliminate concurrency race conditions in development.
2. **Production Target (PostgreSQL 16+):**
   - **True Row-Level Concurrency:** MVCC without table-level write locks.
   - **Native Decimal Types (`NUMERIC(15,2)`):** Guarantees zero IEEE 754 floating-point drift across queries.
   - **Strict Constraint Enforcement & Native As-Of Ledgering:** Rich date/timestamp functions and window aggregations.
   - **Connection Pooling & Clustering:** Read replicas, high availability, and horizontal scaling.

### 3.2 Maintaining Dialect Compatibility
To allow seamless local development on SQLite while deploying cleanly to PostgreSQL:
- **Avoid SQLite-Specific Hacks:** Do not use `strftime` or non-standard SQL functions in core business queries. Standardize on ISO-8601 strings (`YYYY-MM-DD` and `YYYY-MM-DD HH:MM:SS`) and standard ANSI SQL aggregation.
- **SQLAlchemy 2.0 / Alembic DDL:** Define models using declarative SQLAlchemy 2.0 or versioned migration scripts that map cleanly to both dialects (e.g., `Numeric(15, 2)` maps to `REAL/NUMERIC` in SQLite and `NUMERIC(15, 2)` in Postgres).
- **Exact Decimal Arithmetic in Python:** All currency arithmetic is performed in Python using `Decimal` and quantized via `ROUND_HALF_UP` before write, ensuring identical persistence across database engines.

---

## 4. Rebuilt Database Schema (Clean-Slate Relational Model)

With legacy constraints eliminated, we redesign the schema from scratch. The redesigned schema cleanly models the lifecycle:

```sql
-- ============================================================================
-- 1. REFERENCE & IDENTITY MASTERS
-- ============================================================================

CREATE TABLE financial_years (
    code VARCHAR(20) PRIMARY KEY, -- e.g. 'FY 2026-27'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- SERIAL in Postgres
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'finance', 'sales', 'viewer')),
    full_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_name VARCHAR(150) UNIQUE NOT NULL,
    billing_address TEXT NOT NULL,
    city VARCHAR(50),
    state VARCHAR(50) NOT NULL,
    country VARCHAR(10) NOT NULL DEFAULT 'IN',
    pin_code VARCHAR(20),
    gst_number VARCHAR(20),
    contact_person VARCHAR(100),
    designation VARCHAR(50),
    email VARCHAR(100),
    phone_1 VARCHAR(25),
    phone_2 VARCHAR(25),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. PURCHASE ORDERS & COMMERCIAL INVOICES (SEPARATE LIFECYCLE MODELING)
-- ============================================================================

CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    po_date DATE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    executive_id INTEGER NOT NULL REFERENCES users(id),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    exchange_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    billing_status VARCHAR(20) NOT NULL DEFAULT 'UNBILLED' CHECK (billing_status IN ('UNBILLED', 'CONVERTED', 'CANCELLED')),
    remarks TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE commercial_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER REFERENCES purchase_orders(id), -- Optional link to unbilled PO
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    executive_id INTEGER NOT NULL REFERENCES users(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    exchange_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    
    -- Legal Customer Snapshot at Time of Invoicing (Immutable)
    snapshot_customer_name VARCHAR(150) NOT NULL,
    snapshot_gstin VARCHAR(20),
    snapshot_address TEXT NOT NULL,
    snapshot_state VARCHAR(50) NOT NULL,

    -- Lifecycle & Statutory Status
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ISSUED' CHECK (lifecycle_status IN ('ISSUED', 'CANCELLED')),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP,
    cancelled_by INTEGER REFERENCES users(id),
    remarks TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. SETTLEMENTS, CASH PAYMENTS & TDS ALLOCATIONS
-- ============================================================================

CREATE TABLE payment_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES commercial_invoices(id),
    payment_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (payment_amount >= 0),
    tds_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (tds_amount >= 0),
    total_settled NUMERIC(15, 2) NOT NULL CHECK (total_settled > 0),
    tds_section VARCHAR(20) CHECK (tds_section IN ('194C', '194J', '194H', '194I', 'OTHER')),
    payment_date DATE NOT NULL,
    remittance_number VARCHAR(100),
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('NEFT', 'RTGS', 'CHEQUE', 'UPI', 'CASH', 'WIRE', 'OTHER')),
    notes TEXT,
    idempotency_key VARCHAR(100) UNIQUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. SALES TARGETS & PERFORMANCE QUOTAS
-- ============================================================================

CREATE TABLE sales_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    yearly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    half_yearly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    quarterly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    monthly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    monthly_bottom_line NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    yearly_bottom_line NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fy_code)
);

-- ============================================================================
-- 5. AUDIT & FINANCIAL INTEGRITY TRAIL
-- ============================================================================

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    username VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    details JSON, -- Structured audit state
    ip_address VARCHAR(45),
    request_id VARCHAR(64)
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

---

## 5. Architectural Component Disposition: Rebuild, Refactor, and Reuse

### 5.1 What Can Be Rebuilt from Scratch (Clean-Slate)
1. **Relational Database DDL & Data Models:** Complete fresh schema (above) cleanly segregating `purchase_orders` from `commercial_invoices`.
2. **Server-Side Reporting Engine:** Fresh SQL aggregation functions for AR Aging buckets, Executive Attainment, Collections Ledger, and Dashboard KPIs.
3. **Sales Target Endpoints:** New top-level RESTful API (`/api/targets`) supporting multi-period quota queries and department summaries.
4. **Synthetic Fixture Generator:** High-fidelity, deterministic seed script initializing the exact approved Phase 3 baseline (`INV-2026-042` and `PO-NEXUS-881`).

### 5.2 What Should Be Reused Intact
1. **Database Path & Environment Isolation (`app/database.py`):** Canonical path verification, symlink defense, `COLLECTFLOW_ENV=integration` checks, and loopback listener binding.
2. **Immediate Transaction Write Locks (`transaction()`):** `BEGIN IMMEDIATE` pattern guaranteeing serialized writes in WAL mode.
3. **PBKDF2 Password Hashing & Token Generators (`app/routers/auth.py`):** Secure cryptography with 120,000 iterations and 16-byte random salts.
4. **Exact-Origin CORS Middleware (`app/main.py`):** Strict loopback allowlists rejecting public origins and wildcard `*`.
5. **OpenPyXL Export Engine Core (`app/routers/export.py`):** 17-column layout, header fill `#1F4E79`, currency format `₹#,##0.00`, and formula injection sanitization.

### 5.3 What Must Remain Functionally Compatible with Approved Frontend
1. **TanStack Router Route Hierarchy:** Full compatibility with `/`, `/orders`, `/invoices`, `/payments`, `/customers`, `/sales-targets`, `/performance-analytics`, `/users`, `/reports`, `/ar-aging`, `/settings`, and `/login`.
2. **Frontend Invariants & Financial Baseline:**
   - Total Invoiced: ₹5,31,000
   - Cash Collected: ₹2,00,000
   - TDS Deducted: ₹9,000
   - Settled Amount: ₹2,09,000
   - Outstanding AR: ₹3,22,000
   - Unbilled POs: ₹2,95,000
   - Pinned Reporting Date: 30 April 2026
3. **Dual-Mode ApiClient Contract:** Live mode network calls adhere to standard REST contracts while mock mode remains untouched for offline demonstration.

---

## 6. Financial Integrity, Accounting Controls & Statutory Guarantees

While development data is disposable, the redesigned backend enforces strict business accounting rules:

1. **Exact 2-Decimal Quantization:**
   All amounts are stored as exact 2-decimal numbers. Zero floating-point rounding errors are permitted.
2. **Statutory Invoice Immutability:**
   Once a commercial invoice is issued (`invoice_number` assigned), financial amounts (`exclusive_amount`, `tax_rate`, `total_amount`), customer identity, and issue dates cannot be updated or deleted.
3. **Cancellation Legality & Audit Lock:**
   An issued invoice can only be marked `CANCELLED` if zero payment records exist. If payments exist, cancellation is strictly rejected with HTTP 400. Cancellation requires a mandatory operational reason, sets outstanding balance to ₹0.00, and is recorded in `audit_logs`.
4. **Quota Attainment Rule:**
   Executive sales quota attainment is computed strictly on **tax-exclusive invoiced sales** (`commercial_invoices.exclusive_amount` where `lifecycle_status != 'CANCELLED'`). Unbilled purchase orders are legally excluded from revenue attainment.
5. **Deterministic As-Of AR Aging:**
   Aging buckets are computed dynamically using an explicit parameter `?as_of_date=YYYY-MM-DD` (defaulting to current date if omitted), guaranteeing identical audit reconciliation between frontend and backend.

---

## 7. Phased Implementation Roadmap & Acceptance Gates

```
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 4C Implementation Phases (Clean-Slate Architecture)              │
├───────────────────┬────────────────────────────────────────────────────┤
│ Stage 4C.1        │ Database Clean-Slate & Core Domain Structure       │
│ (Core DB & Master)│ - Deploy clean schema & synthetic seed generator   │
│                   │ - Modularize app/domains/ directory structure      │
├───────────────────┼────────────────────────────────────────────────────┤
│ Stage 4C.2        │ Orders, Commercial Invoices & Conversion Engine    │
│ (Transactions)    │ - Implement purchase_orders & commercial_invoices  │
│                   │ - Enforce conversion workflow & immutability       │
├───────────────────┼────────────────────────────────────────────────────┤
│ Stage 4C.3        │ Settlements, TDS Ledger & Administrative Correct.  │
│ (Settlements)     │ - Implement payment_settlements with 194C/194J     │
│                   │ - Enforce overpayment guards & idempotency replay  │
├───────────────────┼────────────────────────────────────────────────────┤
│ Stage 4C.4        │ Server-Side Reporting Hub & Quota Attainment       │
│ (Analytics)       │ - Build server-side AR Aging, KPIs & Leaderboard   │
│                   │ - Wire frontend Reports Hub to live endpoints      │
├───────────────────┼────────────────────────────────────────────────────┤
│ Stage 4C.5        │ Dual-Mode UAT, Live Browser Acceptance & Review    │
│ (Verification)    │ - Full 15-check Playwright browser regression run  │
│                   │ - Full pytest integration suite execution          │
└───────────────────┴────────────────────────────────────────────────────┘
```

### Stage Gate Acceptance Criteria
- [ ] Fresh synthetic sandbox database seeds verified baseline (`INV-2026-042` and `PO-NEXUS-881`).
- [ ] 100% of backend tests pass against the new modular structure.
- [ ] 100% of frontend Vitest tests pass (537+ tests).
- [ ] All 10 Playwright live browser authentication checks pass against the running sandbox.
- [ ] Reports hub displays exact matching financial invariants across all 4 responsive viewports (1440px, 768px, 390px, 320px).
- [ ] Reset Demo cleanly restores in-memory mock fixtures without side effects on live backend data.

---

## 8. Effort & Risk Analysis

### Relative Effort Estimation

- **Stage 4C.1 (Clean DB & Domain Structure):** 1.5 Engineering Days
- **Stage 4C.2 (Orders & Invoices Domain):** 1.5 Engineering Days
- **Stage 4C.3 (Settlements & TDS Domain):** 1.5 Engineering Days
- **Stage 4C.4 (Reporting Hub & Sales Targets):** 2.0 Engineering Days
- **Stage 4C.5 (Live Browser UAT & Regression):** 1.5 Engineering Days
- **Total Estimated Effort:** **8.0 Engineering Days** (Reduced from 9.0 days because legacy data migration complexity is eliminated).

### Risk Management

| Risk Factor | Impact | Likelihood | Mitigation Strategy |
|---|:---:|:---:|---|
| **Accidental Production DB Overwrite** | Critical | Negligible | Hardened path verification in `app/database.py` strictly prevents startup unless path explicitly contains `sandbox`, `integration`, or `test`. |
| **Frontend/Backend Contract Mismatch** | High | Low | Contracts derived directly from approved frontend TypeScript types in `src/data/`. |
| **Floating-Point Rounding Drifts** | High | Low | Python `Decimal` with `ROUND_HALF_UP` enforced on all monetary operations. |

---
*Report submitted for independent architecture review. Implementation on hold pending formal approval.*
