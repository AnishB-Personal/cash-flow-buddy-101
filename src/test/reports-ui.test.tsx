import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MockSessionProvider } from "@/components/collectflow/session";
import { ReportsHub } from "@/components/collectflow/reports-hub";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockSessionProvider initialMobile={false}>{children}</MockSessionProvider>;
}

describe("ReportsHub UI & Financial Reconciliation Integration", () => {
  it("renders ReportsHub with all 5 report tabs and exclusion banner", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    expect(screen.getByTestId("reports-hub")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /financial exclusion notes/i })).toBeInTheDocument();
    expect(screen.getAllByText(/PO-NEXUS-881/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/INV-2026-041/i).length).toBeGreaterThanOrEqual(1);

    // 5 tabs present
    expect(screen.getByTestId("tab-invoices")).toBeInTheDocument();
    expect(screen.getByTestId("tab-payments")).toBeInTheDocument();
    expect(screen.getByTestId("tab-customers")).toBeInTheDocument();
    expect(screen.getByTestId("tab-executives")).toBeInTheDocument();
    expect(screen.getByTestId("tab-aging")).toBeInTheDocument();

    // Search and filter tools
    expect(screen.getByTestId("reports-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("export-report-btn")).toBeInTheDocument();
  });

  it("renders Tab 1: Invoices & Receivables with verified baseline metrics", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    // Initial default tab is invoices
    expect(screen.getByTestId("invoices-report-view")).toBeInTheDocument();

    // KPI verification: Invoiced ₹5,31,000, Outstanding ₹3,22,000, Settled ₹2,09,000
    const grossKpi = screen.getByTestId("kpi-invoiced-gross");
    expect(grossKpi).toHaveTextContent("₹5,31,000");

    const outstandingKpi = screen.getByTestId("kpi-outstanding-receivables");
    expect(outstandingKpi).toHaveTextContent("₹3,22,000");

    const settledKpi = screen.getByTestId("kpi-total-settled");
    expect(settledKpi).toHaveTextContent("₹2,09,000");

    const rateKpi = screen.getByTestId("kpi-collection-rate");
    expect(rateKpi).toHaveTextContent("39.4%");

    // Table rows
    const invoiceRow = screen.getByTestId("invoice-row-101");
    expect(invoiceRow).toBeInTheDocument();
    expect(within(invoiceRow).getByText("INV-2026-042")).toBeInTheDocument();
    expect(within(invoiceRow).getByText("Acme Cloud Solutions Pvt Ltd")).toBeInTheDocument();
    expect(within(invoiceRow).getByText("Neha Rao")).toBeInTheDocument();

    // Mobile card representation is present
    expect(screen.getByTestId("invoices-report-cards")).toBeInTheDocument();
  });

  it("switches to Tab 2: Collections Ledger and displays payment details", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    // Click Tab 2
    fireEvent.click(screen.getByTestId("tab-payments"));

    expect(screen.getByTestId("payments-report-view")).toBeInTheDocument();

    // KPI verification: Cash ₹2,00,000, TDS ₹9,000, Total Settled ₹2,09,000
    const cashKpi = screen.getByTestId("kpi-cash-collected");
    expect(cashKpi).toHaveTextContent("₹2,00,000");

    const tdsKpi = screen.getByTestId("kpi-tds-deducted");
    expect(tdsKpi).toHaveTextContent("₹9,000");

    const settledKpi = screen.getByTestId("kpi-payments-settled");
    expect(settledKpi).toHaveTextContent("₹2,09,000");

    // Remittance row
    const paymentRow = screen.getByTestId("payment-row-85");
    expect(paymentRow).toBeInTheDocument();
    expect(within(paymentRow).getByText("UTR-ICICI-9876543210")).toBeInTheDocument();
    expect(within(paymentRow).getByText("NEFT")).toBeInTheDocument();
    expect(within(paymentRow).getByText("194J (2%)")).toBeInTheDocument();
  });

  it("switches to Tab 3: Customer Exposure and displays client balances and unbilled order", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    // Click Tab 3
    fireEvent.click(screen.getByTestId("tab-customers"));

    expect(screen.getByTestId("customers-report-view")).toBeInTheDocument();

    // KPI verification: Billed ₹5,31,000, Outstanding ₹3,22,000
    const billedKpi = screen.getByTestId("kpi-customer-billed");
    expect(billedKpi).toHaveTextContent("₹5,31,000");

    const outstandingKpi = screen.getByTestId("kpi-customer-outstanding");
    expect(outstandingKpi).toHaveTextContent("₹3,22,000");

    // Acme Cloud Solutions Pvt Ltd
    const acmeRow = screen.getByTestId("customer-row-1");
    expect(within(acmeRow).getByText("Acme Cloud Solutions Pvt Ltd")).toBeInTheDocument();
    expect(within(acmeRow).getByText("Active Balance")).toBeInTheDocument();

    // Nexus Dynamics LLP
    const nexusRow = screen.getByTestId("customer-row-2");
    expect(within(nexusRow).getByText("Nexus Dynamics LLP")).toBeInTheDocument();
    expect(within(nexusRow).getByText("Unbilled Orders")).toBeInTheDocument();
    expect(within(nexusRow).getByText("₹2,95,000")).toBeInTheDocument();
  });

  it("switches to Tab 4: Executive Attainment and reconciles Stage 4 quota figures", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    // Click Tab 4
    fireEvent.click(screen.getByTestId("tab-executives"));

    expect(screen.getByTestId("executives-report-view")).toBeInTheDocument();

    // KPI verification: Annual Quota ₹75,00,000, Actual Sales ₹4,50,000, Attainment 6.0%
    const quotaKpi = screen.getByTestId("kpi-annual-quota");
    expect(quotaKpi).toHaveTextContent("₹75,00,000");

    const actualKpi = screen.getByTestId("kpi-actual-invoiced-sales");
    expect(actualKpi).toHaveTextContent("₹4,50,000");

    const attainmentKpi = screen.getByTestId("kpi-quota-attainment");
    expect(attainmentKpi).toHaveTextContent("6.0%");

    const remainingKpi = screen.getByTestId("kpi-remaining-quota");
    expect(remainingKpi).toHaveTextContent("₹70,50,000");

    // Neha Rao row
    const nehaRow = screen.getByTestId("exec-row-3");
    expect(within(nehaRow).getByText("Neha Rao")).toBeInTheDocument();
    expect(within(nehaRow).getByText("₹40,00,000")).toBeInTheDocument();
    expect(within(nehaRow).getByText("₹4,50,000")).toBeInTheDocument();
    expect(within(nehaRow).getByText("11.3%")).toBeInTheDocument();

    // Kavya Nair row (PO-NEXUS-881 is unbilled so actual = 0)
    const kavyaRow = screen.getByTestId("exec-row-4");
    expect(within(kavyaRow).getByText("Kavya Nair")).toBeInTheDocument();
    expect(within(kavyaRow).getAllByText("₹35,00,000").length).toBe(2); // yearly_target and remaining_target
    expect(within(kavyaRow).getByText("₹0")).toBeInTheDocument();
    expect(within(kavyaRow).getByText("0.0%")).toBeInTheDocument();
  });

  it("switches to Tab 5: AR Aging Summary and verifies pinned date and Current bucket", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    // Click Tab 5
    fireEvent.click(screen.getByTestId("tab-aging"));

    expect(screen.getByTestId("aging-report-view")).toBeInTheDocument();

    // KPI verification: Total Receivables ₹3,22,000, Current / Not Due ₹3,22,000, Overdue ₹0
    const recKpi = screen.getByTestId("kpi-total-receivables");
    expect(recKpi).toHaveTextContent("₹3,22,000");

    const currentKpi = screen.getByTestId("kpi-current-not-due");
    expect(currentKpi).toHaveTextContent("₹3,22,000");

    const overdueKpi = screen.getByTestId("kpi-total-overdue");
    expect(overdueKpi).toHaveTextContent("₹0");

    const dateKpi = screen.getByTestId("kpi-as-of-date");
    expect(dateKpi).toHaveTextContent("30 Apr 2026");

    // Buckets grid has Current / Not Due bucket with 322k
    const currentGridBucket = screen.getByTestId("bucket-current---not-due");
    expect(currentGridBucket).toHaveTextContent("₹3,22,000");
    expect(currentGridBucket).toHaveTextContent("1 invoice");

    // Overdue buckets have 0 invoices
    const overdue1_30 = screen.getByTestId("bucket-1-30-days");
    expect(overdue1_30).toHaveTextContent("₹0");
    expect(overdue1_30).toHaveTextContent("0 invoices");

    // Invoice row INV-2026-042
    const invoiceRow = screen.getByTestId("aging-row-101");
    expect(within(invoiceRow).getByText("INV-2026-042")).toBeInTheDocument();
    expect(within(invoiceRow).getByText("0 days")).toBeInTheDocument();
  });

  it("triggers onOpenExport callback when clicking Export Report button", () => {
    const onOpenExportMock = vi.fn();
    render(
      <Wrapper>
        <ReportsHub onOpenExport={onOpenExportMock} />
      </Wrapper>,
    );

    const exportBtn = screen.getByTestId("export-report-btn");
    fireEvent.click(exportBtn);

    expect(onOpenExportMock).toHaveBeenCalledTimes(1);
  });

  it("opens local ExportDrawer when onOpenExport is not supplied", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    const exportBtn = screen.getByTestId("export-report-btn");
    fireEvent.click(exportBtn);

    // Export drawer dialog opens
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Generate Financial Export/i)).toBeInTheDocument();
  });

  it("filters data dynamically in real-time when search query is entered", () => {
    render(
      <Wrapper>
        <ReportsHub />
      </Wrapper>,
    );

    const searchInput = screen.getByTestId("reports-search-input");
    fireEvent.change(searchInput, { target: { value: "NONEXISTENT_QUERY" } });

    // Table should show empty state
    expect(screen.queryByTestId("invoice-row-101")).not.toBeInTheDocument();
    expect(screen.getByText("No matching records")).toBeInTheDocument();

    // Clear search using reset filters button
    const resetBtn = screen.getByTestId("reset-filters-btn");
    fireEvent.click(resetBtn);

    expect(screen.getByTestId("invoice-row-101")).toBeInTheDocument();
    expect(screen.getAllByText("INV-2026-042").length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state cleanly when empty prop is true", () => {
    render(
      <Wrapper>
        <ReportsHub empty={true} />
      </Wrapper>,
    );

    expect(screen.getByTestId("kpi-invoiced-gross")).toHaveTextContent("₹0");
    expect(screen.getByTestId("kpi-outstanding-receivables")).toHaveTextContent("₹0");
    expect(screen.queryByTestId("invoice-row-101")).not.toBeInTheDocument();
  });
});
