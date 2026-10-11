import { describe, it, expect } from "vitest";
import fixtures from "@/data/collectflow.json";
import {
  getInvoicesReceivablesReport,
  getPaymentsLedgerReport,
  getCustomerExposureReport,
  getExecutiveAttainmentReport,
  getArAgingReport,
  classifyAging,
  agingBuckets,
} from "@/data/reporting";
import { readInitialTargets } from "@/data/targets";
import { compileExportRows, calculateExportTotals } from "@/utils/export-engine";

describe("Authoritative Financial Reports & Calculation Reconciliations", () => {
  const invoices = fixtures.invoices;
  const customers = fixtures.customers;
  const initialTargets = readInitialTargets();
  const pinnedDate = "2026-04-30";

  describe("Report 1: Invoices & Receivables Calculation & Exclusions", () => {
    it("reconciles exactly with approved baseline figures for FY 2026-27", () => {
      const report = getInvoicesReceivablesReport(invoices, { fy: "FY 2026-27" }, pinnedDate);
      const { summary, rows } = report;

      // Invoiced Gross: ₹5,31,000
      expect(summary.total_invoiced).toBe(531000.0);
      // Cash: ₹2,00,000
      expect(summary.total_cash).toBe(200000.0);
      // TDS: ₹9,000
      expect(summary.total_tds).toBe(9000.0);
      // Total Settled: ₹2,09,000
      expect(summary.total_settled).toBe(209000.0);
      // Outstanding Balance: ₹3,22,000
      expect(summary.total_outstanding).toBe(322000.0);
      // Active Invoices Count: 1 (INV-2026-042)
      expect(summary.count).toBe(1);
      expect(rows).toHaveLength(1);
      const firstRow = rows[0]!;
      expect(firstRow.invoice_number).toBe("INV-2026-042");
      expect(firstRow.customer_name).toBe("Acme Cloud Solutions Pvt Ltd");
      expect(firstRow.executive_name).toBe("Neha Rao");
      expect(firstRow.exclusive_amount).toBe(450000.0);
      expect(firstRow.tax_amount).toBe(81000.0);
      expect(firstRow.total_amount).toBe(531000.0);
      expect(firstRow.outstanding_balance).toBe(322000.0);
    });

    it("strictly excludes unbilled order PO-NEXUS-881 from invoiced gross and receivables", () => {
      const report = getInvoicesReceivablesReport(invoices, { fy: "FY 2026-27" }, pinnedDate);
      const { summary } = report;

      // Unbilled PO-NEXUS-881 has total ₹2,95,000, exclusive ₹2,50,000
      expect(summary.unbilled_orders_count).toBe(1);
      expect(summary.unbilled_orders_exclusive).toBe(250000.0);
      expect(summary.unbilled_orders_total).toBe(295000.0);

      // Verify it is NOT included in total_invoiced or total_outstanding
      expect(summary.total_invoiced).not.toBe(531000.0 + 295000.0);
      expect(summary.total_invoiced).toBe(531000.0);
    });

    it("strictly excludes cancelled invoices from invoiced gross and receivables", () => {
      const invoicesWithCancelled = [
        ...invoices,
        {
          ...invoices[0]!,
          id: 103,
          fy_code: "FY 2026-27",
          order_type: "PO",
          po_number: "PO-CANCEL-999",
          po_date: "2026-04-15",
          customer_id: 1,
          executive_id: 3,
          customer_name: "Acme Cloud Solutions Pvt Ltd",
          currency: "INR",
          exchange_rate: 1.0,
          original_amount: 100000.0,
          exclusive_amount: 100000.0,
          tax_rate: 0.18,
          tax_amount: 18000.0,
          total_amount: 118000.0,
          invoice_number: "INV-2026-041",
          invoice_date: "2026-04-16",
          due_date: "2026-05-16",
          remarks: "[CANCELLED: Clerical duplication error]",
          payment_status: "CANCELLED",
          total_cash_paid: 0.0,
          total_tds_deducted: 0.0,
          total_paid: 0.0,
          outstanding_balance: 0.0,
          computed_status: "CANCELLED",
          executive_name: "Neha Rao",
          payments: [],
        },
      ];

      const report = getInvoicesReceivablesReport(
        invoicesWithCancelled,
        { fy: "FY 2026-27" },
        pinnedDate,
      );
      expect(report.summary.total_invoiced).toBe(531000.0);
      expect(report.summary.total_outstanding).toBe(322000.0);
      expect(report.summary.cancelled_invoices_count).toBe(1);
      expect(report.rows).toHaveLength(1);
    });
  });

  describe("Report 2: Collections & Payments Ledger Calculation", () => {
    it("reconciles with approved baseline cash, TDS, and settlement totals", () => {
      const report = getPaymentsLedgerReport(invoices, { fy: "FY 2026-27" });
      const { summary, rows } = report;

      expect(summary.total_cash).toBe(200000.0);
      expect(summary.total_tds).toBe(9000.0);
      expect(summary.total_settled).toBe(209000.0);
      expect(summary.transaction_count).toBe(1);

      expect(rows).toHaveLength(1);
      const firstPayment = rows[0]!;
      expect(firstPayment.remittance_number).toBe("UTR-ICICI-9876543210");
      expect(firstPayment.payment_mode).toBe("NEFT");
      expect(firstPayment.tds_section).toBe("194J (2%)");
      expect(firstPayment.invoice_number).toBe("INV-2026-042");
      expect(firstPayment.customer_name).toBe("Acme Cloud Solutions Pvt Ltd");
      expect(firstPayment.payment_amount).toBe(200000.0);
      expect(firstPayment.tds_amount).toBe(9000.0);
      expect(firstPayment.total_settled).toBe(209000.0);
    });

    it("returns empty ledger when filtering for financial year with no payments", () => {
      const report = getPaymentsLedgerReport(invoices, { fy: "FY 2025-26" });
      expect(report.summary.total_cash).toBe(0);
      expect(report.summary.total_tds).toBe(0);
      expect(report.summary.total_settled).toBe(0);
      expect(report.summary.transaction_count).toBe(0);
      expect(report.rows).toHaveLength(0);
    });
  });

  describe("Report 3: Customer Sales & Exposure Summary", () => {
    it("reconciles Acme Cloud Solutions and Nexus Dynamics exposure correctly", () => {
      const report = getCustomerExposureReport(
        invoices,
        customers,
        { fy: "FY 2026-27" },
        pinnedDate,
      );
      const { rows, summary } = report;

      // Summary totals
      expect(summary.total_billed).toBe(531000.0);
      expect(summary.total_cash).toBe(200000.0);
      expect(summary.total_tds).toBe(9000.0);
      expect(summary.total_settled).toBe(209000.0);
      expect(summary.total_outstanding).toBe(322000.0);
      expect(summary.total_overdue).toBe(0.0);

      // Acme Cloud Solutions Pvt Ltd
      const acme = rows.find((r) => r.customer_name === "Acme Cloud Solutions Pvt Ltd");
      expect(acme).toBeDefined();
      expect(acme?.total_billed).toBe(531000.0);
      expect(acme?.total_settled).toBe(209000.0);
      expect(acme?.outstanding_balance).toBe(322000.0);
      expect(acme?.unbilled_value).toBe(0.0);
      expect(acme?.overdue_exposure).toBe(0.0);

      // Nexus Dynamics LLP (Unbilled PO-NEXUS-881 ₹2,95,000)
      const nexus = rows.find((r) => r.customer_name === "Nexus Dynamics LLP");
      expect(nexus).toBeDefined();
      expect(nexus?.total_billed).toBe(0.0);
      expect(nexus?.total_settled).toBe(0.0);
      expect(nexus?.outstanding_balance).toBe(0.0);
      expect(nexus?.unbilled_value).toBe(295000.0);
      expect(nexus?.overdue_exposure).toBe(0.0);
    });
  });

  describe("Report 4: Executive Attainment & Quota Summary", () => {
    it("reconciles Stage 4 targets on strictly tax-exclusive basis for FY 2026-27 (₹75L / ₹4.5L = 6.0%)", () => {
      const report = getExecutiveAttainmentReport(invoices, initialTargets, { fy: "FY 2026-27" });
      const { summary, rows } = report;

      // FY 2026-27 Target: ₹40L + ₹35L = ₹75,00,000
      expect(summary.total_target).toBe(7500000.0);
      // Actual Sales: Neha Rao closed INV-2026-042 exclusive_amount = ₹4,50,000
      expect(summary.total_actual_sales).toBe(450000.0);
      // Quota Attainment: 4.5L / 75L = 6.0%
      expect(summary.overall_achievement_pct).toBe(6.0);
      // Remaining: 75L - 4.5L = ₹70,50,000
      expect(summary.total_remaining).toBe(7050000.0);

      // Neha Rao breakdown
      const neha = rows.find((r) => r.executive_name === "Neha Rao");
      expect(neha).toBeDefined();
      expect(neha?.yearly_target).toBe(4000000.0);
      expect(neha?.actual_sales).toBe(450000.0);
      expect(neha?.achievement_pct).toBe(11.3); // 4.5L / 40L = 11.25% -> 11.3%
      expect(neha?.remaining_target).toBe(3550000.0);
      expect(neha?.order_count).toBe(1);

      // Kavya Nair breakdown (PO-NEXUS-881 is unbilled so actual_sales = 0)
      const kavya = rows.find((r) => r.executive_name === "Kavya Nair");
      expect(kavya).toBeDefined();
      expect(kavya?.yearly_target).toBe(3500000.0);
      expect(kavya?.actual_sales).toBe(0.0);
      expect(kavya?.achievement_pct).toBe(0.0);
      expect(kavya?.remaining_target).toBe(3500000.0);
      expect(kavya?.order_count).toBe(0);
    });

    it("reconciles Stage 4 targets for FY 2025-26 (₹91L / ₹0 = 0.0%)", () => {
      const report = getExecutiveAttainmentReport(invoices, initialTargets, { fy: "FY 2025-26" });
      const { summary } = report;

      // FY 2025-26 Target: ₹36L + ₹30L + ₹25L = ₹91,00,000
      expect(summary.total_target).toBe(9100000.0);
      expect(summary.total_actual_sales).toBe(0.0);
      expect(summary.overall_achievement_pct).toBe(0.0);
      expect(summary.total_remaining).toBe(9100000.0);
    });
  });

  describe("Report 5: AR Aging Summary & Pinned Date Logic", () => {
    it("classifies INV-2026-042 into Current / Not Due bucket with 0 days overdue as of 30-Apr-2026", () => {
      const report = getArAgingReport(invoices, pinnedDate, { fy: "FY 2026-27" });
      const { summary, rows } = report;

      expect(summary.as_of_date).toBe("2026-04-30");
      expect(summary.total_receivables).toBe(322000.0);
      expect(summary.total_overdue).toBe(0.0);

      const currentBucket = summary.buckets.find((b) => b.bucket === "Current / Not Due");
      expect(currentBucket).toBeDefined();
      expect(currentBucket?.amount).toBe(322000.0);
      expect(currentBucket?.count).toBe(1);

      // Verify all overdue buckets are ₹0.00
      const otherBuckets = summary.buckets.filter((b) => b.bucket !== "Current / Not Due");
      otherBuckets.forEach((b) => {
        expect(b.amount).toBe(0.0);
        expect(b.count).toBe(0);
      });

      expect(rows).toHaveLength(1);
      const firstAging = rows[0]!;
      expect(firstAging.invoice_number).toBe("INV-2026-042");
      expect(firstAging.days_overdue).toBe(0);
      expect(firstAging.bucket).toBe("Current / Not Due");
      expect(firstAging.outstanding_balance).toBe(322000.0);
    });

    it("correctly classifies an overdue invoice past its due date", () => {
      const agingRow = {
        invoice_number: "INV-TEST-001",
        due_date: "2026-04-10",
        computed_status: "OVERDUE",
        outstanding_balance: 50000.0,
      };

      const result = classifyAging(agingRow, pinnedDate); // 30-Apr-2026 vs 10-Apr-2026 -> 20 days overdue
      expect(result.daysOverdue).toBe(20);
      expect(result.overdue).toBe(true);
      expect(result.bucket).toBe("1–30 days");
    });
  });

  describe("Report Filtering & Real-time Recalculation", () => {
    it("filters by customer name across all reports", () => {
      const invReport = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", customer: "Acme Cloud Solutions Pvt Ltd" },
        pinnedDate,
      );
      expect(invReport.summary.total_invoiced).toBe(531000.0);
      expect(invReport.rows).toHaveLength(1);

      const nexusInvReport = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", customer: "Nexus Dynamics LLP" },
        pinnedDate,
      );
      expect(nexusInvReport.summary.total_invoiced).toBe(0.0);
      expect(nexusInvReport.rows).toHaveLength(0);
    });

    it("filters by executive across reports", () => {
      const nehaReport = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", executive: "Neha Rao" },
        pinnedDate,
      );
      expect(nehaReport.summary.total_invoiced).toBe(531000.0);

      const kavyaReport = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", executive: "Kavya Nair" },
        pinnedDate,
      );
      expect(kavyaReport.summary.total_invoiced).toBe(0.0);
    });

    it("filters by text search query", () => {
      const searchMatch = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", query: "INV-2026-042" },
        pinnedDate,
      );
      expect(searchMatch.rows).toHaveLength(1);

      const searchMismatch = getInvoicesReceivablesReport(
        invoices,
        { fy: "FY 2026-27", query: "NONEXISTENT" },
        pinnedDate,
      );
      expect(searchMismatch.rows).toHaveLength(0);
      expect(searchMismatch.summary.total_invoiced).toBe(0);
    });
  });

  describe("Reconciliation with Authoritative Export Engine", () => {
    it("report table totals reconcile exactly with exported dataset totals", () => {
      const fy = "FY 2026-27";
      const exportRows = compileExportRows(invoices, fy);
      const rawExportTotals = calculateExportTotals(exportRows);

      // Issued scope export rows (matching Invoices & Receivables report scope)
      const issuedExportRows = exportRows.filter(
        (r) => Boolean(r["Invoice Number"]?.trim()) && r.Status !== "CANCELLED",
      );
      const issuedExportTotals = calculateExportTotals(issuedExportRows);

      const report = getInvoicesReceivablesReport(invoices, { fy }, pinnedDate);
      const { summary } = report;

      // Invoiced Gross matches exported Total Invoiced
      expect(summary.total_invoiced).toBe(issuedExportTotals.totalInvoiced);
      expect(summary.total_invoiced).toBe(rawExportTotals.totalInvoiced);

      // Settled matches exported Total Settled
      expect(summary.total_settled).toBe(issuedExportTotals.totalSettled);
      expect(summary.total_settled).toBe(rawExportTotals.totalSettled);

      // Cash matches exported Cash Received
      expect(summary.total_cash).toBe(issuedExportTotals.totalCash);
      expect(summary.total_cash).toBe(rawExportTotals.totalCash);

      // TDS matches exported TDS Deducted
      expect(summary.total_tds).toBe(issuedExportTotals.totalTds);
      expect(summary.total_tds).toBe(rawExportTotals.totalTds);

      // Outstanding matches issued exported Balance Outstanding (₹3,22,000)
      expect(summary.total_outstanding).toBe(issuedExportTotals.totalOutstanding);
      expect(summary.total_outstanding).toBe(322000.0);

      // Raw export totals include unbilled PO-NEXUS-881 (₹2,95,000)
      expect(rawExportTotals.totalOutstanding).toBe(322000.0 + 295000.0);
      expect(summary.unbilled_orders_total).toBe(295000.0);

      // Exact numerical baseline verification
      expect(issuedExportTotals.totalInvoiced).toBe(531000.0);
      expect(issuedExportTotals.totalCash).toBe(200000.0);
      expect(issuedExportTotals.totalTds).toBe(9000.0);
      expect(issuedExportTotals.totalSettled).toBe(209000.0);
      expect(issuedExportTotals.totalOutstanding).toBe(322000.0);
    });
  });
});
