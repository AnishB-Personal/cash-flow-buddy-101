// Date classification only: financial amounts and payment statuses remain authoritative inputs.
import type { Invoice } from "./collectflow";
import type { SalesTarget } from "./targets";

export interface CustomerEntity {
  id: number;
  billing_name?: string | null | undefined;
  gst_number?: string | null | undefined;
  state?: string | null | undefined;
}

export const agingBuckets = [
  "Current / Not Due",
  "1–30 days",
  "31–60 days",
  "61–90 days",
  "91–180 days",
  "180+ days",
] as const;
export type AgingBucket = (typeof agingBuckets)[number];
export type AgingRecord = {
  invoice_number: string | null;
  due_date: string | null;
  computed_status: string;
  outstanding_balance: number;
};
export const issuedRecord = (row: AgingRecord) => Boolean(row.invoice_number?.trim());
export const receivableRecord = (row: AgingRecord) =>
  issuedRecord(row) && row.computed_status !== "CANCELLED" && row.outstanding_balance > 0;

function calendarDay(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  )
    throw new Error(`Invalid reporting calendar date: ${value}`);
  return timestamp / 86400000;
}
export function classifyAging(
  row: AgingRecord,
  asOfDate: string,
): { daysOverdue: number; overdue: boolean; bucket: AgingBucket | undefined } {
  const reportingDay = calendarDay(asOfDate);
  if (!receivableRecord(row)) return { daysOverdue: 0, overdue: false, bucket: undefined };
  // Mirrors FastAPI's null-due-date and calendar-day treatment; never invent a due date.
  const daysOverdue = row.due_date ? Math.max(0, reportingDay - calendarDay(row.due_date)) : 0;
  const bucket =
    daysOverdue === 0
      ? agingBuckets[0]
      : daysOverdue <= 30
        ? agingBuckets[1]
        : daysOverdue <= 60
          ? agingBuckets[2]
          : daysOverdue <= 90
            ? agingBuckets[3]
            : daysOverdue <= 180
              ? agingBuckets[4]
              : agingBuckets[5];
  return { daysOverdue, overdue: daysOverdue > 0, bucket };
}
export function summarizeAging(rows: readonly AgingRecord[], asOfDate: string) {
  const classified = rows.map((row) => ({ row, bucket: classifyAging(row, asOfDate).bucket }));
  return agingBuckets.map((bucket) => {
    const members = classified.filter((item) => item.bucket === bucket);
    return {
      bucket,
      amount: members.reduce((sum, item) => sum + item.row.outstanding_balance, 0),
      count: members.length,
    };
  });
}
export const reportingDateLabel = (date: string) => {
  calendarDay(date);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
};
export const agingDateLabel = (asOfDate: string) => `Aging as of ${reportingDateLabel(asOfDate)}`;

export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ReportFilterScope {
  fy?: string;
  customer?: string;
  executive?: string;
  query?: string;
}

export interface InvoicesReceivablesRow {
  id: number;
  fy_code: string;
  po_number: string;
  po_date: string;
  customer_name: string;
  executive_name: string;
  exclusive_amount: number;
  tax_amount: number;
  total_amount: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_cash_paid: number;
  total_tds_deducted: number;
  total_paid: number;
  outstanding_balance: number;
  computed_status: string;
  days_overdue: number;
}

export interface InvoicesReceivablesSummary {
  total_invoiced: number;
  total_cash: number;
  total_tds: number;
  total_settled: number;
  total_outstanding: number;
  count: number;
  collection_rate: number;
  unbilled_orders_count: number;
  unbilled_orders_exclusive: number;
  unbilled_orders_total: number;
  cancelled_invoices_count: number;
}

export interface InvoicesReceivablesReport {
  rows: InvoicesReceivablesRow[];
  summary: InvoicesReceivablesSummary;
}

export interface PaymentLedgerRow {
  id: number;
  invoice_id: number;
  fy_code: string;
  remittance_number: string;
  payment_date: string;
  invoice_number: string;
  po_number: string;
  customer_name: string;
  executive_name: string;
  payment_mode: string;
  tds_section: string;
  payment_amount: number;
  tds_amount: number;
  total_settled: number;
}

export interface PaymentLedgerSummary {
  total_cash: number;
  total_tds: number;
  total_settled: number;
  transaction_count: number;
}

export interface PaymentLedgerReport {
  rows: PaymentLedgerRow[];
  summary: PaymentLedgerSummary;
}

export interface CustomerExposureRow {
  customer_id: number;
  customer_name: string;
  gstin: string;
  state: string;
  total_orders: number;
  total_billed: number;
  total_cash: number;
  total_tds: number;
  total_settled: number;
  outstanding_balance: number;
  unbilled_value: number;
  overdue_exposure: number;
}

export interface CustomerExposureSummary {
  total_billed: number;
  total_cash: number;
  total_tds: number;
  total_settled: number;
  total_outstanding: number;
  customer_count: number;
  total_overdue: number;
}

export interface CustomerExposureReport {
  rows: CustomerExposureRow[];
  summary: CustomerExposureSummary;
}

export interface ExecutiveAttainmentRow {
  user_id: number;
  executive_name: string;
  fy_code: string;
  yearly_target: number;
  actual_sales: number; // Tax-exclusive basis
  achievement_pct: number;
  remaining_target: number;
  order_count: number;
  outstanding_balance: number;
}

export interface ExecutiveAttainmentSummary {
  fy_code: string;
  total_target: number;
  total_actual_sales: number; // Tax-exclusive basis
  overall_achievement_pct: number;
  total_remaining: number;
  executive_count: number;
  excluded_unbilled_sales: number;
}

export interface ExecutiveAttainmentReport {
  rows: ExecutiveAttainmentRow[];
  summary: ExecutiveAttainmentSummary;
}

export interface ArAgingReportRow {
  id: number;
  invoice_number: string;
  po_number: string;
  customer_name: string;
  executive_name: string;
  fy_code: string;
  due_date: string | null;
  outstanding_balance: number;
  days_overdue: number;
  bucket: AgingBucket;
}

export interface ArAgingReportSummary {
  as_of_date: string;
  as_of_label: string;
  total_receivables: number;
  total_overdue: number;
  buckets: Array<{ bucket: AgingBucket; amount: number; count: number }>;
}

export interface ArAgingReport {
  rows: ArAgingReportRow[];
  summary: ArAgingReportSummary;
}

/**
 * Report 1: Invoices & Receivables
 * Strictly excludes unbilled orders (PO-NEXUS-881 ₹2,95,000 / ₹2,50,000) from invoiced revenue
 * and cancelled invoices (INV-2026-041) from receivables and gross revenue.
 * Reconciles to approved baseline: Invoiced ₹5,31,000, Settled ₹2,09,000, Outstanding ₹3,22,000.
 */
export function getInvoicesReceivablesReport(
  invoices: readonly Invoice[],
  scope?: ReportFilterScope,
  asOfDate = "2026-04-30",
): InvoicesReceivablesReport {
  const activeFy = scope?.fy && scope.fy !== "ALL" ? scope.fy : null;
  const customerFilter =
    scope?.customer && scope.customer !== "All customers" ? scope.customer : null;
  const executiveFilter =
    scope?.executive && scope.executive !== "All executives" ? scope.executive : null;
  const query = scope?.query?.trim().toLowerCase() || "";

  let unbilledCount = 0;
  let unbilledExclusive = 0;
  let unbilledTotal = 0;
  let cancelledCount = 0;

  const matchingRows: InvoicesReceivablesRow[] = [];

  for (const inv of invoices) {
    if (activeFy && inv.fy_code !== activeFy) continue;
    if (customerFilter && inv.customer_name !== customerFilter) continue;
    if (executiveFilter && inv.executive_name !== executiveFilter) continue;

    const isIssued = Boolean(inv.invoice_number?.trim());
    const isCancelled = inv.computed_status === "CANCELLED" || inv.payment_status === "CANCELLED";

    if (!isIssued) {
      unbilledCount++;
      unbilledExclusive += inv.exclusive_amount ?? 0;
      unbilledTotal += inv.total_amount ?? 0;
      continue;
    }

    if (isCancelled) {
      cancelledCount++;
      continue;
    }

    if (query) {
      const text =
        `${inv.customer_name} ${inv.po_number} ${inv.invoice_number ?? ""} ${inv.executive_name}`.toLowerCase();
      if (!text.includes(query)) continue;
    }

    const aging = classifyAging(inv, asOfDate);

    matchingRows.push({
      id: inv.id,
      fy_code: inv.fy_code,
      po_number: inv.po_number,
      po_date: inv.po_date,
      customer_name: inv.customer_name,
      executive_name: inv.executive_name,
      exclusive_amount: roundAmount(inv.exclusive_amount ?? 0),
      tax_amount: roundAmount(inv.tax_amount ?? 0),
      total_amount: roundAmount(inv.total_amount ?? 0),
      invoice_number: inv.invoice_number ?? "—",
      invoice_date: inv.invoice_date ?? "—",
      due_date: inv.due_date,
      total_cash_paid: roundAmount(inv.total_cash_paid ?? 0),
      total_tds_deducted: roundAmount(inv.total_tds_deducted ?? 0),
      total_paid: roundAmount(inv.total_paid ?? 0),
      outstanding_balance: roundAmount(inv.outstanding_balance ?? 0),
      computed_status: inv.computed_status,
      days_overdue: aging.daysOverdue,
    });
  }

  const total_invoiced = roundAmount(matchingRows.reduce((sum, r) => sum + r.total_amount, 0));
  const total_cash = roundAmount(matchingRows.reduce((sum, r) => sum + r.total_cash_paid, 0));
  const total_tds = roundAmount(matchingRows.reduce((sum, r) => sum + r.total_tds_deducted, 0));
  const total_settled = roundAmount(matchingRows.reduce((sum, r) => sum + r.total_paid, 0));
  const total_outstanding = roundAmount(
    matchingRows.reduce((sum, r) => sum + r.outstanding_balance, 0),
  );
  const count = matchingRows.length;
  const collection_rate =
    total_invoiced > 0 ? Number(((total_settled / total_invoiced) * 100).toFixed(1)) : 0;

  return {
    rows: matchingRows,
    summary: {
      total_invoiced,
      total_cash,
      total_tds,
      total_settled,
      total_outstanding,
      count,
      collection_rate,
      unbilled_orders_count: unbilledCount,
      unbilled_orders_exclusive: roundAmount(unbilledExclusive),
      unbilled_orders_total: roundAmount(unbilledTotal),
      cancelled_invoices_count: cancelledCount,
    },
  };
}

/**
 * Report 2: Collections & Payments Ledger
 * Reconciles with approved baseline: Cash ₹2,00,000, TDS ₹9,000, Total Settled ₹2,09,000.
 */
export function getPaymentsLedgerReport(
  invoices: readonly Invoice[],
  scope?: ReportFilterScope,
): PaymentLedgerReport {
  const activeFy = scope?.fy && scope.fy !== "ALL" ? scope.fy : null;
  const customerFilter =
    scope?.customer && scope.customer !== "All customers" ? scope.customer : null;
  const executiveFilter =
    scope?.executive && scope.executive !== "All executives" ? scope.executive : null;
  const query = scope?.query?.trim().toLowerCase() || "";

  const matchingRows: PaymentLedgerRow[] = [];

  for (const inv of invoices) {
    if (activeFy && inv.fy_code !== activeFy) continue;
    if (customerFilter && inv.customer_name !== customerFilter) continue;
    if (executiveFilter && inv.executive_name !== executiveFilter) continue;
    if (inv.computed_status === "CANCELLED" || inv.payment_status === "CANCELLED") continue;

    for (const p of inv.payments || []) {
      const remittance = p.remittance_number || "—";
      const invNum = inv.invoice_number ?? inv.po_number;
      if (query) {
        const text =
          `${remittance} ${invNum} ${inv.customer_name} ${inv.po_number} ${p.payment_mode}`.toLowerCase();
        if (!text.includes(query)) continue;
      }

      const payment_amount = roundAmount(p.payment_amount ?? 0);
      const tds_amount = roundAmount(p.tds_amount ?? 0);
      const total_settled = roundAmount(payment_amount + tds_amount);

      matchingRows.push({
        id: p.id,
        invoice_id: inv.id,
        fy_code: inv.fy_code,
        remittance_number: remittance,
        payment_date: p.payment_date,
        invoice_number: invNum,
        po_number: inv.po_number,
        customer_name: inv.customer_name,
        executive_name: inv.executive_name,
        payment_mode: p.payment_mode || "—",
        tds_section: p.tds_section || "—",
        payment_amount,
        tds_amount,
        total_settled,
      });
    }
  }

  const total_cash = roundAmount(matchingRows.reduce((sum, r) => sum + r.payment_amount, 0));
  const total_tds = roundAmount(matchingRows.reduce((sum, r) => sum + r.tds_amount, 0));
  const total_settled = roundAmount(matchingRows.reduce((sum, r) => sum + r.total_settled, 0));

  return {
    rows: matchingRows,
    summary: {
      total_cash,
      total_tds,
      total_settled,
      transaction_count: matchingRows.length,
    },
  };
}

/**
 * Report 3: Customer Sales & Exposure Summary
 * Reconciles customer lifetime/period exposure:
 * Acme Cloud Solutions billed ₹5,31,000, settled ₹2,09,000, outstanding ₹3,22,000
 * Nexus Dynamics unbilled ₹2,95,000 (billed ₹0, outstanding ₹0)
 */
export function getCustomerExposureReport(
  invoices: readonly Invoice[],
  customers: readonly CustomerEntity[] = [],
  scope?: ReportFilterScope,
  asOfDate = "2026-04-30",
): CustomerExposureReport {
  const activeFy = scope?.fy && scope.fy !== "ALL" ? scope.fy : null;
  const customerFilter =
    scope?.customer && scope.customer !== "All customers" ? scope.customer : null;
  const executiveFilter =
    scope?.executive && scope.executive !== "All executives" ? scope.executive : null;
  const query = scope?.query?.trim().toLowerCase() || "";

  // Extract all customer entities
  const customerMap = new Map<string, { id: number; name: string; gstin: string; state: string }>();

  for (const c of customers) {
    if (c.billing_name) {
      customerMap.set(c.billing_name, {
        id: c.id,
        name: c.billing_name,
        gstin: c.gst_number || "—",
        state: c.state || "—",
      });
    }
  }

  for (const inv of invoices) {
    if (inv.customer_name && !customerMap.has(inv.customer_name)) {
      customerMap.set(inv.customer_name, {
        id: inv.customer_id || 0,
        name: inv.customer_name,
        gstin: inv.customer_gstin || "—",
        state: inv.customer_state || "—",
      });
    }
  }

  const rows: CustomerExposureRow[] = [];

  for (const [custName, meta] of customerMap.entries()) {
    if (customerFilter && custName !== customerFilter) continue;
    if (query && !custName.toLowerCase().includes(query)) continue;

    const custInvoices = invoices.filter((inv) => {
      if (inv.customer_name !== custName) return false;
      if (activeFy && inv.fy_code !== activeFy) return false;
      if (executiveFilter && inv.executive_name !== executiveFilter) return false;
      return true;
    });

    if (custInvoices.length === 0 && (activeFy || executiveFilter)) continue;

    let totalOrders = 0;
    let totalBilled = 0;
    let totalCash = 0;
    let totalTds = 0;
    let totalSettled = 0;
    let totalOutstanding = 0;
    let unbilledValue = 0;
    let overdueExposure = 0;

    for (const inv of custInvoices) {
      totalOrders++;
      const isIssued = Boolean(inv.invoice_number?.trim());
      const isCancelled = inv.computed_status === "CANCELLED" || inv.payment_status === "CANCELLED";

      if (isCancelled) continue;

      if (!isIssued) {
        unbilledValue += inv.total_amount ?? 0;
        continue;
      }

      totalBilled += inv.total_amount ?? 0;
      totalCash += inv.total_cash_paid ?? 0;
      totalTds += inv.total_tds_deducted ?? 0;
      totalSettled += inv.total_paid ?? 0;
      totalOutstanding += inv.outstanding_balance ?? 0;

      const aging = classifyAging(inv, asOfDate);
      if (aging.overdue) {
        overdueExposure += inv.outstanding_balance ?? 0;
      }
    }

    rows.push({
      customer_id: meta.id,
      customer_name: custName,
      gstin: meta.gstin,
      state: meta.state,
      total_orders: totalOrders,
      total_billed: roundAmount(totalBilled),
      total_cash: roundAmount(totalCash),
      total_tds: roundAmount(totalTds),
      total_settled: roundAmount(totalSettled),
      outstanding_balance: roundAmount(totalOutstanding),
      unbilled_value: roundAmount(unbilledValue),
      overdue_exposure: roundAmount(overdueExposure),
    });
  }

  const total_billed = roundAmount(rows.reduce((sum, r) => sum + r.total_billed, 0));
  const total_cash = roundAmount(rows.reduce((sum, r) => sum + r.total_cash, 0));
  const total_tds = roundAmount(rows.reduce((sum, r) => sum + r.total_tds, 0));
  const total_settled = roundAmount(rows.reduce((sum, r) => sum + r.total_settled, 0));
  const total_outstanding = roundAmount(rows.reduce((sum, r) => sum + r.outstanding_balance, 0));
  const total_overdue = roundAmount(rows.reduce((sum, r) => sum + r.overdue_exposure, 0));

  return {
    rows,
    summary: {
      total_billed,
      total_cash,
      total_tds,
      total_settled,
      total_outstanding,
      customer_count: rows.length,
      total_overdue,
    },
  };
}

/**
 * Report 4: Executive Attainment & Quota Summary
 * Strictly calculates actual achievement on tax-exclusive invoiced sales basis (exclusive_amount).
 * Unbilled purchase orders (PO-NEXUS-881 ₹2,50,000 exclusive) and cancelled invoices strictly excluded.
 * Reconciles to Stage 4 targets:
 * FY 2026-27: Total target ₹75,00,000 / actual ₹4,50,000 (6.0%)
 * FY 2025-26: Total target ₹91,00,000 / actual ₹0 (0.0%)
 */
export function getExecutiveAttainmentReport(
  invoices: readonly Invoice[],
  targets: readonly SalesTarget[],
  scope?: ReportFilterScope,
): ExecutiveAttainmentReport {
  const activeFy = scope?.fy && scope.fy !== "ALL" ? scope.fy : "FY 2026-27";
  const executiveFilter =
    scope?.executive && scope.executive !== "All executives" ? scope.executive : null;

  const query = scope?.query?.trim().toLowerCase() || "";

  const fyTargets = targets.filter((t) => t.fy_code === activeFy);
  const rows: ExecutiveAttainmentRow[] = [];

  let excludedUnbilled = 0;

  for (const t of fyTargets) {
    if (executiveFilter && t.user_name !== executiveFilter) continue;
    if (query && !t.user_name.toLowerCase().includes(query)) continue;

    // Filter matching invoices for this executive in this FY
    const execInvoices = invoices.filter((inv) => {
      if (inv.fy_code !== activeFy) return false;
      const matchesExec = inv.executive_id === t.user_id || inv.executive_name === t.user_name;
      return matchesExec;
    });

    let actualSales = 0;
    let orderCount = 0;
    let outstanding = 0;

    for (const inv of execInvoices) {
      const isIssued = Boolean(inv.invoice_number?.trim());
      const isCancelled = inv.computed_status === "CANCELLED" || inv.payment_status === "CANCELLED";

      if (isCancelled) continue;

      if (!isIssued) {
        excludedUnbilled += inv.exclusive_amount ?? 0;
        continue;
      }

      // Authoritative Rule: Quota attainment uses net taxable commercial revenue (exclusive_amount)
      actualSales += inv.exclusive_amount ?? inv.total_amount ?? 0;
      outstanding += inv.outstanding_balance ?? 0;
      orderCount++;
    }

    const roundedSales = roundAmount(actualSales);
    const yearlyTarget = roundAmount(t.yearly_target);
    const achievement_pct =
      yearlyTarget > 0 ? Number(((roundedSales / yearlyTarget) * 100).toFixed(1)) : 0;
    const remaining_target = Math.max(0, roundAmount(yearlyTarget - roundedSales));

    rows.push({
      user_id: t.user_id,
      executive_name: t.user_name,
      fy_code: activeFy,
      yearly_target: yearlyTarget,
      actual_sales: roundedSales,
      achievement_pct,
      remaining_target,
      order_count: orderCount,
      outstanding_balance: roundAmount(outstanding),
    });
  }

  const total_target = roundAmount(rows.reduce((sum, r) => sum + r.yearly_target, 0));
  const total_actual_sales = roundAmount(rows.reduce((sum, r) => sum + r.actual_sales, 0));
  const overall_achievement_pct =
    total_target > 0 ? Number(((total_actual_sales / total_target) * 100).toFixed(1)) : 0;
  const total_remaining = Math.max(0, roundAmount(total_target - total_actual_sales));

  return {
    rows,
    summary: {
      fy_code: activeFy,
      total_target,
      total_actual_sales,
      overall_achievement_pct,
      total_remaining,
      executive_count: rows.length,
      excluded_unbilled_sales: roundAmount(excludedUnbilled),
    },
  };
}

/**
 * Report 5: AR Aging Summary
 * Pinned reporting date: 30 April 2026 (2026-04-30).
 * INV-2026-042 (due 12 May 2026) is 0 days overdue, categorized into Current / Not Due bucket (₹3,22,000).
 * Total overdue (>0 days): ₹0.00.
 */
export function getArAgingReport(
  invoices: readonly Invoice[],
  asOfDate = "2026-04-30",
  scope?: ReportFilterScope,
): ArAgingReport {
  const activeFy = scope?.fy && scope.fy !== "ALL" ? scope.fy : null;
  const customerFilter =
    scope?.customer && scope.customer !== "All customers" ? scope.customer : null;
  const executiveFilter =
    scope?.executive && scope.executive !== "All executives" ? scope.executive : null;
  const query = scope?.query?.trim().toLowerCase() || "";

  const matchingRows: ArAgingReportRow[] = [];

  for (const inv of invoices) {
    if (activeFy && inv.fy_code !== activeFy) continue;
    if (customerFilter && inv.customer_name !== customerFilter) continue;
    if (executiveFilter && inv.executive_name !== executiveFilter) continue;

    if (!receivableRecord(inv)) continue;

    if (query) {
      const text =
        `${inv.customer_name} ${inv.po_number} ${inv.invoice_number ?? ""} ${inv.executive_name}`.toLowerCase();
      if (!text.includes(query)) continue;
    }

    const aging = classifyAging(inv, asOfDate);
    if (!aging.bucket) continue;

    matchingRows.push({
      id: inv.id,
      invoice_number: inv.invoice_number ?? "—",
      po_number: inv.po_number,
      customer_name: inv.customer_name,
      executive_name: inv.executive_name,
      fy_code: inv.fy_code,
      due_date: inv.due_date,
      outstanding_balance: roundAmount(inv.outstanding_balance),
      days_overdue: aging.daysOverdue,
      bucket: aging.bucket,
    });
  }

  const buckets = agingBuckets.map((bucket) => {
    const members = matchingRows.filter((r) => r.bucket === bucket);
    const amount = roundAmount(members.reduce((sum, r) => sum + r.outstanding_balance, 0));
    return { bucket, amount, count: members.length };
  });

  const total_receivables = roundAmount(
    matchingRows.reduce((sum, r) => sum + r.outstanding_balance, 0),
  );
  const total_overdue = roundAmount(
    matchingRows
      .filter((r) => r.days_overdue > 0)
      .reduce((sum, r) => sum + r.outstanding_balance, 0),
  );

  return {
    rows: matchingRows,
    summary: {
      as_of_date: asOfDate,
      as_of_label: reportingDateLabel(asOfDate),
      total_receivables,
      total_overdue,
      buckets,
    },
  };
}
