/**
 * CollectFlow Reports Hub Component (Design B)
 * Implements R2: Reports Hub & Financial Reconciliation
 * 5 Authoritative Reports:
 * 1. Invoices & Receivables
 * 2. Collections & Payments Ledger
 * 3. Customer Sales & Exposure Summary
 * 4. Executive Attainment & Quota Summary
 * 5. AR Aging Summary
 */

import { useState, useMemo } from "react";
import {
  FileText,
  Wallet,
  Landmark,
  Receipt,
  Gauge,
  Users,
  Target,
  Clock,
  ArrowUpDown,
  Search,
  SlidersHorizontal,
  FileSpreadsheet,
  Download,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Layers,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FilterChoice, EmptyState } from "./controls";
import { money, data, type Invoice } from "@/data/collectflow";
import { type Role, dateLabel, labelStatus } from "@/data/records";
import {
  getInvoicesReceivablesReport,
  getPaymentsLedgerReport,
  getCustomerExposureReport,
  getExecutiveAttainmentReport,
  getArAgingReport,
  type ReportFilterScope,
  type AgingBucket,
} from "@/data/reporting";
import { readInitialTargets, type SalesTarget } from "@/data/targets";
import { ExportDrawer } from "./export-drawer";
import { useMockSession } from "./session";

function useOptionalSession() {
  try {
    return useMockSession();
  } catch {
    return null;
  }
}

export type ReportTab = "invoices" | "payments" | "customers" | "executives" | "aging";

export interface ReportsHubProps {
  fy?: string;
  role?: Role;
  empty?: boolean;
  records?: Invoice[];
  targets?: SalesTarget[];
  container?: HTMLElement | null | undefined;
  onOpenExport?: () => void;
  className?: string;
}

export function ReportsHub({
  fy: fyProp,
  role: _roleProp,
  empty = false,
  records: recordsProp,
  targets: targetsProp,
  container,
  onOpenExport,
  className = "",
}: ReportsHubProps) {
  const session = useOptionalSession();
  const sessionFy = session?.fy ?? "FY 2026-27";
  const defaultFy = fyProp ?? sessionFy;

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReportTab>("invoices");

  // Filter States
  const [selectedFy, setSelectedFy] = useState<string>(defaultFy);
  const [customerFilter, setCustomerFilter] = useState("All customers");
  const [executiveFilter, setExecutiveFilter] = useState("All executives");
  const [searchQuery, setSearchQuery] = useState("");

  // Table Sort State
  const [sortField, setSortField] = useState<string>("default");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<string>("10");

  // Internal Export Drawer State (if onOpenExport not provided)
  const [localExportOpen, setLocalExportOpen] = useState(false);

  // Raw Datasets
  const allRecords = useMemo(
    () => (empty ? [] : (recordsProp ?? session?.demo?.invoices ?? data.invoices)),
    [empty, recordsProp, session?.demo?.invoices],
  );
  const allTargets = useMemo(
    () => targetsProp ?? session?.targets ?? readInitialTargets(),
    [targetsProp, session?.targets],
  );
  const allCustomers = useMemo(
    () => session?.references?.customers ?? data.customers,
    [session?.references?.customers],
  );

  // Distinct Filter Option Lists
  const fyOptions = ["FY 2026-27", "FY 2025-26", "FY 2024-25", "ALL"];
  const customerOptions = useMemo(() => {
    const names = Array.from(new Set(allRecords.map((r) => r.customer_name))).filter(Boolean);
    return ["All customers", ...names];
  }, [allRecords]);
  const executiveOptions = useMemo(() => {
    const names = Array.from(new Set(allRecords.map((r) => r.executive_name))).filter(Boolean);
    return ["All executives", ...names];
  }, [allRecords]);

  // Current Filter Scope Object
  const filterScope: ReportFilterScope = useMemo(
    () => ({
      fy: selectedFy,
      customer: customerFilter,
      executive: executiveFilter,
      query: searchQuery,
    }),
    [selectedFy, customerFilter, executiveFilter, searchQuery],
  );

  // Pinned Reporting Date for AR Aging
  const pinnedReportingDate = "2026-04-30";

  // Computed Reports
  const invoicesReport = useMemo(
    () => getInvoicesReceivablesReport(allRecords, filterScope, pinnedReportingDate),
    [allRecords, filterScope, pinnedReportingDate],
  );

  const paymentsReport = useMemo(
    () => getPaymentsLedgerReport(allRecords, filterScope),
    [allRecords, filterScope],
  );

  const customerReport = useMemo(
    () => getCustomerExposureReport(allRecords, allCustomers, filterScope, pinnedReportingDate),
    [allRecords, allCustomers, filterScope, pinnedReportingDate],
  );

  const executiveReport = useMemo(
    () => getExecutiveAttainmentReport(allRecords, allTargets, filterScope),
    [allRecords, allTargets, filterScope],
  );

  const agingReport = useMemo(
    () => getArAgingReport(allRecords, pinnedReportingDate, filterScope),
    [allRecords, pinnedReportingDate, filterScope],
  );

  // Reset Filters Handler
  function handleResetFilters() {
    setSelectedFy(defaultFy);
    setCustomerFilter("All customers");
    setExecutiveFilter("All executives");
    setSearchQuery("");
    setPage(1);
    setSortField("default");
  }

  // Handle Sort Change
  function handleSort(field: string) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  // Handle Export Action
  function handleExport() {
    if (onOpenExport) {
      onOpenExport();
    } else {
      setLocalExportOpen(true);
    }
  }

  // Tab definitions
  const tabs = [
    { id: "invoices", label: "Invoices & Receivables", icon: FileText, testId: "tab-invoices" },
    { id: "payments", label: "Collections Ledger", icon: Wallet, testId: "tab-payments" },
    { id: "customers", label: "Customer Exposure", icon: Building, testId: "tab-customers" },
    { id: "executives", label: "Executive Attainment", icon: Target, testId: "tab-executives" },
    { id: "aging", label: "AR Aging Summary", icon: Gauge, testId: "tab-aging" },
  ] as const;

  return (
    <div className={`cf-reports-hub ${className}`} data-testid="reports-hub">
      {/* Informational Exclusion Callout Banner */}
      <div
        className="cf-exclusion-banner"
        role="region"
        aria-label="Financial Exclusion Notes"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          background: "var(--cf-card-bg, #ffffff)",
          border: "1px solid var(--cf-border-color, #e2e8f0)",
          borderLeft: "4px solid #3b82f6",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "20px",
          fontSize: "13px",
          lineHeight: "1.5",
        }}
      >
        <Info size={18} style={{ color: "#2563eb", flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong
            style={{
              display: "block",
              color: "var(--cf-text-primary, #0f172a)",
              marginBottom: "2px",
            }}
          >
            Authoritative Financial Reconciliation & Exclusions
          </strong>
          <span style={{ color: "var(--cf-text-secondary, #475569)" }}>
            Unbilled order <strong>PO-NEXUS-881</strong> (₹2,50,000 exclusive / ₹2,95,000 gross;
            unbilled baseline ₹2,95,000) is strictly excluded from invoiced revenue and quota
            attainment. Cancelled invoice <strong>INV-2026-041</strong> is strictly excluded from
            receivables and gross revenue. All reports reconcile with the approved Stage 3–5
            financial invariants.
          </span>
        </div>
      </div>

      {/* Primary Filter Tools Bar & Export Action */}
      <div
        className="cf-table-tools"
        style={{ marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}
      >
        <div className="cf-table-search" style={{ minWidth: "220px", flex: "1 1 auto" }}>
          <Search size={18} />
          <Input
            aria-label="Search reports"
            placeholder="Search invoice, PO, customer, or remittance..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            data-testid="reports-search-input"
          />
        </div>

        <FilterChoice
          label="Financial year"
          value={selectedFy}
          options={fyOptions}
          onChange={(val) => {
            setSelectedFy(val);
            setPage(1);
          }}
        />

        <FilterChoice
          label="Customer filter"
          value={customerFilter}
          options={customerOptions}
          onChange={(val) => {
            setCustomerFilter(val);
            setPage(1);
          }}
        />

        <FilterChoice
          label="Executive filter"
          value={executiveFilter}
          options={executiveOptions}
          onChange={(val) => {
            setExecutiveFilter(val);
            setPage(1);
          }}
        />

        <Button
          variant="outline"
          size="icon"
          title="Reset filters"
          aria-label="Reset filters"
          onClick={handleResetFilters}
          data-testid="reset-filters-btn"
        >
          <SlidersHorizontal size={16} />
        </Button>

        <Button
          variant="default"
          onClick={handleExport}
          className="cf-export-btn"
          data-testid="export-report-btn"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <FileSpreadsheet size={16} />
          <span>Export Report</span>
        </Button>
      </div>

      {/* 5-Tab Navigation Bar */}
      <div
        className="cf-segments"
        role="tablist"
        aria-label="Report Views Navigation"
        style={{ marginBottom: "20px", overflowX: "auto", display: "flex", gap: "4px" }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              role="tab"
              aria-selected={isSelected}
              aria-pressed={isSelected}
              onClick={() => {
                setActiveTab(tab.id as ReportTab);
                setPage(1);
                setSortField("default");
              }}
              className={`cf-tab-item ${isSelected ? "active" : ""}`}
              data-testid={tab.testId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: isSelected ? 600 : 400,
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Active Report View Content */}
      {activeTab === "invoices" && (
        <InvoicesReceivablesView
          report={invoicesReport}
          sortField={sortField}
          sortAsc={sortAsc}
          onSort={handleSort}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          empty={empty}
          onReset={handleResetFilters}
        />
      )}

      {activeTab === "payments" && (
        <PaymentsLedgerView
          report={paymentsReport}
          sortField={sortField}
          sortAsc={sortAsc}
          onSort={handleSort}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          empty={empty}
          onReset={handleResetFilters}
        />
      )}

      {activeTab === "customers" && (
        <CustomerExposureView
          report={customerReport}
          sortField={sortField}
          sortAsc={sortAsc}
          onSort={handleSort}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          empty={empty}
          onReset={handleResetFilters}
        />
      )}

      {activeTab === "executives" && (
        <ExecutiveAttainmentView
          report={executiveReport}
          sortField={sortField}
          sortAsc={sortAsc}
          onSort={handleSort}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          empty={empty}
          onReset={handleResetFilters}
        />
      )}

      {activeTab === "aging" && (
        <ArAgingSummaryView
          report={agingReport}
          sortField={sortField}
          sortAsc={sortAsc}
          onSort={handleSort}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          empty={empty}
          onReset={handleResetFilters}
        />
      )}

      {/* Self-contained Export Drawer if local */}
      {localExportOpen && (
        <ExportDrawer
          initialFy={selectedFy === "ALL" ? "FY 2026-27" : selectedFy}
          container={container}
          close={() => setLocalExportOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 1. Invoices & Receivables View
// ============================================================================
function InvoicesReceivablesView({
  report,
  sortField,
  sortAsc,
  onSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  empty,
  onReset,
}: {
  report: ReturnType<typeof getInvoicesReceivablesReport>;
  sortField: string;
  sortAsc: boolean;
  onSort: (field: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: string;
  setPageSize: (s: string) => void;
  empty: boolean;
  onReset: () => void;
}) {
  const { rows, summary } = report;

  const sortedRows = useMemo(() => {
    if (sortField === "default") return rows;
    return [...rows].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortField];
      const valB = (b as unknown as Record<string, unknown>)[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [rows, sortField, sortAsc]);

  const countPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / countPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * countPerPage,
    currentPage * countPerPage,
  );

  return (
    <div data-testid="invoices-report-view">
      {/* KPI Cards */}
      <section
        className="cf-metrics"
        aria-label="Invoices & Receivables KPIs"
        style={{ marginBottom: "20px" }}
      >
        <article className="cf-metric" data-testid="kpi-invoiced-gross">
          <div>
            <span>Gross Invoiced</span>
            <FileText size={20} />
          </div>
          <strong>{money(summary.total_invoiced)}</strong>
          <small>
            {summary.count} issued invoice{summary.count === 1 ? "" : "s"}
          </small>
        </article>

        <article className="cf-metric cf-metric-primary" data-testid="kpi-outstanding-receivables">
          <div>
            <span>Outstanding Balance</span>
            <Wallet size={20} />
          </div>
          <strong>{money(summary.total_outstanding)}</strong>
          <small>Unsettled issued balance</small>
        </article>

        <article className="cf-metric" data-testid="kpi-total-settled">
          <div>
            <span>Total Settled</span>
            <Landmark size={20} />
          </div>
          <strong>{money(summary.total_settled)}</strong>
          <small>
            Cash {money(summary.total_cash)} · TDS {money(summary.total_tds)}
          </small>
        </article>

        <article className="cf-metric" data-testid="kpi-collection-rate">
          <div>
            <span>Collection Rate</span>
            <Gauge size={20} />
          </div>
          <strong>{summary.collection_rate}%</strong>
          <small>Settled / Gross Invoiced</small>
        </article>
      </section>

      {/* Exclusion Note Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Badge variant="secondary">Exclusion Guard Active</Badge>
        <span className="cf-muted" style={{ fontSize: "13px" }}>
          Unbilled order PO-NEXUS-881 (₹2,95,000) and cancelled invoices strictly excluded from
          gross invoiced and receivables.
        </span>
      </div>

      {empty || paginatedRows.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        <>
          {/* Desktop Responsive Table */}
          <div className="cf-table-container">
            <table className="cf-table" data-testid="invoices-report-table">
              <thead>
                <tr>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("invoice_number")}>
                      Invoice Number <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("customer_name")}>
                      Customer <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("executive_name")}>
                      Executive <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("exclusive_amount")}>
                      Exclusive (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_amount")}>
                      Gross Total (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_paid")}>
                      Settled (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("outstanding_balance")}>
                      Outstanding (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("due_date")}>
                      Due Date <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("computed_status")}>
                      Status <ArrowUpDown size={13} />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.id} data-testid={`invoice-row-${row.id}`}>
                    <td>
                      <strong>{row.invoice_number}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        PO: {row.po_number}
                      </small>
                    </td>
                    <td>
                      <strong>{row.customer_name}</strong>
                    </td>
                    <td>{row.executive_name}</td>
                    <td className="cf-number">{money(row.exclusive_amount)}</td>
                    <td className="cf-number">
                      <strong>{money(row.total_amount)}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        Tax: {money(row.tax_amount)}
                      </small>
                    </td>
                    <td className="cf-number">
                      <strong>{money(row.total_paid)}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        Cash {money(row.total_cash_paid)} · TDS {money(row.total_tds_deducted)}
                      </small>
                    </td>
                    <td className="cf-number cf-balance">
                      <strong>{money(row.outstanding_balance)}</strong>
                    </td>
                    <td>
                      {dateLabel(row.due_date)}
                      <small
                        style={{
                          display: "block",
                          color: row.days_overdue > 0 ? "#ef4444" : "var(--cf-text-secondary)",
                        }}
                      >
                        {row.days_overdue > 0
                          ? `${row.days_overdue} days overdue`
                          : "0 days overdue"}
                      </small>
                    </td>
                    <td>
                      <span className={`cf-status ${row.computed_status.toLowerCase()}`}>
                        {labelStatus(row.computed_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards */}
          <div className="cf-mobile-cards" data-testid="invoices-report-cards">
            {paginatedRows.map((row) => (
              <article className="cf-record-card" key={row.id}>
                <header>
                  <strong>{row.invoice_number}</strong>
                  <span className={`cf-status ${row.computed_status.toLowerCase()}`}>
                    {labelStatus(row.computed_status)}
                  </span>
                </header>
                <h3>{row.customer_name}</h3>
                <dl>
                  <div>
                    <dt>Gross Total</dt>
                    <dd>{money(row.total_amount)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className="cf-balance">{money(row.outstanding_balance)}</dd>
                  </div>
                  <div>
                    <dt>Settled</dt>
                    <dd>{money(row.total_paid)}</dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{dateLabel(row.due_date)}</dd>
                  </div>
                  <div>
                    <dt>Executive</dt>
                    <dd>{row.executive_name}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Pagination Footer */}
          <footer className="cf-table-footer" style={{ marginTop: "16px" }}>
            <span>
              {sortedRows.length
                ? `${(currentPage - 1) * countPerPage + 1}–${Math.min(currentPage * countPerPage, sortedRows.length)} of ${sortedRows.length} records`
                : "0 records"}
            </span>
            <div>
              <FilterChoice
                label="Rows per page"
                value={pageSize}
                options={["5", "10", "25"]}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 2. Collections & Payments Ledger View
// ============================================================================
function PaymentsLedgerView({
  report,
  sortField,
  sortAsc,
  onSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  empty,
  onReset,
}: {
  report: ReturnType<typeof getPaymentsLedgerReport>;
  sortField: string;
  sortAsc: boolean;
  onSort: (field: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: string;
  setPageSize: (s: string) => void;
  empty: boolean;
  onReset: () => void;
}) {
  const { rows, summary } = report;

  const sortedRows = useMemo(() => {
    if (sortField === "default") return rows;
    return [...rows].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortField];
      const valB = (b as unknown as Record<string, unknown>)[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [rows, sortField, sortAsc]);

  const countPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / countPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * countPerPage,
    currentPage * countPerPage,
  );

  return (
    <div data-testid="payments-report-view">
      {/* KPI Cards */}
      <section
        className="cf-metrics"
        aria-label="Collections KPIs"
        style={{ marginBottom: "20px" }}
      >
        <article className="cf-metric" data-testid="kpi-cash-collected">
          <div>
            <span>Cash Received</span>
            <Landmark size={20} />
          </div>
          <strong>{money(summary.total_cash)}</strong>
          <small>Physical bank receipts</small>
        </article>

        <article className="cf-metric" data-testid="kpi-tds-deducted">
          <div>
            <span>TDS Recognized</span>
            <Receipt size={20} />
          </div>
          <strong>{money(summary.total_tds)}</strong>
          <small>Statutory tax credits</small>
        </article>

        <article className="cf-metric cf-metric-primary" data-testid="kpi-payments-settled">
          <div>
            <span>Total Settlement</span>
            <Wallet size={20} />
          </div>
          <strong>{money(summary.total_settled)}</strong>
          <small>Cash + TDS recognized</small>
        </article>

        <article className="cf-metric" data-testid="kpi-transaction-count">
          <div>
            <span>Transactions</span>
            <FileText size={20} />
          </div>
          <strong>{summary.transaction_count}</strong>
          <small>Recorded remittances</small>
        </article>
      </section>

      {empty || paginatedRows.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="cf-table-container">
            <table className="cf-table" data-testid="payments-report-table">
              <thead>
                <tr>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("payment_date")}>
                      Payment Date <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("remittance_number")}>
                      Remittance / UTR <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("invoice_number")}>
                      Invoice Number <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("customer_name")}>
                      Customer <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("payment_mode")}>
                      Mode <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("tds_section")}>
                      TDS Section <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("payment_amount")}>
                      Cash (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("tds_amount")}>
                      TDS (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_settled")}>
                      Total Settled (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.id} data-testid={`payment-row-${row.id}`}>
                    <td>{dateLabel(row.payment_date)}</td>
                    <td>
                      <strong>{row.remittance_number}</strong>
                    </td>
                    <td>
                      <strong>{row.invoice_number}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        PO: {row.po_number}
                      </small>
                    </td>
                    <td>{row.customer_name}</td>
                    <td>
                      <Badge variant="outline">{row.payment_mode}</Badge>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--cf-text-secondary)" }}>
                        {row.tds_section}
                      </span>
                    </td>
                    <td className="cf-number">{money(row.payment_amount)}</td>
                    <td className="cf-number">{money(row.tds_amount)}</td>
                    <td className="cf-number">
                      <strong>{money(row.total_settled)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="cf-mobile-cards" data-testid="payments-report-cards">
            {paginatedRows.map((row) => (
              <article className="cf-record-card" key={row.id}>
                <header>
                  <strong>{row.remittance_number}</strong>
                  <Badge variant="outline">{row.payment_mode}</Badge>
                </header>
                <h3>{row.customer_name}</h3>
                <dl>
                  <div>
                    <dt>Total Settled</dt>
                    <dd className="cf-balance">{money(row.total_settled)}</dd>
                  </div>
                  <div>
                    <dt>Cash Received</dt>
                    <dd>{money(row.payment_amount)}</dd>
                  </div>
                  <div>
                    <dt>TDS Deducted</dt>
                    <dd>{money(row.tds_amount)}</dd>
                  </div>
                  <div>
                    <dt>Invoice</dt>
                    <dd>{row.invoice_number}</dd>
                  </div>
                  <div>
                    <dt>Payment Date</dt>
                    <dd>{dateLabel(row.payment_date)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <footer className="cf-table-footer" style={{ marginTop: "16px" }}>
            <span>
              {sortedRows.length
                ? `${(currentPage - 1) * countPerPage + 1}–${Math.min(currentPage * countPerPage, sortedRows.length)} of ${sortedRows.length} transactions`
                : "0 transactions"}
            </span>
            <div>
              <FilterChoice
                label="Rows per page"
                value={pageSize}
                options={["5", "10", "25"]}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 3. Customer Sales & Exposure Summary View
// ============================================================================
function CustomerExposureView({
  report,
  sortField,
  sortAsc,
  onSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  empty,
  onReset,
}: {
  report: ReturnType<typeof getCustomerExposureReport>;
  sortField: string;
  sortAsc: boolean;
  onSort: (field: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: string;
  setPageSize: (s: string) => void;
  empty: boolean;
  onReset: () => void;
}) {
  const { rows, summary } = report;

  const sortedRows = useMemo(() => {
    if (sortField === "default") return rows;
    return [...rows].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortField];
      const valB = (b as unknown as Record<string, unknown>)[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [rows, sortField, sortAsc]);

  const countPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / countPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * countPerPage,
    currentPage * countPerPage,
  );

  return (
    <div data-testid="customers-report-view">
      {/* KPI Cards */}
      <section
        className="cf-metrics"
        aria-label="Customer Exposure KPIs"
        style={{ marginBottom: "20px" }}
      >
        <article className="cf-metric" data-testid="kpi-customer-billed">
          <div>
            <span>Billed Exposure</span>
            <Building size={20} />
          </div>
          <strong>{money(summary.total_billed)}</strong>
          <small>
            {summary.customer_count} client account{summary.customer_count === 1 ? "" : "s"}
          </small>
        </article>

        <article className="cf-metric cf-metric-primary" data-testid="kpi-customer-outstanding">
          <div>
            <span>Outstanding Receivables</span>
            <Wallet size={20} />
          </div>
          <strong>{money(summary.total_outstanding)}</strong>
          <small>Current receivables exposure</small>
        </article>

        <article className="cf-metric" data-testid="kpi-customer-settled">
          <div>
            <span>Total Settled</span>
            <Landmark size={20} />
          </div>
          <strong>{money(summary.total_settled)}</strong>
          <small>
            Cash {money(summary.total_cash)} · TDS {money(summary.total_tds)}
          </small>
        </article>

        <article className="cf-metric" data-testid="kpi-customer-overdue">
          <div>
            <span>Overdue Exposure</span>
            <Clock size={20} />
          </div>
          <strong>{money(summary.total_overdue)}</strong>
          <small>Past-due receivables</small>
        </article>
      </section>

      {empty || paginatedRows.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="cf-table-container">
            <table className="cf-table" data-testid="customers-report-table">
              <thead>
                <tr>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("customer_name")}>
                      Customer Name <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("state")}>
                      State / Location <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_orders")}>
                      Orders <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_billed")}>
                      Total Billed (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("total_settled")}>
                      Total Settled (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("outstanding_balance")}>
                      Outstanding (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("unbilled_value")}>
                      Unbilled POs (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.customer_id} data-testid={`customer-row-${row.customer_id}`}>
                    <td>
                      <strong>{row.customer_name}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        GSTIN: {row.gstin}
                      </small>
                    </td>
                    <td>{row.state}</td>
                    <td className="cf-number">{row.total_orders}</td>
                    <td className="cf-number">
                      <strong>{money(row.total_billed)}</strong>
                    </td>
                    <td className="cf-number">
                      <strong>{money(row.total_settled)}</strong>
                    </td>
                    <td className="cf-number cf-balance">
                      <strong>{money(row.outstanding_balance)}</strong>
                    </td>
                    <td className="cf-number">
                      {row.unbilled_value > 0 ? (
                        <span style={{ color: "#d97706", fontWeight: 500 }}>
                          {money(row.unbilled_value)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {row.outstanding_balance > 0 ? (
                        <Badge
                          variant="outline"
                          style={{ borderColor: "#f59e0b", color: "#b45309" }}
                        >
                          Active Balance
                        </Badge>
                      ) : row.unbilled_value > 0 ? (
                        <Badge variant="secondary">Unbilled Orders</Badge>
                      ) : (
                        <Badge variant="outline">Settled</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="cf-mobile-cards" data-testid="customers-report-cards">
            {paginatedRows.map((row) => (
              <article className="cf-record-card" key={row.customer_id}>
                <header>
                  <strong>{row.customer_name}</strong>
                  <span>{row.state}</span>
                </header>
                <dl>
                  <div>
                    <dt>Billed</dt>
                    <dd>{money(row.total_billed)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className="cf-balance">{money(row.outstanding_balance)}</dd>
                  </div>
                  <div>
                    <dt>Settled</dt>
                    <dd>{money(row.total_settled)}</dd>
                  </div>
                  {row.unbilled_value > 0 && (
                    <div>
                      <dt>Unbilled POs</dt>
                      <dd style={{ color: "#d97706" }}>{money(row.unbilled_value)}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <footer className="cf-table-footer" style={{ marginTop: "16px" }}>
            <span>
              {sortedRows.length
                ? `${(currentPage - 1) * countPerPage + 1}–${Math.min(currentPage * countPerPage, sortedRows.length)} of ${sortedRows.length} clients`
                : "0 clients"}
            </span>
            <div>
              <FilterChoice
                label="Rows per page"
                value={pageSize}
                options={["5", "10", "25"]}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 4. Executive Attainment & Quota Summary View
// ============================================================================
function ExecutiveAttainmentView({
  report,
  sortField,
  sortAsc,
  onSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  empty,
  onReset,
}: {
  report: ReturnType<typeof getExecutiveAttainmentReport>;
  sortField: string;
  sortAsc: boolean;
  onSort: (field: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: string;
  setPageSize: (s: string) => void;
  empty: boolean;
  onReset: () => void;
}) {
  const { rows, summary } = report;

  const sortedRows = useMemo(() => {
    if (sortField === "default") return rows;
    return [...rows].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortField];
      const valB = (b as unknown as Record<string, unknown>)[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [rows, sortField, sortAsc]);

  const countPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / countPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * countPerPage,
    currentPage * countPerPage,
  );

  return (
    <div data-testid="executives-report-view">
      {/* KPI Cards */}
      <section
        className="cf-metrics"
        aria-label="Executive Attainment KPIs"
        style={{ marginBottom: "20px" }}
      >
        <article className="cf-metric" data-testid="kpi-annual-quota">
          <div>
            <span>Annual Quota</span>
            <Target size={20} />
          </div>
          <strong>{money(summary.total_target)}</strong>
          <small>
            {summary.is_filtered
              ? `${summary.executive_count} of ${summary.unfiltered_executive_count ?? summary.executive_count} representatives (Filtered)`
              : `${summary.executive_count} sales representative${summary.executive_count === 1 ? "" : "s"}`}
          </small>
        </article>

        <article className="cf-metric" data-testid="kpi-actual-invoiced-sales">
          <div>
            <span>Actual Sales (Excl.)</span>
            <FileText size={20} />
          </div>
          <strong>{money(summary.total_actual_sales)}</strong>
          <small>
            {summary.is_filtered
              ? "Tax-exclusive invoiced sales (Filtered)"
              : "Tax-exclusive invoiced sales"}
          </small>
        </article>

        <article className="cf-metric cf-metric-primary" data-testid="kpi-quota-attainment">
          <div>
            <span>Quota Attainment</span>
            <TrendingUp size={20} />
          </div>
          <strong>{summary.overall_achievement_pct.toFixed(1)}%</strong>
          <small>Actual / Quota Target</small>
        </article>

        <article className="cf-metric" data-testid="kpi-remaining-quota">
          <div>
            <span>Remaining Quota</span>
            <Gauge size={20} />
          </div>
          <strong>{money(summary.total_remaining)}</strong>
          <small>Unachieved annual target</small>
        </article>
      </section>

      {/* Attribution & Exclusion Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Badge variant="outline">Tax-Exclusive Basis</Badge>
        <span className="cf-muted" style={{ fontSize: "13px" }}>
          Attainment is strictly calculated on commercial exclusive sales. Unbilled orders (e.g.
          Kavya Nair PO-NEXUS-881 ₹2,50,000) and cancelled invoices are strictly excluded.
        </span>
      </div>

      {empty || paginatedRows.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="cf-table-container">
            <table className="cf-table" data-testid="executives-report-table">
              <thead>
                <tr>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("executive_name")}>
                      Executive Name <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("fy_code")}>
                      Financial Year <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("yearly_target")}>
                      Annual Quota (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("actual_sales")}>
                      Actual Sales (Excl.) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("achievement_pct")}>
                      Attainment (%) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("remaining_target")}>
                      Remaining Quota (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("order_count")}>
                      Closed Deals <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Performance Tier</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={`${row.user_id}-${row.fy_code}`} data-testid={`exec-row-${row.user_id}`}>
                    <td>
                      <strong>{row.executive_name}</strong>
                    </td>
                    <td>{row.fy_code}</td>
                    <td className="cf-number">{money(row.yearly_target)}</td>
                    <td className="cf-number">
                      <strong>{money(row.actual_sales)}</strong>
                    </td>
                    <td className="cf-number">
                      <strong style={{ color: row.achievement_pct >= 50 ? "#16a34a" : "#2563eb" }}>
                        {row.achievement_pct.toFixed(1)}%
                      </strong>
                    </td>
                    <td className="cf-number">{money(row.remaining_target)}</td>
                    <td className="cf-number">{row.order_count}</td>
                    <td>
                      {row.achievement_pct > 0 ? (
                        <Badge
                          variant="outline"
                          style={{ borderColor: "#3b82f6", color: "#1d4ed8" }}
                        >
                          On Track ({row.achievement_pct.toFixed(1)}%)
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pipeline Building (0.0%)</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="cf-mobile-cards" data-testid="executives-report-cards">
            {paginatedRows.map((row) => (
              <article className="cf-record-card" key={`${row.user_id}-${row.fy_code}`}>
                <header>
                  <strong>{row.executive_name}</strong>
                  <span>{row.achievement_pct.toFixed(1)}%</span>
                </header>
                <dl>
                  <div>
                    <dt>Annual Quota</dt>
                    <dd>{money(row.yearly_target)}</dd>
                  </div>
                  <div>
                    <dt>Actual Sales (Excl.)</dt>
                    <dd>{money(row.actual_sales)}</dd>
                  </div>
                  <div>
                    <dt>Remaining Quota</dt>
                    <dd>{money(row.remaining_target)}</dd>
                  </div>
                  <div>
                    <dt>Closed Deals</dt>
                    <dd>{row.order_count}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <footer className="cf-table-footer" style={{ marginTop: "16px" }}>
            <span>
              {sortedRows.length
                ? `${(currentPage - 1) * countPerPage + 1}–${Math.min(currentPage * countPerPage, sortedRows.length)} of ${sortedRows.length} executives`
                : "0 executives"}
            </span>
            <div>
              <FilterChoice
                label="Rows per page"
                value={pageSize}
                options={["5", "10", "25"]}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 5. AR Aging Summary View
// ============================================================================
function ArAgingSummaryView({
  report,
  sortField,
  sortAsc,
  onSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  empty,
  onReset,
}: {
  report: ReturnType<typeof getArAgingReport>;
  sortField: string;
  sortAsc: boolean;
  onSort: (field: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: string;
  setPageSize: (s: string) => void;
  empty: boolean;
  onReset: () => void;
}) {
  const { rows, summary } = report;

  const sortedRows = useMemo(() => {
    if (sortField === "default") return rows;
    return [...rows].sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortField];
      const valB = (b as unknown as Record<string, unknown>)[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [rows, sortField, sortAsc]);

  const countPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / countPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * countPerPage,
    currentPage * countPerPage,
  );

  return (
    <div data-testid="aging-report-view">
      {/* KPI Cards */}
      <section className="cf-metrics" aria-label="AR Aging KPIs" style={{ marginBottom: "20px" }}>
        <article className="cf-metric cf-metric-primary" data-testid="kpi-total-receivables">
          <div>
            <span>Total Receivables</span>
            <Wallet size={20} />
          </div>
          <strong>{money(summary.total_receivables)}</strong>
          <small>Issued unpaid receivables</small>
        </article>

        <article className="cf-metric" data-testid="kpi-current-not-due">
          <div>
            <span>Current / Not Due</span>
            <Gauge size={20} />
          </div>
          <strong>
            {money(summary.buckets.find((b) => b.bucket === "Current / Not Due")?.amount ?? 0)}
          </strong>
          <small>0 days overdue (Within terms)</small>
        </article>

        <article className="cf-metric" data-testid="kpi-total-overdue">
          <div>
            <span>Total Overdue (&gt;0d)</span>
            <Clock size={20} />
          </div>
          <strong>{money(summary.total_overdue)}</strong>
          <small>Delinquent receivables</small>
        </article>

        <article className="cf-metric" data-testid="kpi-as-of-date">
          <div>
            <span>Reporting Date</span>
            <Info size={20} />
          </div>
          <strong>{summary.as_of_label}</strong>
          <small>Fixed month-end snapshot</small>
        </article>
      </section>

      {/* Aging Bucket Distribution Grid */}
      <div
        className="cf-aging-buckets-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "10px",
          marginBottom: "20px",
        }}
        data-testid="aging-buckets-grid"
      >
        {summary.buckets.map((b) => (
          <div
            key={b.bucket}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--cf-border-color, #e2e8f0)",
              background: "var(--cf-card-bg, #ffffff)",
            }}
            data-testid={`bucket-${b.bucket.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
          >
            <span
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                color: "var(--cf-text-secondary)",
                display: "block",
              }}
            >
              {b.bucket}
            </span>
            <strong style={{ fontSize: "16px", display: "block", margin: "4px 0" }}>
              {money(b.amount)}
            </strong>
            <small style={{ color: "var(--cf-text-secondary)", fontSize: "11px" }}>
              {b.count} invoice{b.count === 1 ? "" : "s"}
            </small>
          </div>
        ))}
      </div>

      {empty || paginatedRows.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="cf-table-container">
            <table className="cf-table" data-testid="aging-report-table">
              <thead>
                <tr>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("invoice_number")}>
                      Invoice Number <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("customer_name")}>
                      Customer <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("executive_name")}>
                      Executive <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>
                    <Button variant="ghost" onClick={() => onSort("due_date")}>
                      Due Date <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("days_overdue")}>
                      Days Overdue <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Aging Bucket</th>
                  <th className="cf-number">
                    <Button variant="ghost" onClick={() => onSort("outstanding_balance")}>
                      Outstanding Balance (₹) <ArrowUpDown size={13} />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.id} data-testid={`aging-row-${row.id}`}>
                    <td>
                      <strong>{row.invoice_number}</strong>
                      <small style={{ display: "block", color: "var(--cf-text-secondary)" }}>
                        PO: {row.po_number}
                      </small>
                    </td>
                    <td>
                      <strong>{row.customer_name}</strong>
                    </td>
                    <td>{row.executive_name}</td>
                    <td>{dateLabel(row.due_date)}</td>
                    <td className="cf-number">
                      <span
                        style={{
                          color: row.days_overdue > 0 ? "#ef4444" : "var(--cf-text-primary)",
                        }}
                      >
                        {row.days_overdue} days
                      </span>
                    </td>
                    <td>
                      <Badge variant="outline" style={{ borderColor: "#3b82f6", color: "#1d4ed8" }}>
                        {row.bucket}
                      </Badge>
                    </td>
                    <td className="cf-number cf-balance">
                      <strong>{money(row.outstanding_balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="cf-mobile-cards" data-testid="aging-report-cards">
            {paginatedRows.map((row) => (
              <article className="cf-record-card" key={row.id}>
                <header>
                  <strong>{row.invoice_number}</strong>
                  <Badge variant="outline">{row.bucket}</Badge>
                </header>
                <h3>{row.customer_name}</h3>
                <dl>
                  <div>
                    <dt>Outstanding</dt>
                    <dd className="cf-balance">{money(row.outstanding_balance)}</dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{dateLabel(row.due_date)}</dd>
                  </div>
                  <div>
                    <dt>Days Overdue</dt>
                    <dd>{row.days_overdue} days</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* Pagination */}
          <footer className="cf-table-footer" style={{ marginTop: "16px" }}>
            <span>
              {sortedRows.length
                ? `${(currentPage - 1) * countPerPage + 1}–${Math.min(currentPage * countPerPage, sortedRows.length)} of ${sortedRows.length} receivables`
                : "0 receivables"}
            </span>
            <div>
              <FilterChoice
                label="Rows per page"
                value={pageSize}
                options={["5", "10", "25"]}
                onChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
