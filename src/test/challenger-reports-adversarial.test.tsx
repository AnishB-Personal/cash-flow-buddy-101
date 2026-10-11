import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MockSessionProvider } from "@/components/collectflow/session";
import { ReportsHub } from "@/components/collectflow/reports-hub";
import fixtures from "@/data/collectflow.json";
import {
  getInvoicesReceivablesReport,
  getPaymentsLedgerReport,
  getCustomerExposureReport,
  getExecutiveAttainmentReport,
  getArAgingReport,
  classifyAging,
  agingBuckets,
  type AgingRecord,
} from "@/data/reporting";
import { readInitialTargets, type SalesTarget } from "@/data/targets";
import type { Invoice } from "@/data/collectflow";

function Wrapper({
  children,
  initialMobile = false,
}: {
  children: React.ReactNode;
  initialMobile?: boolean;
}) {
  return <MockSessionProvider initialMobile={initialMobile}>{children}</MockSessionProvider>;
}

describe("Adversarial Challenger Suite: Reports Hub, Boundaries & Edge Cases", () => {
  const invoices = fixtures.invoices as Invoice[];
  const customers = fixtures.customers;
  const initialTargets = readInitialTargets();
  const pinnedDate = "2026-04-30";

  // ==========================================================================
  // 1. FILTER EDGE CASES: 0 NaN / 0 NULL CHECKS
  // ==========================================================================
  describe("1. Filter Edge Cases: Empty Results, Unknown Search, Rapid FY Switching", () => {
    it("handles empty invoice dataset without any NaN, null, or division-by-zero crashes", () => {
      render(
        <Wrapper>
          <ReportsHub empty={true} />
        </Wrapper>,
      );

      // Verify hub renders
      expect(screen.getByTestId("reports-hub")).toBeInTheDocument();
      // EmptyState component is rendered
      expect(screen.getByText("No matching records")).toBeInTheDocument();

      // Ensure KPI cards display ₹0 / 0% without NaN or null
      const invoicedGross = screen.getByTestId("kpi-invoiced-gross");
      expect(invoicedGross).toHaveTextContent("₹0");
      expect(invoicedGross).not.toHaveTextContent("NaN");
      expect(invoicedGross).not.toHaveTextContent("null");

      const balance = screen.getByTestId("kpi-outstanding-receivables");
      expect(balance).toHaveTextContent("₹0");
      expect(balance).not.toHaveTextContent("NaN");

      const settled = screen.getByTestId("kpi-total-settled");
      expect(settled).toHaveTextContent("₹0");
      expect(settled).not.toHaveTextContent("NaN");

      const collectionRate = screen.getByTestId("kpi-collection-rate");
      expect(collectionRate).toHaveTextContent("0%");
      expect(collectionRate).not.toHaveTextContent("NaN");

      // Verify Tab 2 (Payments) with empty dataset
      fireEvent.click(screen.getByTestId("tab-payments"));
      expect(screen.getByTestId("kpi-cash-collected")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-cash-collected")).not.toHaveTextContent("NaN");
      expect(screen.getByTestId("kpi-tds-deducted")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-payments-settled")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-transaction-count")).toHaveTextContent("0");

      // Verify Tab 3 (Customers) with empty dataset
      fireEvent.click(screen.getByTestId("tab-customers"));
      expect(screen.getByTestId("kpi-customer-billed")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-customer-outstanding")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-customer-settled")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-customer-overdue")).toHaveTextContent("₹0");

      // Verify Tab 4 (Executives) with empty dataset
      fireEvent.click(screen.getByTestId("tab-executives"));
      expect(screen.getByTestId("kpi-actual-invoiced-sales")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-quota-attainment")).toHaveTextContent("0.0%");
      expect(screen.getByTestId("kpi-quota-attainment")).not.toHaveTextContent("NaN");

      // Verify Tab 5 (Aging) with empty dataset
      fireEvent.click(screen.getByTestId("tab-aging"));
      expect(screen.getByTestId("kpi-total-receivables")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-current-not-due")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-total-overdue")).toHaveTextContent("₹0");
    });

    it("handles non-existent search query gracefully across all tabs with zero NaN", () => {
      render(
        <Wrapper>
          <ReportsHub />
        </Wrapper>,
      );

      const searchInput = screen.getByTestId("reports-search-input");
      fireEvent.change(searchInput, { target: { value: "NonExistentCustomer_XYZ_9999" } });

      // Tab 1: Invoices view displays empty state and 0 values
      expect(screen.getByText("No matching records")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-invoiced-gross")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-invoiced-gross")).not.toHaveTextContent("NaN");
      expect(screen.getByTestId("kpi-outstanding-receivables")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-total-settled")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-collection-rate")).toHaveTextContent("0%");

      // Switch to Collections Ledger
      fireEvent.click(screen.getByTestId("tab-payments"));
      expect(screen.getByText("No matching records")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-cash-collected")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-payments-settled")).toHaveTextContent("₹0");

      // Switch to Customer Exposure
      fireEvent.click(screen.getByTestId("tab-customers"));
      expect(screen.getByText("No matching records")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-customer-billed")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-customer-outstanding")).toHaveTextContent("₹0");

      // Switch to AR Aging
      fireEvent.click(screen.getByTestId("tab-aging"));
      expect(screen.getByText("No matching records")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-total-receivables")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-current-not-due")).toHaveTextContent("₹0");

      // Reset filters button clears search and restores baseline
      const resetBtn = screen.getByTestId("reset-filters-btn");
      fireEvent.click(resetBtn);
      expect(searchInput).toHaveValue("");
      // Since we are on tab-aging, verify aging-row-101 is restored
      expect(screen.getByTestId("aging-row-101")).toBeInTheDocument();

      // Switch back to tab-invoices and verify invoice-row-101 is restored
      fireEvent.click(screen.getByTestId("tab-invoices"));
      expect(screen.getByTestId("invoice-row-101")).toBeInTheDocument();
    });

    it("survives rapid FY switches across all 5 calculation engines and mounted views without NaN", () => {
      // Test calculation engines across all FYs
      const fys = ["FY 2026-27", "FY 2025-26", "FY 2024-25", "ALL"] as const;

      for (const targetFy of fys) {
        const invRep = getInvoicesReceivablesReport(invoices, { fy: targetFy });
        expect(Number.isFinite(invRep.summary.total_invoiced)).toBe(true);
        expect(Number.isFinite(invRep.summary.collection_rate)).toBe(true);
        expect(invRep.summary.collection_rate).not.toBeNaN();

        const payRep = getPaymentsLedgerReport(invoices, { fy: targetFy });
        expect(Number.isFinite(payRep.summary.total_settled)).toBe(true);
        expect(payRep.summary.total_settled).not.toBeNaN();

        const custRep = getCustomerExposureReport(invoices, customers, { fy: targetFy });
        expect(Number.isFinite(custRep.summary.total_billed)).toBe(true);
        expect(custRep.summary.total_billed).not.toBeNaN();

        const execRep = getExecutiveAttainmentReport(invoices, initialTargets, { fy: targetFy });
        expect(Number.isFinite(execRep.summary.overall_achievement_pct)).toBe(true);
        expect(execRep.summary.overall_achievement_pct).not.toBeNaN();

        const agingRep = getArAgingReport(invoices, pinnedDate, { fy: targetFy });
        expect(Number.isFinite(agingRep.summary.total_receivables)).toBe(true);
        expect(agingRep.summary.total_receivables).not.toBeNaN();
      }

      // Test component mounting with different FYs
      const { unmount } = render(
        <Wrapper>
          <ReportsHub key="fy-25" fy="FY 2025-26" />
        </Wrapper>,
      );
      expect(screen.getByTestId("kpi-invoiced-gross")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-collection-rate")).toHaveTextContent("0%");
      unmount();

      render(
        <Wrapper>
          <ReportsHub key="fy-24" fy="FY 2024-25" />
        </Wrapper>,
      );
      expect(screen.getByTestId("kpi-invoiced-gross")).toHaveTextContent("₹0");
      expect(screen.getByTestId("kpi-collection-rate")).toHaveTextContent("0%");
    });

    it("guarantees division by zero safety in all 5 calculation engines", () => {
      // 1. InvoicesReceivables: 0 invoices
      const rep1 = getInvoicesReceivablesReport([], { fy: "FY 2026-27" });
      expect(rep1.summary.collection_rate).toBe(0);
      expect(Number.isFinite(rep1.summary.collection_rate)).toBe(true);

      // 2. PaymentsLedger: 0 payments
      const rep2 = getPaymentsLedgerReport([], { fy: "FY 2026-27" });
      expect(rep2.summary.total_settled).toBe(0);

      // 3. CustomerExposure: 0 invoices
      const rep3 = getCustomerExposureReport([], [], { fy: "FY 2026-27" });
      expect(rep3.summary.total_billed).toBe(0);

      // 4. ExecutiveAttainment: 0 targets
      const rep4 = getExecutiveAttainmentReport([], [], { fy: "FY 2026-27" });
      expect(rep4.summary.overall_achievement_pct).toBe(0);
      expect(Number.isFinite(rep4.summary.overall_achievement_pct)).toBe(true);

      // 5. ArAging: 0 invoices
      const rep5 = getArAgingReport([], pinnedDate);
      expect(rep5.summary.total_receivables).toBe(0);
      expect(rep5.summary.total_overdue).toBe(0);
    });
  });

  // ==========================================================================
  // 2. FINANCIAL BOUNDARIES STRESS: PO-NEXUS-881 & INV-2026-041 EXCLUSION
  // ==========================================================================
  describe("2. Financial Boundary Stress: Strict Exclusion of PO-NEXUS-881 and INV-2026-041", () => {
    it("unbilled order PO-NEXUS-881 is strictly excluded across ALL scopes and filters", () => {
      // 1. Invoices & Receivables
      const allReport = getInvoicesReceivablesReport(invoices, { fy: "ALL" }, pinnedDate);
      expect(allReport.summary.total_invoiced).toBe(531000.0);
      expect(allReport.summary.total_outstanding).toBe(322000.0);
      expect(allReport.summary.unbilled_orders_count).toBe(1);
      expect(allReport.summary.unbilled_orders_exclusive).toBe(250000.0);
      expect(allReport.summary.unbilled_orders_total).toBe(295000.0);
      expect(allReport.rows.some((r) => r.po_number === "PO-NEXUS-881")).toBe(false);

      // Filtering by customer "Nexus Dynamics LLP"
      const nexusReport = getInvoicesReceivablesReport(
        invoices,
        { customer: "Nexus Dynamics LLP" },
        pinnedDate,
      );
      expect(nexusReport.summary.total_invoiced).toBe(0.0);
      expect(nexusReport.summary.total_outstanding).toBe(0.0);
      expect(nexusReport.summary.unbilled_orders_count).toBe(1);
      expect(nexusReport.rows).toHaveLength(0);

      // Filtering by executive "Kavya Nair"
      const kavyaReport = getInvoicesReceivablesReport(
        invoices,
        { executive: "Kavya Nair" },
        pinnedDate,
      );
      expect(kavyaReport.summary.total_invoiced).toBe(0.0);
      expect(kavyaReport.summary.total_outstanding).toBe(0.0);
      expect(kavyaReport.summary.unbilled_orders_count).toBe(1);
      expect(kavyaReport.rows).toHaveLength(0);

      // 2. Payments Ledger
      const paymentsReport = getPaymentsLedgerReport(invoices, { fy: "ALL" });
      expect(paymentsReport.rows.some((r) => r.po_number === "PO-NEXUS-881")).toBe(false);

      // 3. Customer Exposure Summary
      const customerReport = getCustomerExposureReport(
        invoices,
        customers,
        { fy: "ALL" },
        pinnedDate,
      );
      const nexusCustomerRow = customerReport.rows.find(
        (r) => r.customer_name === "Nexus Dynamics LLP",
      );
      expect(nexusCustomerRow).toBeDefined();
      expect(nexusCustomerRow?.total_billed).toBe(0.0);
      expect(nexusCustomerRow?.outstanding_balance).toBe(0.0);
      expect(nexusCustomerRow?.total_settled).toBe(0.0);
      expect(nexusCustomerRow?.unbilled_value).toBe(295000.0);

      // 4. Executive Attainment Summary
      const attainmentReport = getExecutiveAttainmentReport(invoices, initialTargets, {
        fy: "FY 2026-27",
      });
      const kavyaAttainment = attainmentReport.rows.find((r) => r.executive_name === "Kavya Nair");
      expect(kavyaAttainment).toBeDefined();
      expect(kavyaAttainment?.actual_sales).toBe(0.0);
      expect(kavyaAttainment?.achievement_pct).toBe(0.0);
      expect(kavyaAttainment?.remaining_target).toBe(3500000.0);
      expect(kavyaAttainment?.order_count).toBe(0);
      expect(attainmentReport.summary.excluded_unbilled_sales).toBe(250000.0);

      // 5. AR Aging Summary
      const agingReport = getArAgingReport(invoices, pinnedDate, { fy: "ALL" });
      expect(agingReport.rows.some((r) => r.po_number === "PO-NEXUS-881")).toBe(false);
      expect(agingReport.summary.total_receivables).toBe(322000.0);
    });

    it("cancelled invoice INV-2026-041 never bleeds into active revenue or receivables", () => {
      // Create synthetic dataset with cancelled invoice INV-2026-041
      const cancelledInvoice: Invoice = {
        id: 103,
        fy_code: "FY 2026-27",
        order_type: "PO",
        po_number: "PO-CANCEL-001",
        po_date: "2026-04-11",
        customer_id: 1,
        executive_id: 3,
        customer_name: "Acme Cloud Solutions Pvt Ltd",
        customer_gstin: "29AAAAA0000A1Z5",
        customer_address: "Tech Park, Whitefield, Bangalore",
        customer_state: "Karnataka",
        currency: "INR",
        exchange_rate: 1.0,
        original_amount: 100000.0,
        exclusive_amount: 100000.0,
        tax_rate: 0.18,
        tax_amount: 18000.0,
        total_amount: 118000.0,
        invoice_number: "INV-2026-041",
        invoice_date: "2026-04-12",
        due_date: "2026-04-25",
        remarks: "Cancelled prior to payment",
        payment_status: "CANCELLED",
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 118000.0,
        computed_status: "CANCELLED",
        executive_name: "Neha Rao",
        line_items: [],
        payments: [],
      };

      const mixedInvoices = [...invoices, cancelledInvoice];

      // 1. Invoices & Receivables
      const rep1 = getInvoicesReceivablesReport(mixedInvoices, { fy: "FY 2026-27" }, pinnedDate);
      expect(rep1.summary.total_invoiced).toBe(531000.0); // Exactly INV-2026-042 only
      expect(rep1.summary.total_outstanding).toBe(322000.0);
      expect(rep1.summary.cancelled_invoices_count).toBe(1);
      expect(rep1.rows.some((r) => r.invoice_number === "INV-2026-041")).toBe(false);

      // 2. Payments Ledger
      const rep2 = getPaymentsLedgerReport(mixedInvoices, { fy: "FY 2026-27" });
      expect(rep2.rows.some((r) => r.invoice_number === "INV-2026-041")).toBe(false);

      // 3. Customer Exposure
      const rep3 = getCustomerExposureReport(
        mixedInvoices,
        customers,
        { fy: "FY 2026-27" },
        pinnedDate,
      );
      const acmeRow = rep3.rows.find((r) => r.customer_name === "Acme Cloud Solutions Pvt Ltd");
      expect(acmeRow?.total_billed).toBe(531000.0);
      expect(acmeRow?.outstanding_balance).toBe(322000.0);

      // 4. Executive Attainment
      const rep4 = getExecutiveAttainmentReport(mixedInvoices, initialTargets, {
        fy: "FY 2026-27",
      });
      const nehaRow = rep4.rows.find((r) => r.executive_name === "Neha Rao");
      expect(nehaRow?.actual_sales).toBe(450000.0); // 100,000 exclusive from cancelled invoice is excluded!
      expect(nehaRow?.order_count).toBe(1);

      // 5. AR Aging
      const rep5 = getArAgingReport(mixedInvoices, pinnedDate, { fy: "FY 2026-27" });
      expect(rep5.summary.total_receivables).toBe(322000.0);
      expect(rep5.rows.some((r) => r.invoice_number === "INV-2026-041")).toBe(false);
    });

    it("verifies AR aging bucket classification against pinned date (2026-04-30) boundary dates", () => {
      const makeAgingRecord = (
        dueDate: string | null,
        balance: number,
        invoiceNum: string | null = "INV-TEST-001",
        status = "PARTIAL",
      ): AgingRecord => ({
        invoice_number: invoiceNum,
        due_date: dueDate,
        computed_status: status,
        outstanding_balance: balance,
      });

      // 1. Future due date (e.g. INV-2026-042 due 2026-05-12) -> 0 days overdue, "Current / Not Due"
      const future = classifyAging(makeAgingRecord("2026-05-12", 322000), pinnedDate);
      expect(future.daysOverdue).toBe(0);
      expect(future.overdue).toBe(false);
      expect(future.bucket).toBe("Current / Not Due");

      // 2. Exact pinned date (2026-04-30) -> 0 days overdue, "Current / Not Due"
      const exact = classifyAging(makeAgingRecord("2026-04-30", 50000), pinnedDate);
      expect(exact.daysOverdue).toBe(0);
      expect(exact.overdue).toBe(false);
      expect(exact.bucket).toBe("Current / Not Due");

      // 3. 1 day overdue (due 2026-04-29) -> 1 day overdue, "1–30 days"
      const day1 = classifyAging(makeAgingRecord("2026-04-29", 10000), pinnedDate);
      expect(day1.daysOverdue).toBe(1);
      expect(day1.overdue).toBe(true);
      expect(day1.bucket).toBe("1–30 days");

      // 4. 30 days overdue (due 2026-03-31) -> 30 days overdue, "1–30 days"
      const day30 = classifyAging(makeAgingRecord("2026-03-31", 10000), pinnedDate);
      expect(day30.daysOverdue).toBe(30);
      expect(day30.bucket).toBe("1–30 days");

      // 5. 31 days overdue (due 2026-03-30) -> 31 days overdue, "31–60 days"
      const day31 = classifyAging(makeAgingRecord("2026-03-30", 10000), pinnedDate);
      expect(day31.daysOverdue).toBe(31);
      expect(day31.bucket).toBe("31–60 days");

      // 6. 60 days overdue (due 2026-03-01) -> 60 days overdue, "31–60 days"
      const day60 = classifyAging(makeAgingRecord("2026-03-01", 10000), pinnedDate);
      expect(day60.daysOverdue).toBe(60);
      expect(day60.bucket).toBe("31–60 days");

      // 7. 61 days overdue (due 2026-02-28) -> 61 days overdue, "61–90 days"
      const day61 = classifyAging(makeAgingRecord("2026-02-28", 10000), pinnedDate);
      expect(day61.daysOverdue).toBe(61);
      expect(day61.bucket).toBe("61–90 days");

      // 8. 90 days overdue (due 2026-01-30) -> 90 days overdue, "61–90 days"
      const day90 = classifyAging(makeAgingRecord("2026-01-30", 10000), pinnedDate);
      expect(day90.daysOverdue).toBe(90);
      expect(day90.bucket).toBe("61–90 days");

      // 9. 91 days overdue (due 2026-01-29) -> 91 days overdue, "91–180 days"
      const day91 = classifyAging(makeAgingRecord("2026-01-29", 10000), pinnedDate);
      expect(day91.daysOverdue).toBe(91);
      expect(day91.bucket).toBe("91–180 days");

      // 10. 180 days overdue (due 2025-11-01) -> 180 days overdue, "91–180 days"
      const day180 = classifyAging(makeAgingRecord("2025-11-01", 10000), pinnedDate);
      expect(day180.daysOverdue).toBe(180);
      expect(day180.bucket).toBe("91–180 days");

      // 11. 181+ days overdue (due 2025-10-31) -> 181 days overdue, "180+ days"
      const day181 = classifyAging(makeAgingRecord("2025-10-31", 10000), pinnedDate);
      expect(day181.daysOverdue).toBe(181);
      expect(day181.bucket).toBe("180+ days");

      // 12. Null due date -> 0 days overdue, "Current / Not Due"
      const nullDue = classifyAging(makeAgingRecord(null, 10000), pinnedDate);
      expect(nullDue.daysOverdue).toBe(0);
      expect(nullDue.bucket).toBe("Current / Not Due");

      // 13. Cancelled record -> excluded completely (bucket undefined)
      const cancelled = classifyAging(
        makeAgingRecord("2026-03-01", 10000, "INV-CANCELLED", "CANCELLED"),
        pinnedDate,
      );
      expect(cancelled.bucket).toBeUndefined();

      // 14. Unbilled record (invoice_number null) -> excluded completely
      const unbilled = classifyAging(makeAgingRecord("2026-03-01", 10000, null), pinnedDate);
      expect(unbilled.bucket).toBeUndefined();

      // 15. Zero balance record -> excluded completely
      const zeroBalance = classifyAging(makeAgingRecord("2026-03-01", 0), pinnedDate);
      expect(zeroBalance.bucket).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3. PERSISTENCE & INVARIANTS ORACLE CHECKS
  // ==========================================================================
  describe("3. Financial Invariants, Baseline Users, and Stage 4 Targets Integrity", () => {
    it("confirms all 7 financial invariants match the approved baseline fixture exactly", () => {
      const summary = fixtures.dashboard_summary.kpis;
      expect(summary.total_invoiced).toBe(531000.0);
      expect(summary.total_cash_collected).toBe(200000.0);
      expect(summary.total_tds_recognized).toBe(9000.0);
      expect(summary.total_settled).toBe(209000.0);
      expect(summary.total_outstanding).toBe(322000.0);

      const unbilledOrder = fixtures.invoices.find((i) => i.po_number === "PO-NEXUS-881");
      expect(unbilledOrder?.total_amount).toBe(295000.0);
      expect(fixtures.reporting.asOfDate).toBe("2026-04-30");

      // Mathematical invariants
      expect(summary.total_cash_collected + summary.total_tds_recognized).toBe(
        summary.total_settled,
      );
      expect(summary.total_invoiced - summary.total_settled).toBe(summary.total_outstanding);
    });

    it("confirms 6 baseline users with immutable IDs and role privileges", () => {
      const users = fixtures.users;
      expect(users).toHaveLength(6);
      expect(users.map((u) => u.username)).toEqual([
        "admin",
        "finance_lead",
        "siliya",
        "syama",
        "anshar",
        "auditor",
      ]);
      expect(users.map((u) => u.role)).toEqual([
        "admin",
        "finance",
        "sales",
        "sales",
        "sales",
        "viewer",
      ]);
    });

    it("confirms Stage 4 sales targets for FY 2026-27 (₹75L) and FY 2025-26 (₹91L)", () => {
      const targets = readInitialTargets();
      const fy27Targets = targets.filter((t) => t.fy_code === "FY 2026-27");
      const fy27Total = fy27Targets.reduce((sum, t) => sum + t.yearly_target, 0);
      expect(fy27Total).toBe(7500000.0);

      const fy26Targets = targets.filter((t) => t.fy_code === "FY 2025-26");
      const fy26Total = fy26Targets.reduce((sum, t) => sum + t.yearly_target, 0);
      expect(fy26Total).toBe(9100000.0);
    });
  });
});
