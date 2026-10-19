import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { FinancialDashboard } from '@/components/collectflow/dashboard';
import { TargetsScreen } from '@/components/collectflow/targets-screen';
import { TargetDrawer } from '@/components/collectflow/target-drawer';
import { PerformanceAnalytics } from '@/components/collectflow/performance-analytics';
import { ReportsHub } from '@/components/collectflow/reports-hub';
import { ExportDrawer } from '@/components/collectflow/export-drawer';
import { MockSessionProvider } from '@/components/collectflow/session';

const mockReportingSummary = {
  fy_code: "FY 2026-27",
  as_of_date: "2026-04-30",
  total_invoiced: "1534000.00",
  total_exclusive: "1300000.00",
  total_tax: "234000.00",
  total_settled: "472000.00",
  total_cash: "432000.00",
  total_tds: "40000.00",
  total_outstanding: "1062000.00",
  total_overdue: "826000.00",
  unbilled_orders_value: "295000.00",
  active_orders_count: 8,
  active_invoices_count: 7,
  settlement_ratio_pct: 30.77,
  collection_efficiency_pct: 30.77,
};

const mockArAging = {
  as_of_date: "2026-04-30",
  total_outstanding: "1062000.00",
  buckets: [
    { bucket_id: "current", label: "Current / Not Due", min_days: null, max_days: 0, amount: "236000.00", invoice_count: 1, percentage: 22.22 },
    { bucket_id: "1_30", label: "1 - 30 Days", min_days: 1, max_days: 30, amount: "472000.00", invoice_count: 2, percentage: 44.44 },
    { bucket_id: "31_60", label: "31 - 60 Days", min_days: 31, max_days: 60, amount: "354000.00", invoice_count: 1, percentage: 33.33 },
    { bucket_id: "61_90", label: "61 - 90 Days", min_days: 61, max_days: 90, amount: "0.00", invoice_count: 0, percentage: 0.0 },
    { bucket_id: "91_180", label: "91 - 180 Days", min_days: 91, max_days: 180, amount: "0.00", invoice_count: 0, percentage: 0.0 },
    { bucket_id: "180_plus", label: "180+ Days", min_days: 181, max_days: null, amount: "0.00", invoice_count: 0, percentage: 0.0 },
  ],
  invoices: [
    {
      invoice_id: 1,
      invoice_number: "INV-2026-001",
      customer_id: 1,
      customer_name: "Nexus Enterprises",
      executive_name: "Arjun Mehta",
      invoice_date: "2026-04-05",
      due_date: "2026-04-20",
      total_amount: "236000.00",
      outstanding_balance: "236000.00",
      days_overdue: 10,
      bucket_id: "1_30",
    },
  ],
};

const mockExecutiveAttainment = {
  fy_code: "FY 2026-27",
  overall: {
    total_target: "7000000.00",
    total_achieved: "1300000.00",
    attainment_pct: 18.57,
  },
  executives: [
    {
      user_id: 3,
      username: "neha",
      full_name: "Neha Rao",
      role: "sales",
      is_active: true,
      fy_code: "FY 2026-27",
      target_amount: "4000000.00",
      achieved_amount: "800000.00",
      attainment_pct: 20.0,
      active_invoices_count: 4,
    },
    {
      user_id: 5,
      username: "arjun",
      full_name: "Arjun Mehta",
      role: "sales",
      is_active: true,
      fy_code: "FY 2026-27",
      target_amount: "3000000.00",
      achieved_amount: "500000.00",
      attainment_pct: 16.67,
      active_invoices_count: 3,
    },
  ],
};

const mockTargetsResponse = {
  fy_code: "FY 2026-27",
  targets: [
    {
      id: 1,
      user_id: 3,
      username: "neha",
      full_name: "Neha Rao",
      role: "sales",
      is_active: true,
      fy_code: "FY 2026-27",
      target_amount: "4000000.00",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
    {
      id: 2,
      user_id: 5,
      username: "arjun",
      full_name: "Arjun Mehta",
      role: "sales",
      is_active: true,
      fy_code: "FY 2026-27",
      target_amount: "3000000.00",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ],
};

const mockCustomerExposure = {
  as_of_date: "2026-04-30",
  fy_code: "FY 2026-27",
  total_outstanding: "1062000.00",
  rows: [
    {
      customer_id: 1,
      customer_name: "Nexus Enterprises",
      billing_name: "Nexus Enterprises",
      gstin: "29AAAAA0000A1Z5",
      state: "Karnataka",
      total_orders: 5,
      total_billed: "1534000.00",
      total_cash: "432000.00",
      total_tds: "40000.00",
      total_settled: "472000.00",
      outstanding_balance: "1062000.00",
      unbilled_value: "295000.00",
      overdue_exposure: "826000.00",
    },
  ],
  summary: {
    total_billed: "1534000.00",
    total_cash: "432000.00",
    total_tds: "40000.00",
    total_settled: "472000.00",
    total_outstanding: "1062000.00",
    total_overdue: "826000.00",
    customer_count: 1,
  },
};

describe('Stage 4C.5: LIVE Reporting, Targets & Exports Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    apiClient.configure({ mode: 'live', baseUrl: 'http://127.0.0.1:8000' });
    apiClient.setToken('mock-admin-token', {
      id: 1,
      username: 'admin_user',
      role: 'admin',
      full_name: 'Admin User',
    });

    vi.spyOn(apiClient, 'getReportingSummary').mockResolvedValue(mockReportingSummary);
    vi.spyOn(apiClient, 'getArAging').mockResolvedValue(mockArAging);
    vi.spyOn(apiClient, 'getExecutiveAttainment').mockResolvedValue(mockExecutiveAttainment);
    vi.spyOn(apiClient, 'getCustomerExposure').mockResolvedValue(mockCustomerExposure);
    vi.spyOn(apiClient, 'getTargets').mockResolvedValue(mockTargetsResponse);
    vi.spyOn(apiClient, 'getInvoices').mockResolvedValue({
      page: 1,
      limit: 100,
      total: 1,
      total_pages: 1,
      data: [
        {
          id: 1,
          fy_code: "FY 2026-27",
          order_type: "PO",
          po_number: "PO-2026-001",
          po_date: "2026-04-01",
          invoice_number: "INV-2026-001",
          invoice_date: "2026-04-05",
          due_date: "2026-04-20",
          customer_id: 1,
          customer_name: "Nexus Enterprises",
          executive_id: 5,
          executive_name: "Arjun Mehta",
          exclusive_amount: 200000.0,
          tax_amount: 36000.0,
          total_amount: 236000.0,
          total_cash_paid: 0.0,
          total_tds_deducted: 0.0,
          total_paid: 0.0,
          outstanding_balance: 236000.0,
          computed_status: "OVERDUE",
          payments: [],
        } as any,
      ],
    });
    vi.spyOn(apiClient, 'getAllInvoices').mockResolvedValue({
      page: 1,
      limit: 1,
      total: 1,
      total_pages: 1,
      data: [
        {
          id: 1,
          fy_code: "FY 2026-27",
          order_type: "PO",
          po_number: "PO-2026-001",
          po_date: "2026-04-01",
          invoice_number: "INV-2026-001",
          invoice_date: "2026-04-05",
          due_date: "2026-04-20",
          customer_id: 1,
          customer_name: "Nexus Enterprises",
          executive_id: 5,
          executive_name: "Arjun Mehta",
          exclusive_amount: 200000.0,
          tax_amount: 36000.0,
          total_amount: 236000.0,
          total_cash_paid: 0.0,
          total_tds_deducted: 0.0,
          total_paid: 0.0,
          outstanding_balance: 236000.0,
          computed_status: "OVERDUE",
          payments: [],
        } as any,
      ],
    });
    vi.spyOn(apiClient, 'getAllPayments').mockResolvedValue({
      page: 1,
      limit: 1,
      total: 1,
      total_pages: 1,
      summary: {
        total_cash: "432000.00",
        total_tds: "40000.00",
        total_settled: "472000.00",
        transaction_count: 1,
      },
      data: [
        {
          id: 1,
          invoice_id: 1,
          transaction_type: "PAYMENT",
          cash_amount: "432000.00",
          payment_amount: "432000.00",
          tds_amount: "40000.00",
          total_settled: "472000.00",
          net_settled: "472000.00",
          tds_section: "194C",
          payment_date: "2026-04-15",
          payment_mode: "NEFT",
          remittance_number: "UTR-2026-001",
          invoice_number: "INV-2026-001",
          customer_id: 1,
          customer_name: "Nexus Enterprises",
          fy_code: "FY 2026-27",
          recorded_by: 1,
        },
      ],
    });
    vi.spyOn(apiClient, 'getCustomers').mockResolvedValue([
      {
        id: 1,
        billing_name: "Nexus Enterprises",
        gst_number: "29AAAAA0000A1Z5",
        is_active: true,
      } as any,
    ]);
    vi.spyOn(apiClient, 'getUsers').mockResolvedValue([
      {
        id: 3,
        username: "neha",
        full_name: "Neha Rao",
        role: "sales",
        is_active: true,
      },
      {
        id: 5,
        username: "arjun",
        full_name: "Arjun Mehta",
        role: "sales",
        is_active: true,
      },
    ]);
  });

  describe('FinancialDashboard LIVE Integration', () => {
    it('loads and renders authoritative PostgreSQL metrics', async () => {
      render(
        <MockSessionProvider>
          <FinancialDashboard fy="FY 2026-27" role="admin" empty={false} selectAging={vi.fn()} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(apiClient.getReportingSummary).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
        expect(apiClient.getArAging).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
        expect(apiClient.getExecutiveAttainment).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
      });

      // Total Invoiced: ₹15,34,000
      expect(screen.getByText('₹15,34,000')).toBeInTheDocument();
      // Total Outstanding: ₹10,62,000
      expect(screen.getAllByText('₹10,62,000').length).toBeGreaterThanOrEqual(1);
      // Cash collected: ₹4,32,000
      expect(screen.getAllByText('₹4,32,000').length).toBeGreaterThanOrEqual(1);
      // TDS recognized: ₹40,000
      expect(screen.getAllByText('₹40,000').length).toBeGreaterThanOrEqual(1);
      // Settlement rate: 30.77%
      expect(screen.getByText('30.77%')).toBeInTheDocument();
      // Unbilled orders: ₹2,95,000
      expect(screen.getByText('₹2,95,000')).toBeInTheDocument();

      // Check executive cards rendered from live attainment
      expect(screen.getByText('Neha Rao')).toBeInTheDocument();
      expect(screen.getByText('Arjun Mehta')).toBeInTheDocument();
    });
  });

  describe('TargetsScreen & TargetDrawer LIVE Integration', () => {
    it('loads targets from PostgreSQL and calculates attainment', async () => {
      render(
        <MockSessionProvider>
          <TargetsScreen empty={false} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(apiClient.getTargets).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
        expect(apiClient.getExecutiveAttainment).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
        expect(screen.getByText('₹70,00,000')).toBeInTheDocument();
      });

      // Attainment: 18.57%
      expect(screen.getByText('18.57%')).toBeInTheDocument();
      // Sales Achieved: ₹13,00,000
      expect(screen.getByText('₹13,00,000')).toBeInTheDocument();
    });

    it('submits upsertTarget when Admin configures a target', async () => {
      const upsertSpy = vi.spyOn(apiClient, 'upsertTarget').mockResolvedValueOnce({
        success: true,
        message: 'Target saved',
        target: {
          id: 1,
          user_id: 3,
          username: 'neha',
          full_name: 'Neha Rao',
          role: 'sales',
          is_active: true,
          fy_code: 'FY 2026-27',
          target_amount: '4500000.00',
        },
      });

      const closeSpy = vi.fn();
      const successSpy = vi.fn();

      render(
        <MockSessionProvider>
          <TargetDrawer
            close={closeSpy}
            onSuccess={successSpy}
            target={{
              id: 1,
              user_id: 3,
              user_name: 'Neha Rao',
              fy_code: 'FY 2026-27',
              yearly_target: 4000000,
              half_yearly_target: 2000000,
              quarterly_target: 1000000,
              monthly_target: 333333.33,
              monthly_bottom_line: 0,
              yearly_bottom_line: 0,
            }}
          />
        </MockSessionProvider>
      );

      // Advance to review
      const reviewBtn = screen.getByRole('button', { name: /review target changes/i });
      fireEvent.click(reviewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue to confirmation/i })).toBeInTheDocument();
      });

      // Advance to confirm
      fireEvent.click(screen.getByRole('button', { name: /continue to confirmation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm target changes/i })).toBeInTheDocument();
      });

      // Confirm
      fireEvent.click(screen.getByRole('button', { name: /confirm target changes/i }));

      await waitFor(() => {
        expect(upsertSpy).toHaveBeenCalledWith(3, expect.objectContaining({
          fy_code: 'FY 2026-27',
          yearly_target: 4000000,
        }));
        expect(successSpy).toHaveBeenCalled();
      });
    });

    it('disables target configuration when viewing as Sales role', async () => {
      apiClient.setToken('mock-sales-token', {
        id: 3,
        username: 'neha',
        role: 'sales',
        full_name: 'Neha Rao',
      });

      render(
        <MockSessionProvider>
          <TargetsScreen empty={false} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/configure target \(disabled in viewing mode\)/i)).toBeDisabled();
      });
    });
  });

  describe('PerformanceAnalytics LIVE Integration', () => {
    it('renders overall achievement and executive ranking from PostgreSQL', async () => {
      render(
        <MockSessionProvider>
          <PerformanceAnalytics fy="FY 2026-27" role="admin" empty={false} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(apiClient.getExecutiveAttainment).toHaveBeenCalledWith({ fy: 'FY 2026-27' });
      });

      await waitFor(() => {
        // Overall Achievement: 18.6%
        expect(screen.getAllByText('18.6%').length).toBeGreaterThanOrEqual(1);
        // Quota: ₹70,00,000
        expect(screen.getAllByText('₹70,00,000').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('ExportDrawer LIVE Integration', () => {
    it('creates single-use export token and triggers download via backend API', async () => {
      const createTokenSpy = vi.spyOn(apiClient, 'createExportToken').mockResolvedValueOnce({
        token: 'exp_live_ticket_abc123',
        expires_in: 300,
        expires_at: '2026-04-30T12:05:00Z',
      });

      const fakeBlob = new Blob(['mock excel content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadSpy = vi.spyOn(apiClient, 'downloadExport').mockResolvedValueOnce({
        blob: fakeBlob,
        filename: 'collectflow_export_FY_2026_27.xlsx',
      });

      const closeSpy = vi.fn();

      render(
        <MockSessionProvider>
          <ExportDrawer initialFy="FY 2026-27" close={closeSpy} />
        </MockSessionProvider>
      );

      // Step 1: Scope -> Preview
      const previewBtn = screen.getByRole('button', { name: /continue to preview/i });
      fireEvent.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /review columns & totals/i })).toBeInTheDocument();
      });

      // Step 2: Preview -> Review
      fireEvent.click(screen.getByRole('button', { name: /review columns & totals/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /proceed to confirmation/i })).toBeInTheDocument();
      });

      // Step 3: Review -> Confirm
      fireEvent.click(screen.getByRole('button', { name: /proceed to confirmation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm & generate excel export/i })).toBeInTheDocument();
      });

      // Step 4: Confirm -> Generate Token
      fireEvent.click(screen.getByRole('button', { name: /confirm & generate excel export/i }));

      await waitFor(() => {
        expect(createTokenSpy).toHaveBeenCalled();
        expect(screen.getByText(/export generated successfully/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download export file/i })).toBeInTheDocument();
      });

      // Step 5: Download
      fireEvent.click(screen.getByRole('button', { name: /download export file/i }));

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalledWith('excel', {
          ticket: 'exp_live_ticket_abc123',
          fy: 'FY 2026-27',
          scope: 'all',
        });
      });
    });

    it('unambiguously labels preview counts and totals as sample-only in Steps 2, 3, and 4', async () => {
      render(
        <MockSessionProvider>
          <ExportDrawer initialFy="FY 2026-27" close={vi.fn()} />
        </MockSessionProvider>
      );

      // Step 1 -> Step 2
      fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/sample-only preview/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/sample-only preview notice/i)).toBeInTheDocument();
      });

      // Step 2 -> Step 3
      fireEvent.click(screen.getByRole('button', { name: /review columns & totals/i }));

      await waitFor(() => {
        expect(screen.getByText(/sample preview totals \(sample-only preview/i)).toBeInTheDocument();
      });

      // Step 3 -> Step 4
      fireEvent.click(screen.getByRole('button', { name: /proceed to confirmation/i }));

      await waitFor(() => {
        expect(screen.getByText(/sample vs authoritative:/i)).toBeInTheDocument();
      });
    });
  });

  describe('ReportsHub LIVE Integration', () => {
    it('loads and renders complete authoritative dataset with >100 invoices and server-driven pagination', async () => {
      // Generate 105 mock invoices
      const bulkInvoices = Array.from({ length: 105 }, (_, i) => ({
        id: i + 1,
        fy_code: "FY 2026-27",
        order_type: "PO",
        po_number: `PO-2026-${String(i + 1).padStart(3, '0')}`,
        po_date: "2026-04-01",
        invoice_number: `INV-2026-${String(i + 1).padStart(3, '0')}`,
        invoice_date: "2026-04-10",
        due_date: "2026-04-25",
        customer_id: (i % 3) + 1,
        customer_name: i % 3 === 0 ? "Nexus Enterprises" : i % 3 === 1 ? "Acme Cloud Solutions Pvt Ltd" : "Apex Global",
        executive_id: 5,
        executive_name: "Arjun Mehta",
        exclusive_amount: 1000.0,
        tax_amount: 180.0,
        total_amount: 1180.0,
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 1180.0,
        computed_status: "OVERDUE",
        payments: [],
      }));

      const getAllInvoicesSpy = vi.spyOn(apiClient, 'getAllInvoices').mockResolvedValue({
        page: 1,
        limit: 105,
        total: 105,
        total_pages: 1,
        data: bulkInvoices as any,
      });

      render(
        <MockSessionProvider>
          <ReportsHub />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(getAllInvoicesSpy).toHaveBeenCalled();
        // Record count indicator for page 1: "1–10 of 105 records"
        expect(screen.getByText(/1[–\-]10 of 105 records/i)).toBeInTheDocument();
      });

      // Navigate to page 2
      const nextBtn = screen.getByRole('button', { name: /next page/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText(/11[–\-]20 of 105 records/i)).toBeInTheDocument();
      });

      // Verify authoritative summary cards are rendered
      expect(screen.getByText('₹15,34,000')).toBeInTheDocument();
      expect(screen.getAllByText('₹10,62,000').length).toBeGreaterThanOrEqual(1);
    });

    it('renders customer exposure view aligned with backend {rows, summary} contract', async () => {
      vi.spyOn(apiClient, 'getCustomerExposure').mockResolvedValue({
        as_of_date: "2026-04-30",
        fy_code: "FY 2026-27",
        total_outstanding: "1062000.00",
        rows: [
          {
            customer_id: 1,
            customer_name: "Nexus Enterprises",
            billing_name: "Nexus Enterprises",
            gstin: "29AAAAA0000A1Z5",
            state: "Karnataka",
            total_orders: 5,
            total_billed: "1534000.00",
            total_cash: "432000.00",
            total_tds: "40000.00",
            total_settled: "472000.00",
            outstanding_balance: "1062000.00",
            unbilled_value: "295000.00",
            overdue_exposure: "826000.00",
          },
        ],
        summary: {
          total_billed: "1534000.00",
          total_cash: "432000.00",
          total_tds: "40000.00",
          total_settled: "472000.00",
          total_outstanding: "1062000.00",
          total_overdue: "826000.00",
          customer_count: 1,
        },
      });

      render(
        <MockSessionProvider>
          <ReportsHub />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('tab-customers')).toBeInTheDocument();
      });

      // Switch to Customer Exposure tab
      fireEvent.click(screen.getByTestId('tab-customers'));

      await waitFor(() => {
        // Customer name rendered in table row
        expect(screen.getByTestId('customer-row-1')).toHaveTextContent('Nexus Enterprises');
        // Outstanding balance rendered: ₹10,62,000
        expect(screen.getAllByText('₹10,62,000').length).toBeGreaterThanOrEqual(1);
        // Gross billed rendered: ₹15,34,000
        expect(screen.getAllByText('₹15,34,000').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('retains PAYMENT and REVERSAL events for CANCELLED invoice in LIVE Collections Ledger with zero net settlement', async () => {
      // Seed payment ledger with:
      // 1. Original PAYMENT of ₹1,00,000 cash + ₹18,000 TDS = ₹1,18,000
      // 2. Compensating REVERSAL of -₹1,00,000 cash + -₹18,000 TDS = -₹1,18,000
      // 3. Invoice is CANCELLED
      const cancelledInvoicePayments: any[] = [
        {
          id: 101,
          invoice_id: 99,
          transaction_type: "PAYMENT",
          is_superseded: true,
          cash_amount: "100000.00",
          payment_amount: "100000.00",
          tds_amount: "18000.00",
          total_settled: "118000.00",
          net_settled: "118000.00",
          tds_section: "194C",
          payment_date: "2026-04-10",
          payment_mode: "NEFT",
          remittance_number: "UTR-ORIG-101",
          notes: "Initial customer advance",
          recorded_by: 1,
          invoice_number: "INV-2026-CANCELLED-99",
          invoice_lifecycle_status: "CANCELLED",
          customer_id: 1,
          customer_name: "Nexus Enterprises",
          fy_code: "FY 2026-27",
        },
        {
          id: 102,
          invoice_id: 99,
          parent_transaction_id: 101,
          transaction_type: "REVERSAL",
          is_superseded: false,
          cash_amount: "-100000.00",
          payment_amount: "-100000.00",
          tds_amount: "-18000.00",
          total_settled: "-118000.00",
          net_settled: "-118000.00",
          tds_section: "194C",
          payment_date: "2026-04-12",
          payment_mode: "NEFT",
          remittance_number: "UTR-ORIG-101",
          notes: "Reversal of Payment #101: Order cancelled by client",
          recorded_by: 1,
          invoice_number: "INV-2026-CANCELLED-99",
          invoice_lifecycle_status: "CANCELLED",
          customer_id: 1,
          customer_name: "Nexus Enterprises",
          fy_code: "FY 2026-27",
        },
      ];

      vi.spyOn(apiClient, 'getAllPayments').mockResolvedValue({
        page: 1,
        limit: 2,
        total: 2,
        total_pages: 1,
        summary: {
          total_cash: "0.00",
          total_tds: "0.00",
          total_settled: "0.00",
          transaction_count: 2,
        },
        data: cancelledInvoicePayments,
      });

      render(
        <MockSessionProvider>
          <ReportsHub />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('tab-payments')).toBeInTheDocument();
      });

      // Switch to Collections & Payments Ledger tab
      fireEvent.click(screen.getByTestId('tab-payments'));

      await waitFor(() => {
        expect(screen.getByTestId('payments-report-table')).toBeInTheDocument();
      });

      // 1. Both historical events are present in the table
      const paymentRow = screen.getByTestId('payment-row-101');
      const reversalRow = screen.getByTestId('payment-row-102');
      expect(paymentRow).toBeInTheDocument();
      expect(reversalRow).toBeInTheDocument();

      // 2. Both rows show the cancelled invoice number and CANCELLED badge
      expect(within(paymentRow).getByText('INV-2026-CANCELLED-99')).toBeInTheDocument();
      expect(within(reversalRow).getByText('INV-2026-CANCELLED-99')).toBeInTheDocument();
      expect(within(paymentRow).getByText('CANCELLED')).toBeInTheDocument();
      expect(within(reversalRow).getByText('CANCELLED')).toBeInTheDocument();

      // 3. Reversal badge is shown on reversal transaction
      expect(within(reversalRow).getByText('REVERSAL')).toBeInTheDocument();

      // 4. Signed monetary amounts:
      // Original PAYMENT: Cash ₹1,00,000, TDS ₹18,000, Total Settled ₹1,18,000
      expect(within(paymentRow).getByText('₹1,00,000')).toBeInTheDocument();
      expect(within(paymentRow).getByText('₹18,000')).toBeInTheDocument();
      expect(within(paymentRow).getByText('₹1,18,000')).toBeInTheDocument();

      // REVERSAL: Signed negative amounts -₹1,00,000, -₹18,000, -₹1,18,000
      expect(within(reversalRow).getByText('-₹1,00,000')).toBeInTheDocument();
      expect(within(reversalRow).getByText('-₹18,000')).toBeInTheDocument();
      expect(within(reversalRow).getByText('-₹1,18,000')).toBeInTheDocument();

      // 5. Accurate Net Settlements: Summary KPI reflects exact ₹0 net settlement
      const settledKpi = screen.getByTestId('kpi-payments-settled');
      expect(within(settledKpi).getByText('₹0')).toBeInTheDocument();

      const cashKpi = screen.getByTestId('kpi-cash-collected');
      expect(within(cashKpi).getByText('₹0')).toBeInTheDocument();

      const tdsKpi = screen.getByTestId('kpi-tds-deducted');
      expect(within(tdsKpi).getByText('₹0')).toBeInTheDocument();

      const countKpi = screen.getByTestId('kpi-transaction-count');
      expect(within(countKpi).getByText('2')).toBeInTheDocument();
    });
  });
});
