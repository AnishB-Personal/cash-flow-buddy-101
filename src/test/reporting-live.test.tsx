import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

      // Overall Achievement: 18.6%
      expect(screen.getAllByText('18.6%').length).toBeGreaterThanOrEqual(1);
      // Quota: ₹70,00,000
      expect(screen.getAllByText('₹70,00,000').length).toBeGreaterThanOrEqual(1);
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
  });
});
