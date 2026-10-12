# CollectFlow Phase 4 Stage 4C: Target Architecture, Workflow Alignment & Integration Plan

**Document Reference:** `COLLECTFLOW_PHASE4_STAGE4C_INTEGRATION_PLAN.md`  
**Engagement Phase:** Phase 4 — Stage 4C.0 (API Contract Freeze & Financial Domain Specification)  
**Status:** **STAGE 4C.0 COMPLETE — Awaiting Independent Architecture Review**  
**Target Repository:** `/home/anishb/projects/personal/cash-flow-buddy-101`  
**Target File Path:** `docs/plans/COLLECTFLOW_PHASE4_STAGE4C_INTEGRATION_PLAN.md`  
**Frontend Stage 4C Branch:** `feature/phase4-stage4c-api-contracts`  
**Backend Stage 4C Branch:** `feature/phase4-stage4c-api-contracts`  
**Approved Phase 3 Release Checkpoint:** `b4c4b25f634e2f0131b7299570f994f3e6a3502f` (Preserved intact)  

---

## 1. Executive Summary & Product Architecture Mandate

The product owner has established the definitive architectural direction for CollectFlow Phase 4:

1. **Frontend UI/UX Is the Authoritative Reference:**
   The approved Phase 3 frontend experience (screens, TanStack routes, modern SaaS workflows, mobile responsiveness across 1440px, 768px, 390px, 320px viewports, and design tokens) is formally approved and accepted. The backend exists to power this experience authoritatively. No unnecessary UI redesigns will occur.
2. **Zero Legacy Data Preservation Overhead:**
   CollectFlow is under active pre-production development. There is **no requirement to preserve, migrate, or maintain backward compatibility with legacy development database records or obsolete API contracts**. All existing development data is disposable synthetic fixture data. The database schema and API contracts are redesigned cleanly from scratch.
3. **Future Financial History Is Legally Immutable:**
   While legacy development records are disposable, the newly engineered application must strictly preserve financial history from the moment production business operations commence. This requires tamper-evident audit logging, non-destructive settlement adjustments, immutable issued invoices with line-item snapshots, clear cash/TDS allocations, and explicit cancellation audit records.
4. **Target Architecture: Option C (Clean Modular Monolith):**
   A modular FastAPI application backed by a unified PostgreSQL relational persistence layer (with a strict PostgreSQL parity strategy across environments).

---

## 2. Architecture Decision Register (ADR)

| Decision ID | Title | Status | Context & Decision Rationale |
|---|---|:---:|---|
| **ADR-01** | **Modular Monolith Pattern** | **ACCEPTED** | Rather than microservices or an unstructured script bundle, CollectFlow is structured as a Modular Monolith in FastAPI with 8 discrete domain packages sharing a transactional database. Eliminates distributed transaction complexity and latency. |
| **ADR-02** | **PostgreSQL Primary Engine & Parity** | **ACCEPTED** | PostgreSQL 16+ is selected as the authoritative database engine for integration testing, CI, and production. Eliminates dialect divergence and SQLite locking limitations. SQLite is restricted strictly to lightweight, isolated unit-test mocks where explicitly justified. |
| **ADR-03** | **Exact Decimal Monetary Representation** | **ACCEPTED** | All monetary amounts are modeled as `NUMERIC(15, 2)` (or integer minor units in paise where applicable) and handled in Python strictly via `Decimal` with `ROUND_HALF_UP`. Floating-point arithmetic (`float`) is banned from financial paths. |
| **ADR-04** | **Dual-Table Commercial Billing Separation** | **ACCEPTED** | Replaces the legacy overloaded `invoices` table with two distinct tables: `purchase_orders` (unbilled commercial intent) and `commercial_invoices` (legally issued tax invoices). Unbilled orders cannot register settlements. |
| **ADR-05** | **Non-Destructive Financial Event Sourcing** | **ACCEPTED** | Posted payments are immutable financial events. Administrative corrections and reversals do not execute destructive physical `DELETE` queries in the database; instead, they post a compensating negative adjustment event linked to the original payment. |
| **ADR-06** | **OWASP Argon2id Password Security** | **ACCEPTED** | Upgrades authentication from PBKDF2 to Argon2id (memory-hard, resistant to GPU/ASIC cracking), adhering to current OWASP password storage guidelines. |
| **ADR-07** | **Authoritative Server-Side Reporting** | **ACCEPTED** | Replaces client-side aggregations with dedicated backend reporting endpoints for AR Aging, Customer Exposure, Executive Quota Attainment, and Collections. |
| **ADR-08** | **Statutory Invoice Immutability & Cancellation** | **ACCEPTED** | Once issued, invoice numbers and financial totals are legally locked. Invoices with active payments cannot be cancelled. Cancellation requires a mandatory audit reason and records user, timestamp, and audit trail. |

---

## 3. Database Strategy: PostgreSQL Parity Across All Environments

### 3.1 Why PostgreSQL Across Dev, CI, and Production
With legacy SQLite development constraints eliminated, true environment parity is required:
- **Production & Staging:** AWS RDS / Managed PostgreSQL 16+ with WAL replication and connection pooling.
- **Local Integration Testing & CI:** Dedicated Dockerized PostgreSQL 16 container (`postgres:16-alpine`), matching exact extensions, collations, and constraint engines.
- **Lightweight Unit Tests:** In-memory SQLite may remain strictly for fast, isolated repository-layer mocks, provided tests execute against the exact same SQLAlchemy 2.0 declarative mappings.

### 3.2 Concurrency & Transaction Management
- **PostgreSQL Row-Level Locking:** Financial allocations and balance updates execute under transaction isolation using `SELECT ... FOR UPDATE` on the parent invoice row:
  ```python
  # PostgreSQL concurrency lock during payment allocation
  stmt = select(CommercialInvoice).where(CommercialInvoice.id == invoice_id).with_for_update()
  invoice = db.session.execute(stmt).scalar_one_or_none()
  ```
- **Elimination of SQLite Hacks:** The SQLite-specific `BEGIN IMMEDIATE` transaction manager is replaced with standard SQLAlchemy session transaction contexts with explicit pessimistic row locks.

---

## 4. Complete Financial Database Schema Specification

Below is the clean-slate PostgreSQL schema modeling all financial, operational, reference, and security entities:

```sql
-- ============================================================================
-- DOMAIN 1: STATUTORY REFERENCE & IDENTITY MASTERS
-- ============================================================================

CREATE TABLE financial_years (
    code VARCHAR(20) PRIMARY KEY, -- e.g. 'FY 2026-27'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_fy_dates CHECK (start_date < end_date)
);

CREATE TABLE gst_rate_master (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    rate NUMERIC(5, 4) NOT NULL CHECK (rate >= 0.0000 AND rate <= 1.0000), -- e.g. 0.1800
    cgst_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    sgst_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    igst_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tds_section_master (
    id SERIAL PRIMARY KEY,
    section_code VARCHAR(20) UNIQUE NOT NULL, -- e.g. '194C', '194J'
    description TEXT NOT NULL,
    default_rate NUMERIC(5, 4) NOT NULL CHECK (default_rate >= 0.0000),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Argon2id hash string ($argon2id$v=19$...)
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'finance', 'sales', 'viewer')),
    full_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    token_hash VARCHAR(64) PRIMARY KEY, -- SHA-256 of 32-byte secret token
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45)
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(100) NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address VARCHAR(45)
);
CREATE INDEX idx_login_attempts_lookup ON login_attempts(identifier, attempted_at);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DOMAIN 2: PURCHASE ORDERS & UNBILLED OPERATIONS
-- ============================================================================

CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    po_date DATE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    executive_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.000000 CHECK (exchange_rate > 0),
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'UNBILLED' CHECK (status IN ('UNBILLED', 'CONVERTED', 'CANCELLED')),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_po_customer ON purchase_orders(customer_id);
CREATE INDEX idx_po_executive ON purchase_orders(executive_id);
CREATE INDEX idx_po_status ON purchase_orders(status);

CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0)
);
CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);

-- ============================================================================
-- DOMAIN 3: COMMERCIAL TAX INVOICES & IMMUTABLE LINE ITEMS
-- ============================================================================

CREATE TABLE commercial_invoices (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    executive_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.000000 CHECK (exchange_rate > 0),
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),

    -- Immutable Statutory Customer Snapshot at Moment of Invoicing
    snapshot_customer_name VARCHAR(150) NOT NULL,
    snapshot_gstin VARCHAR(20),
    snapshot_billing_address TEXT NOT NULL,
    snapshot_state VARCHAR(50) NOT NULL,

    -- GST Breakdown (Inter-state vs Intra-state)
    cgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    -- Statutory Lifecycle Status
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ISSUED' CHECK (lifecycle_status IN ('ISSUED', 'CANCELLED')),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoices_customer ON commercial_invoices(customer_id);
CREATE INDEX idx_invoices_executive ON commercial_invoices(executive_id);
CREATE INDEX idx_invoices_fy_status ON commercial_invoices(fy_code, lifecycle_status);
CREATE INDEX idx_invoices_due_date ON commercial_invoices(due_date);

CREATE TABLE commercial_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES commercial_invoices(id) ON DELETE RESTRICT,
    item_description TEXT NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000 CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    exclusive_amount NUMERIC(15, 2) NOT NULL CHECK (exclusive_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(15, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0)
);
CREATE INDEX idx_inv_items_invoice ON commercial_invoice_items(invoice_id);

-- ============================================================================
-- DOMAIN 4: FINANCIAL SETTLEMENTS, CASH, TDS & NON-DESTRUCTIVE ADJUSTMENTS
-- ============================================================================

CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES commercial_invoices(id) ON DELETE RESTRICT,
    parent_transaction_id INTEGER REFERENCES payment_transactions(id) ON DELETE RESTRICT, -- Linked original payment on reversal/correction
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('PAYMENT', 'REVERSAL', 'ADJUSTMENT')),
    cash_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00, -- Can be negative for compensating reversals
    tds_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,  -- Can be negative for compensating reversals
    total_settled NUMERIC(15, 2) NOT NULL,            -- cash_amount + tds_amount
    tds_section VARCHAR(20) REFERENCES tds_section_master(section_code),
    payment_date DATE NOT NULL,
    remittance_number VARCHAR(100),
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('NEFT', 'RTGS', 'CHEQUE', 'UPI', 'CASH', 'WIRE', 'OTHER')),
    notes TEXT,
    idempotency_key VARCHAR(100) UNIQUE,
    recorded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_settlement_math CHECK (total_settled = (cash_amount + tds_amount))
);
CREATE INDEX idx_payments_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payments_date ON payment_transactions(payment_date);
CREATE INDEX idx_payments_parent ON payment_transactions(parent_transaction_id);

-- ============================================================================
-- DOMAIN 5: SALES TARGETS & HISTORICAL PERFORMANCE RETENTION
-- ============================================================================

CREATE TABLE sales_targets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- Preserves targets even if user is deactivated
    fy_code VARCHAR(20) NOT NULL REFERENCES financial_years(code),
    yearly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (yearly_target >= 0),
    half_yearly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (half_yearly_target >= 0),
    quarterly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (quarterly_target >= 0),
    monthly_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (monthly_target >= 0),
    monthly_bottom_line NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    yearly_bottom_line NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fy_code)
);
CREATE INDEX idx_targets_lookup ON sales_targets(fy_code, user_id);

-- ============================================================================
-- DOMAIN 6: AUDIT TRAIL, EXPORT ACCESS & SYSTEM SECURITY
-- ============================================================================

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    details JSONB, -- Rich JSON structured before/after state
    ip_address VARCHAR(45),
    request_id VARCHAR(64)
);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE export_tickets (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_export_tickets_expires ON export_tickets(expires_at, used);
```

---

## 5. Exact Financial Invariants & Arithmetic Contracts

### 5.1 Financial Representation & Precision
- **Authoritative Invariant:** Floating-point representations (`float`, `double`) are strictly prohibited in database persistence and backend calculation services.
- **Python Arithmetic:** Evaluated strictly using `from decimal import Decimal, ROUND_HALF_UP`.
- **JSON Serialization:** Financial numbers are transmitted in API payloads as JSON numbers formatted to exactly 2 decimal places (e.g. `531000.00`).

### 5.2 Line-Item vs. Invoice-Total Calculations
1. **Line-Item Arithmetic:**
   $$\text{item.exclusive\_amount} = \text{quantize}(\text{item.quantity} \times \text{item.unit\_price})$$
   $$\text{item.tax\_amount} = \text{quantize}(\text{item.exclusive\_amount} \times \text{item.tax\_rate})$$
   $$\text{item.total\_amount} = \text{item.exclusive\_amount} + \text{item.tax\_amount}$$
2. **Invoice Totals (Sum-of-Items Invariant):**
   $$\text{invoice.exclusive\_amount} = \sum \text{items.exclusive\_amount}$$
   $$\text{invoice.tax\_amount} = \sum \text{items.tax\_amount}$$
   $$\text{invoice.total\_amount} = \text{invoice.exclusive\_amount} + \text{invoice.tax\_amount}$$

### 5.3 GST Breakdown (CGST / SGST / IGST)
- If customer state equals company home state (Intra-state, e.g. Karnataka to Karnataka):
  $$\text{CGST Rate} = \frac{\text{tax\_rate}}{2}, \quad \text{SGST Rate} = \frac{\text{tax\_rate}}{2}, \quad \text{IGST Rate} = 0.0000$$
- If customer state differs from company home state (Inter-state):
  $$\text{IGST Rate} = \text{tax\_rate}, \quad \text{CGST Rate} = 0.0000, \quad \text{SGST Rate} = 0.0000$$

### 5.4 Settlement Allocation & Overpayment Prevention
For any invoice $i$:
$$\text{Total Cash} = \sum_{t \in \text{tx}(i)} t.\text{cash\_amount}, \quad \text{Total TDS} = \sum_{t \in \text{tx}(i)} t.\text{tds\_amount}$$
$$\text{Total Settled} = \text{Total Cash} + \text{Total TDS}$$
$$\text{Outstanding Balance} = \begin{cases} 0.00 & \text{if lifecycle\_status} = \text{'CANCELLED'} \\ \max(0.00, \text{invoice.total\_amount} - \text{Total Settled}) & \text{otherwise} \end{cases}$$

- **Overpayment Guard:** Under database row lock, any transaction where $(\text{Total Settled} + \text{new.total\_settled}) > \text{invoice.total\_amount}$ is rejected with HTTP 400:
  `"Total settlement amount (Cash ₹... + TDS ₹... = ₹...) exceeds the outstanding balance of ₹..."`

### 5.5 Quota Attainment Invariant
Sales achievement is evaluated strictly on **tax-exclusive invoiced sales**:
$$\text{Actual Sales} = \sum \text{exclusive\_amount} \quad \text{for } \text{commercial\_invoices} \text{ where } \text{lifecycle\_status} \neq \text{'CANCELLED'}$$
- **Statutory Exclusion:** Unbilled purchase orders and cancelled invoices are legally excluded from revenue attainment.

---

## 6. Financial History & Non-Destructive Corrections Model

### 6.1 Posted Payment Adjustments
Rather than physically deleting payment rows (which breaks accounting traceability), the administrative correction workflow operates as an auditable replacement:
1. **Reversal Event:** The user requests correction of Payment `#84` (Cash ₹2,00,000, TDS ₹9,000). The system inserts a compensating reversal transaction `#85` (`transaction_type = 'REVERSAL'`, `cash_amount = -200000.00`, `tds_amount = -9000.00`, `parent_transaction_id = 84`).
2. **Replacement Event:** The system inserts the corrected replacement transaction `#86` (`transaction_type = 'PAYMENT'`, `cash_amount = +190000.00`, `tds_amount = +9000.00`, `parent_transaction_id = 84`).
3. **Audit Log:** An event `PAYMENT_CORRECTED` is recorded in `audit_logs` capturing reason, user, and previous vs. new values.
4. **Historical Reconciliation:** Reconstructing AR aging as of any past date $T$ is calculated strictly by summing events where $\text{payment\_date} \le T$.

### 6.2 Invoice Cancellation Controls
- **Statutory Guard:** Cancellation is strictly blocked with HTTP 400 if net settlement on the invoice $> 0.00$. All payments must be formally reversed prior to cancellation.
- **Audit Record:** Cancellation updates `lifecycle_status = 'CANCELLED'`, sets `cancelled_at = NOW()`, `cancelled_by = user.id`, records `cancellation_reason`, and logs `INVOICE_CANCELLED` to `audit_logs`.

---

## 7. Security Architecture: OWASP Argon2id & RBAC

### 7.1 Modern Password Hashing: Argon2id
OWASP explicitly recommends **Argon2id** for password storage:
- **Parameters:** `argon2-cffi` configured with $m=65536$ (64 MiB memory cost), $t=3$ (iterations), $p=4$ (parallelism).
- **Migration Rationale:** Clean-slate development allows immediate adoption of Argon2id without supporting legacy PBKDF2 hashes.

### 7.2 Strict RBAC Matrix

| Role | Customers | Orders Read/Write | Invoices Read | Invoices Write | Payments Record/Correct | Targets View/Manage | Reports Hub | Export Excel/CSV | User Administration |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `admin` | Full | Full | Full | Full | Full | Full | Full | Full | Full |
| `finance` | Full | Full | Full | Full | Full | Full | Full | Full | Blocked (403) |
| `sales` | Read/Create | Unbilled Only | Full | Blocked (403) | Blocked (403) | Own Target Only | Quota Only | Blocked (403) | Blocked (403) |
| `viewer` | Read Only | Read Only | Read Only | Blocked (403) | Blocked (403) | Read Only | Read Only | Blocked (403) | Blocked (403) |

*Export RBAC Policy Note:* The business decision to restrict exports strictly to `admin` and `finance` (blocking `sales` and `viewer`) is preserved as a pending architecture policy, ready for immediate enforcement in Stage 4C.

---

## 8. Complete API Contract Inventory

| HTTP Method & Endpoint | Description & Domain | RBAC Requirement | Expected Input / Output Format |
|---|---|:---:|---|
| `POST /api/auth/login` | Identity authentication | Public | In: `{username, password}` → Out: `{token, user}` |
| `GET /api/auth/me` | Current session user profile | Authenticated | Out: `{authenticated: true, user: UserProfile}` |
| `POST /api/auth/logout` | Session token revocation | Authenticated | Out: `{success: true, message: "Logged out"}` |
| `GET /api/customers` | Master customer directory | Authenticated | Out: `CustomerSummary[]` with financial exposure |
| `POST /api/customers` | Create master customer | `admin`, `finance`, `sales` | In: `CustomerCreatePayload` → Out: `CustomerProfile` |
| `GET /api/orders` | List unbilled purchase orders | Authenticated | Out: `{page, limit, total, data: PurchaseOrder[]}` |
| `POST /api/orders` | Register purchase order | `admin`, `finance`, `sales` | In: `PurchaseOrderCreate` → Out: `PurchaseOrder` |
| `POST /api/orders/{id}/convert` | Convert PO to commercial invoice | `admin`, `finance` | In: `{invoice_number, invoice_date, due_date}` |
| `GET /api/invoices` | List issued commercial invoices | Authenticated | Out: `{page, limit, total, data: InvoiceSummary[]}` |
| `GET /api/invoices/{id}` | Detailed invoice with items/payments | Authenticated | Out: `{invoice, items, payments}` |
| `POST /api/invoices/{id}/cancel` | Statutory invoice cancellation | `admin`, `finance` | In: `{reason: string}` → Out: `{success: true}` |
| `GET /api/payments` | Master settlement ledger | Authenticated | Out: `{data: PaymentLedgerRow[], summary}` |
| `POST /api/payments` | Record settlement (Cash/TDS) | `admin`, `finance` | In: `PaymentCreateInput` (with `idempotency_key`) |
| `POST /api/payments/{id}/correct` | Non-destructive payment adjustment | `admin`, `finance` | In: `{reason, corrected_cash, corrected_tds}` |
| `GET /api/targets` | List sales targets by FY | Authenticated | Out: `{fy_code, targets: SalesTarget[]}` |
| `POST /api/targets/{user_id}` | Set multi-period quota | `admin`, `finance` | In: `TargetUpdatePayload` → Out: `SalesTarget` |
| `GET /api/reporting/summary` | Dashboard KPI summary | Authenticated | Query: `?fy=...&as_of_date=...` → Out: `DashboardKPIs` |
| `GET /api/reporting/ar-aging` | 6-bucket AR Aging analysis | Authenticated | Query: `?as_of_date=...` → Out: `ArAgingReport` |
| `GET /api/reporting/attainment` | Executive attainment leaderboard | Authenticated | Query: `?fy=...` → Out: `ExecutiveAttainmentReport` |
| `POST /api/export/token` | Short-lived single-use export ticket | `admin`, `finance` | Out: `{ticket, expires_in: 300}` |
| `GET /api/export/excel` | 17-column openpyxl Excel stream | `admin`, `finance` | Query: `?ticket=...&fy=...` → `application/vnd...` |
| `GET /api/export/csv` | Formula-sanitized CSV stream | `admin`, `finance` | Query: `?ticket=...&fy=...` → `text/csv` |
| `GET /api/settings/references` | FY, GST, and TDS reference master | Authenticated | Out: `{years, gst_rates, tds_sections}` |
| `GET /api/users` | Master user directory | Authenticated | Out: `UserSummary[]` |
| `POST /api/users` | Create user profile | `admin` | In: `UserCreatePayload` → Out: `UserSummary` |
| `PUT /api/users/{id}/role` | Update user role | `admin` | In: `{role: string}` → Out: `UserSummary` |
| `DELETE /api/users/{id}` | Deactivate user profile | `admin` | Soft deactivation protecting historical financial records |

---

## 9. Phased Implementation Roadmap & Acceptance Gates

To guarantee quality, implementation is structured into small, independently testable stages:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 4C Phased Implementation Roadmap                                                 │
├───────────────────┬────────────────────────────────────────────────────────────────────┤
│ Stage 4C.0        │ Architecture Design & OpenAPI Contract Freeze                      │
│ (0.5 Days)        │ - Pydantic models, JSON schemas & contract freeze                  │
│                   │ - Preflight alignment with frontend src/data/ types                │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.1        │ PostgreSQL Schema, Alembic Migrations & Fixture Seed               │
│ (2.0 Days)        │ - Complete DDL implementation in PostgreSQL 16                     │
│                   │ - Deterministic synthetic seed generator for approved baseline    │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.2        │ Auth, Identity & Master References                                 │
│ (1.5 Days)        │ - Argon2id password hashing & ephemeral live sessions              │
│                   │ - Customer master & GST/TDS reference domain services              │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.3        │ Orders, Invoices & Statutory Conversion Engine                     │
│ (2.0 Days)        │ - Purchase orders, commercial tax invoices & line items            │
│                   │ - Legal immutability guards & cancellation audit workflow          │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.4        │ Payments, TDS Ledger & Non-Destructive Adjustments                 │
│ (1.5 Days)        │ - payment_transactions with 194C/194J validations                  │
│                   │ - Overpayment checks under row lock & compensating adjustments     │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.5        │ Sales Targets & Server-Side Reporting Hub                          │
│ (2.0 Days)        │ - Server-side AR Aging (6 buckets), Attainment, and Dashboard KPIs │
│                   │ - 17-column openpyxl Excel & CSV streaming exports                 │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ Stage 4C.6        │ End-to-End Live Integration, Playwright UAT & Review               │
│ (1.5 Days)        │ - Live multi-viewport Playwright suite (1440px, 768px, 390px, 320px)│
│                   │ - Final financial reconciliation & STAGE_4C_REVIEW.md report       │
└───────────────────┴────────────────────────────────────────────────────────────────────┘
```

**Total Realistic Effort Estimate:** **11.0 Engineering Days** (Detailed breakdown based on explicit entity modeling, PostgreSQL parity setup, Argon2id adoption, and end-to-end multi-viewport browser verification).

---

## 10. Automated Test & Verification Matrix

| Verification Tier | Target & Tooling | Success Criteria | Scope |
|---|---|---|---|
| **Tier 1: Backend Unit & Concurrency** | pytest + PostgreSQL Test Container | 100% Pass (100+ tests) | Exact decimal arithmetic, GST splitting, overpayment rejection, row-lock concurrency, Argon2id hashing. |
| **Tier 2: Frontend Integration** | Vitest (`npm test`) | 100% Pass (537+ tests) | Type-safe `ApiClient` contracts, offline mock mode regression, form validation. |
| **Tier 3: Live Browser Acceptance** | Playwright (`chromium`) | 100% Pass (20+ tests) | Real browser authentication, order creation, invoice conversion, settlement ledger, Reports Hub live rendering. |
| **Tier 4: Responsive Verification** | Playwright Viewports | 100% Pass (4 viewports) | 1440px desktop, 768px tablet, 390px mobile, 320px narrow mobile with zero horizontal overflow or clipping. |
| **Tier 5: Financial Invariant Audit** | Automated Script | Exact Match (0.00 delta) | Total Invoiced: ₹5,31,000, Settled: ₹2,09,000, Outstanding: ₹3,22,000, Unbilled: ₹2,95,000. |

---

## 11. Open Business-Policy Decisions for Product Owner

1. **Export RBAC Business Policy:** The backend currently allows all authenticated roles to download exports. The proposed architecture enforces `admin` and `finance` only (blocking `sales` and `viewer`). Requires formal confirmation.
2. **Customer Soft Deactivation Policy:** When a customer is marked inactive, should open purchase orders remain convertible to invoices, or must all active orders be resolved before deactivation?
3. **Foreign Currency Settlements:** Should payments against USD/EUR invoices be recorded in foreign currency with realized forex gain/loss calculations, or converted to INR at the invoice exchange rate?

---

## 12. Stage 4C.1 Completion Record & Schema Artifacts

- **Stage:** Stage 4C.1 — PostgreSQL Database Foundation, SQLAlchemy Domain Models, Alembic Migrations and Synthetic Fixture Initialization
- **Status:** **PASS** (100% verified locally)
- **PostgreSQL Version:** PostgreSQL 16 Alpine (`127.0.0.1:5432`, container `collectflow-postgres-dev`)
- **Alembic Revision:** `e9ee322f8b96` (`create_collectflow_v1_domain_schema`)
- **Table Inventory (15 Domain Tables + Alembic):**
  1. `financial_years`
  2. `gst_rate_master`
  3. `tds_section_master`
  4. `users`
  5. `sessions`
  6. `login_attempts`
  7. `customers`
  8. `purchase_orders`
  9. `purchase_order_items`
  10. `commercial_invoices`
  11. `commercial_invoice_items`
  12. `payment_transactions`
  13. `sales_targets`
  14. `audit_logs`
  15. `export_tickets`
- **Synthetic Fixtures Seeded:**
  - Invoice: `INV-2026-042` (Gross ₹5,31,000.00, Tax ₹81,000.00, Excl ₹45,0000.00)
  - Purchase Order: `PO-NEXUS-881` (Gross ₹2,95,000.00, Tax ₹45,000.00, Excl ₹2,50,000.00)
  - Settlement: `REM-2026-001` (Cash ₹2,00,000.00, TDS ₹9,000.00 under 194C, Settled ₹2,09,000.00, Outstanding ₹3,22,000.00)
  - Users: `sandbox_admin`, `sandbox_finance`, `sandbox_sales`, `sandbox_viewer` with Argon2id hashes.
  - Sales Target: FY 2026-27 target for `sandbox_sales` at ₹75,00,000.00.
- **Verification Evidence:**
  - PostgreSQL automated tests: 6 passed (`tests/test_postgres_domain_models.py`)
  - Backend contract tests: 3 passed (`tests/contracts/test_domain_contracts.py`)
  - Frontend test suite: 543 passed across 38 test suites (`npm test`)
- **Branch Checkpoints:**
  - Frontend: `feature/phase4-stage4c1-postgres-models`
  - Backend: `feature/phase4-stage4c1-postgres-models`

---
*Report submitted for final architecture review. Implementation on hold pending formal approval.*

