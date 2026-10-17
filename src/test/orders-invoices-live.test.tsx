import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { OrderWorkflowModal, type OrderOperation } from '@/components/collectflow/order-workflows';
import { CancelInvoiceDrawer } from '@/components/collectflow/cancel-workflow';
import { MockSessionProvider } from '@/components/collectflow/session';
import { orderCreateExample, orderConvertExample } from '@/data/orders';
import type { Invoice } from '@/data/collectflow';

const syntheticInvoice: Invoice = {
  id: 101,
  fy_code: "FY 2026-27",
  order_type: "PO",
  po_number: "PO-2026-001",
  po_date: "2026-04-10",
  customer_id: 1,
  executive_id: 2,
  customer_name: "Acme Innovations Pvt Ltd",
  customer_gstin: "29AAAAA0000A1Z5",
  customer_address: "Tech Park, Bangalore",
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
  remarks: "Cloud migration",
  payment_status: "PENDING",
  total_cash_paid: 0.0,
  total_tds_deducted: 0.0,
  total_paid: 0.0,
  outstanding_balance: 531000.0,
  computed_status: "PENDING",
  executive_name: "Neha Rao",
  line_items: [],
  payments: [],
};

describe('Stage 4C.3: LIVE Orders & Invoices Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiClient.configure({ mode: 'live', baseUrl: 'http://127.0.0.1:8000' });
    apiClient.clearSession();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    apiClient.configure({ mode: 'mock', baseUrl: '' });
    apiClient.clearSession();
  });

  describe('ApiClient Orders & Invoices HTTP Methods', () => {
    it('getOrders sends GET /api/orders with serialized query parameters', async () => {
      const mockResponse = { page: 1, limit: 50, total: 1, total_pages: 1, data: [syntheticInvoice] };
      const reqSpy = vi.spyOn(apiClient as any, 'request').mockResolvedValue(mockResponse);

      const res = await apiClient.getOrders({ fy: 'FY 2026-27', status: 'UNBILLED' });
      expect(reqSpy).toHaveBeenCalledWith('/api/orders?fy=FY+2026-27&status=UNBILLED');
      expect(res.data.length).toBe(1);
    });

    it('createOrder sends POST /api/orders with payload', async () => {
      const reqSpy = vi.spyOn(apiClient as any, 'request').mockResolvedValue(syntheticInvoice);

      const orderData = {
        fy_code: 'FY 2026-27',
        po_number: 'PO-NEW-001',
        po_date: '2026-06-01',
        customer_id: 1,
        exclusive_amount: 100000,
      };

      const res = await apiClient.createOrder(orderData);
      expect(reqSpy).toHaveBeenCalledWith('/api/orders', {
        method: 'POST',
        body: orderData,
      });
      expect(res.id).toBe(101);
    });

    it('convertOrder sends POST /api/orders/:id/convert with invoice payload', async () => {
      const convResponse = { ...syntheticInvoice, success: true, invoice_id: 201 };
      const reqSpy = vi.spyOn(apiClient as any, 'request').mockResolvedValue(convResponse);

      const res = await apiClient.convertOrder(101, {
        invoice_number: 'INV-2026-099',
        invoice_date: '2026-06-05',
        due_date: '2026-07-05',
      });

      expect(reqSpy).toHaveBeenCalledWith('/api/orders/101/convert', {
        method: 'POST',
        body: {
          invoice_number: 'INV-2026-099',
          invoice_date: '2026-06-05',
          due_date: '2026-07-05',
        },
      });
      expect(res.success).toBe(true);
      expect(res.invoice_id).toBe(201);
    });

    it('cancelInvoice sends POST /api/invoices/:id/cancel with mandatory reason', async () => {
      const cancelResponse = { success: true, message: 'Cancelled', lifecycle_status: 'CANCELLED' };
      const reqSpy = vi.spyOn(apiClient as any, 'request').mockResolvedValue(cancelResponse);

      const res = await apiClient.cancelInvoice(101, { reason: 'Customer requested cancellation' });
      expect(reqSpy).toHaveBeenCalledWith('/api/invoices/101/cancel', {
        method: 'POST',
        body: { reason: 'Customer requested cancellation' },
      });
      expect(res.lifecycle_status).toBe('CANCELLED');
    });
  });

  describe('OrderWorkflowModal LIVE Execution', () => {
    it('dispatches apiClient.createOrder in LIVE mode when confirmed', async () => {
      apiClient.setToken('sales-token', {
        id: 3,
        username: 'sandbox_sales',
        role: 'sales',
        full_name: 'Sales Rep',
      });

      const createOrderSpy = vi.spyOn(apiClient, 'createOrder').mockResolvedValue(syntheticInvoice);
      const closeSpy = vi.fn();

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '1',
          order_type: 'PO',
          po_number: 'PO-LIVE-001',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '3',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Software Architecture Consulting',
          quantity: '10',
          unit_price: '5000',
          tax_rate: '0.18',
          remarks: 'Test Live Remarks',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={closeSpy} />
        </MockSessionProvider>
      );

      // 1. Submit form to review
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      fireEvent.click(reviewBtn);

      // 2. Continue to confirmation
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

      // 3. Confirm
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm create purchase order/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm create purchase order/i }));

      await waitFor(() => {
        expect(createOrderSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            customer_id: 1,
            po_number: 'PO-LIVE-001',
            po_date: '2026-06-15',
            fy_code: 'FY 2026-27',
          })
        );
      });
    });

    it('dispatches apiClient.convertOrder in LIVE mode for Admin role', async () => {
      apiClient.setToken('admin-token', {
        id: 1,
        username: 'sandbox_admin',
        role: 'admin',
        full_name: 'Admin User',
      });

      const convertOrderSpy = vi.spyOn(apiClient, 'convertOrder').mockResolvedValue({
        ...syntheticInvoice,
        success: true,
        invoice_id: 102,
      });
      const closeSpy = vi.fn();

      const op: OrderOperation = {
        action: 'order-convert',
        target: '102',
        label: 'Convert to Invoice',
        values: {
          invoice_number: 'INV-LIVE-888',
          invoice_date: '2026-06-20',
          due_date: '2026-07-20',
        },
        example: orderConvertExample,
        record: {
          ...syntheticInvoice,
          id: 102,
          invoice_number: null,
          computed_status: 'unbilled',
        } as any,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={closeSpy} />
        </MockSessionProvider>
      );

      // 1. Submit form to review
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      fireEvent.click(reviewBtn);

      // 2. Continue to confirmation
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

      // 3. Confirm
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm convert to invoice/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm convert to invoice/i }));

      await waitFor(() => {
        expect(convertOrderSpy).toHaveBeenCalledWith(102, {
          invoice_number: 'INV-LIVE-888',
          invoice_date: '2026-06-20',
          due_date: '2026-07-20',
        });
      });
    });
  });

  describe('CancelInvoiceDrawer LIVE Execution', () => {
    it('dispatches apiClient.cancelInvoice in LIVE mode with mandatory reason', async () => {
      apiClient.setToken('finance-token', {
        id: 2,
        username: 'sandbox_finance',
        role: 'finance',
        full_name: 'Finance Lead',
      });

      const cancelInvoiceSpy = vi.spyOn(apiClient, 'cancelInvoice').mockResolvedValue({
        success: true,
        message: 'Cancelled',
        lifecycle_status: 'CANCELLED',
      });
      const closeSpy = vi.fn();

      render(
        <MockSessionProvider>
          <CancelInvoiceDrawer invoice={syntheticInvoice} close={closeSpy} />
        </MockSessionProvider>
      );

      // Enter cancellation reason
      const reasonInput = screen.getByPlaceholderText(/Enter legal\/commercial justification/i);
      fireEvent.change(reasonInput, { target: { value: 'Client requested cancellation under revised scope' } });

      // 1. Review
      const reviewBtn = screen.getByRole('button', { name: /Review cancellation/i });
      fireEvent.click(reviewBtn);

      // 2. Continue to confirmation
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

      // 3. Confirm
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm Cancellation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm Cancellation/i }));

      await waitFor(() => {
        expect(cancelInvoiceSpy).toHaveBeenCalledWith(101, {
          reason: 'Client requested cancellation under revised scope',
        });
      });
    });
  });
});
