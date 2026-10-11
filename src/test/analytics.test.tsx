import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { PerformanceAnalytics } from "@/components/collectflow/performance-analytics";
import { FinancialDashboard } from "@/components/collectflow/dashboard";
import { MockSessionProvider } from "@/components/collectflow/session";
import { INITIAL_TARGETS, type SalesTarget, type InvoiceSummary } from "@/data/targets";
import type { Invoice } from "@/data/collectflow";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sampleInvoices: Invoice[] = [
  {
    id: 101,
    fy_code: "FY 2026-27",
    order_type: "PO",
    po_number: "PO-CORP-2026-099",
    po_date: "2026-04-10",
    customer_id: 1,
    executive_id: 3,
    customer_name: "Acme Cloud Solutions Pvt Ltd",
    customer_gstin: "29AAAAA0000A1Z5",
    customer_address: "Tech Park, Whitefield, Bangalore",
    customer_state: "Karnataka",
    currency: "INR",
    exchange_rate: 1.0,
    original_amount: 450000.0,
    exclusive_amount: 450000.0,
    tax_rate: 0.18,
    tax_amount: 81000.0,
    total_amount: 531000.0,
    invoice_number: "INV-2026-042",
    invoice_date: "2026-04-12",
    due_date: "2026-05-12",
    remarks: "Cloud migration phase 1 milestone",
    payment_status: "PARTIAL",
    total_cash_paid: 200000.0,
    total_tds_deducted: 9000.0,
    total_paid: 209000.0,
    outstanding_balance: 322000.0,
    computed_status: "PARTIAL",
    executive_name: "Neha Rao",
    line_items: [],
    payments: [],
  },
  {
    id: 102,
    fy_code: "FY 2026-27",
    order_type: "PO",
    po_number: "PO-NEXUS-881",
    po_date: "2026-04-14",
    customer_id: 2,
    executive_id: 4,
    customer_name: "Nexus Dynamics LLP",
    customer_gstin: "27BBBBB1111B2Z6",
    customer_address: "Bandra-Kurla Complex, Mumbai",
    customer_state: "Maharashtra",
    currency: "INR",
    exchange_rate: 1.0,
    original_amount: 250000.0,
    exclusive_amount: 250000.0,
    tax_rate: 0.18,
    tax_amount: 45000.0,
    total_amount: 295000.0,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    remarks: "Pending project kickoff",
    payment_status: "PENDING",
    total_cash_paid: 0.0,
    total_tds_deducted: 0.0,
    total_paid: 0.0,
    outstanding_balance: 295000.0,
    computed_status: "UNBILLED",
    executive_name: "Kavya Nair",
    line_items: [],
    payments: [],
  },
  {
    id: 103,
    fy_code: "FY 2026-27",
    order_type: "PO",
    po_number: "PO-CANCELLED-999",
    po_date: "2026-04-15",
    customer_id: 1,
    executive_id: 3,
    customer_name: "Cancelled Customer",
    customer_gstin: "29AAAAA0000A1Z5",
    customer_address: "Bangalore",
    customer_state: "Karnataka",
    currency: "INR",
    exchange_rate: 1.0,
    original_amount: 100000.0,
    exclusive_amount: 100000.0,
    tax_rate: 0.18,
    tax_amount: 18000.0,
    total_amount: 118000.0,
    invoice_number: "INV-2026-099",
    invoice_date: "2026-04-15",
    due_date: "2026-05-15",
    remarks: "Cancelled order",
    payment_status: "CANCELLED",
    total_cash_paid: 0.0,
    total_tds_deducted: 0.0,
    total_paid: 0.0,
    outstanding_balance: 0.0,
    computed_status: "CANCELLED",
    executive_name: "Neha Rao",
    line_items: [],
    payments: [],
  },
];

describe("Performance Analytics UI & Calculations", () => {
  describe("Summary Metric Cards", () => {
    it("renders total target, actual exclusive sales, achievement %, and remaining target", () => {
      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      // Total target: 4,000,000 (Neha) + 3,500,000 (Kavya) = 7,500,000 (₹75,00,000)
      const targetCard = screen.getByTestId("metric-total-target");
      expect(within(targetCard).getByText("Total Annual Target")).toBeInTheDocument();
      expect(within(targetCard).getByText("₹75,00,000")).toBeInTheDocument();

      // Actual sales: Only issued non-cancelled invoices count.
      // Neha Rao (INV-2026-042): ₹4,50,000.
      // Kavya Nair (PO-NEXUS-881, UNBILLED): ₹0 (excluded).
      // Cancelled invoice 103 (100,000): ₹0 (excluded).
      // Team Total: ₹4,50,000
      const actualCard = screen.getByTestId("metric-actual-sales");
      expect(within(actualCard).getByText("Actual Sales Achieved")).toBeInTheDocument();
      expect(within(actualCard).getByText("₹4,50,000")).toBeInTheDocument();

      // Overall achievement: 450,000 / 7,500,000 * 100 = 6.0%
      const achCard = screen.getByTestId("metric-achievement-rate");
      expect(within(achCard).getByText("6.0%")).toBeInTheDocument();

      // Remaining target: 7,500,000 - 450,000 = 7,050,000 (₹70,50,000)
      const remCard = screen.getByTestId("metric-remaining-target");
      expect(within(remCard).getByText("₹70,50,000")).toBeInTheDocument();
    });

    it("excludes cancelled invoices and unbilled purchase orders from actual sales calculation strictly", () => {
      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      // Verify that actual sales is ₹4,50,000 (unbilled PO-NEXUS-881 250k and cancelled 100k excluded)
      const actualCard = screen.getByTestId("metric-actual-sales");
      expect(within(actualCard).getByText("₹4,50,000")).toBeInTheDocument();
      expect(within(actualCard).queryByText("₹7,00,000")).not.toBeInTheDocument();
      expect(within(actualCard).queryByText("₹8,00,000")).not.toBeInTheDocument();
    });

    it("handles zero total target safely without division by zero errors", () => {
      const zeroTargets: SalesTarget[] = [
        {
          id: 1,
          user_id: 3,
          user_name: "Neha Rao",
          fy_code: "FY 2026-27",
          yearly_target: 0,
          half_yearly_target: 0,
          quarterly_target: 0,
          monthly_target: 0,
          monthly_bottom_line: 0,
          yearly_bottom_line: 0,
        },
      ];

      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={zeroTargets}
        />,
      );

      const achCard = screen.getByTestId("metric-achievement-rate");
      expect(within(achCard).getByText("0.0%")).toBeInTheDocument();
    });
  });

  describe("Target vs Actual Visual Progress Breakdown", () => {
    it("renders all 4 period cards (Annual, Half-Yearly, Quarterly, Monthly)", () => {
      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      expect(screen.getByTestId("period-card-annual")).toBeInTheDocument();
      expect(screen.getByTestId("period-card-half-yearly")).toBeInTheDocument();
      expect(screen.getByTestId("period-card-quarterly")).toBeInTheDocument();
      expect(screen.getByTestId("period-card-monthly")).toBeInTheDocument();

      // Check Annual card: Target 75L, Actual 4.5L (6.0%)
      const annualCard = screen.getByTestId("period-card-annual");
      expect(within(annualCard).getByText("6.0%")).toBeInTheDocument();

      // Check Half-Yearly card: Target 37.5L, Actual 4.5L (12.0%)
      const hCard = screen.getByTestId("period-card-half-yearly");
      expect(within(hCard).getByText("12.0%")).toBeInTheDocument();

      // Check Quarterly card: Target 18.75L, Actual 4.5L (24.0%)
      const qCard = screen.getByTestId("period-card-quarterly");
      expect(within(qCard).getByText("24.0%")).toBeInTheDocument();

      // Check Monthly card: Target 6.25L, Actual 4.5L (72.0%)
      const mCard = screen.getByTestId("period-card-monthly");
      expect(within(mCard).getByText("72.0%")).toBeInTheDocument();
    });
  });

  describe("Executive Comparison Leaderboard", () => {
    it("ranks sales representatives by achievement % descending and excludes unbilled orders from reps", () => {
      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      // Neha Rao: 450,000 / 4,000,000 = 11.3% -> Rank 1
      // Kavya Nair: Unbilled PO excluded -> 0 / 3,500,000 = 0.0% -> Rank 2
      // Arjun Mehta: 0 / 0 = 0.0% -> Rank 3
      const table = screen.getByTestId("executive-leaderboard-table");
      const rows = within(table).getAllByRole("row");
      // Row 0 is thead, Row 1 is Rank 1 (Neha Rao), Row 2 is Rank 2 (Kavya Nair)
      expect(within(rows[1]!).getByText("Neha Rao")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("#1")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("11.3%")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("₹4,50,000")).toBeInTheDocument();

      expect(within(rows[2]!).getByText("Kavya Nair")).toBeInTheDocument();
      expect(within(rows[2]!).getByText("#2")).toBeInTheDocument();
      expect(within(rows[2]!).getByText("0.0%")).toBeInTheDocument();
      expect(within(rows[2]!).getAllByText("₹0").length).toBeGreaterThan(0);
    });

    it("filters executive leaderboard via search input", () => {
      render(
        <PerformanceAnalytics
          fy="FY 2026-27"
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      const searchInput = screen.getByLabelText("Filter executive leaderboard");
      fireEvent.change(searchInput, { target: { value: "Neha" } });

      const table = screen.getByTestId("executive-leaderboard-table");
      expect(within(table).getByText("Neha Rao")).toBeInTheDocument();
      expect(within(table).queryByText("Kavya Nair")).not.toBeInTheDocument();
    });

    it("displays sanitized rehearsal demo notice", () => {
      render(<PerformanceAnalytics fy="FY 2026-27" />);
      expect(screen.getByTestId("performance-demo-notice")).toBeInTheDocument();
      expect(screen.getByText(/Sanitized Rehearsal Demo:/)).toBeInTheDocument();
    });
  });

  describe("FinancialDashboard Integration", () => {
    it("renders Executive Sales Performance section with targets and link", () => {
      render(
        <FinancialDashboard
          fy="FY 2026-27"
          role="finance"
          empty={false}
          selectAging={vi.fn()}
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
        />,
      );

      expect(screen.getByTestId("dashboard-executives")).toBeInTheDocument();
      expect(screen.getByText("Executive Performance & Quotas")).toBeInTheDocument();
      expect(screen.getByTestId("link-to-sales-targets")).toBeInTheDocument();

      // Check executive cards: Neha Rao has 11.3%, Kavya Nair has 7.1%
      const nehaCard = screen.getByTestId("exec-card-3");
      expect(within(nehaCard).getByText("Neha Rao")).toBeInTheDocument();
      expect(within(nehaCard).getByText("11.3%")).toBeInTheDocument();
      expect(within(nehaCard).getByText("₹4,50,000")).toBeInTheDocument();

      const kavyaCard = screen.getByTestId("exec-card-4");
      expect(within(kavyaCard).getByText("Kavya Nair")).toBeInTheDocument();
      expect(within(kavyaCard).getByText("0.0%")).toBeInTheDocument();
      expect(within(kavyaCard).getAllByText("₹0").length).toBeGreaterThan(0);
    });

    it("handles onNavigateTargets callback when clicked", () => {
      const handleNavigate = vi.fn();
      render(
        <FinancialDashboard
          fy="FY 2026-27"
          role="finance"
          empty={false}
          selectAging={vi.fn()}
          records={sampleInvoices}
          targets={INITIAL_TARGETS}
          onNavigateTargets={handleNavigate}
        />,
      );

      const navBtn = screen.getByTestId("link-to-sales-targets");
      fireEvent.click(navBtn);
      expect(handleNavigate).toHaveBeenCalledTimes(1);
    });

    it("renders smoothly within MockSessionProvider", () => {
      render(
        <MockSessionProvider>
          <FinancialDashboard
            fy="FY 2026-27"
            role="finance"
            empty={false}
            selectAging={vi.fn()}
          />
        </MockSessionProvider>,
      );

      expect(screen.getByTestId("dashboard-executives")).toBeInTheDocument();
      expect(screen.getByText("Executive Performance & Quotas")).toBeInTheDocument();
    });
  });
});
