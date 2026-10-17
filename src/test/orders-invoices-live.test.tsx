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

      const liveCustomers = [
        { id: 1, customer_name: 'Live Acme', billing_name: 'Live Acme Corp', gstin: '29ABCDE1234F1Z5' },
      ];
      const liveUsers = [
        { id: 3, full_name: 'Sales Rep', role: 'sales', is_active: true },
      ];
      vi.spyOn(apiClient, 'getCustomers').mockResolvedValue(liveCustomers as any);
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue(liveUsers as any);
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

      // Wait for references to resolve
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Review changes/i })).not.toBeDisabled();
      });

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

    it('dispatches apiClient.createInvoice in LIVE mode when order_type is RECURRING (CF4C3-03)', async () => {
      apiClient.setToken('finance-token', {
        id: 2,
        username: 'sandbox_finance',
        role: 'finance',
        full_name: 'Finance Lead',
      });

      const liveCustomers = [
        { id: 99, customer_name: 'Live Customer Inc', billing_name: 'Live Customer Inc', gstin: '27ABCDE1234F1Z5' },
      ];
      const liveUsers = [
        { id: 4, full_name: 'Live Sales Exec', role: 'sales' },
      ];

      const getCustSpy = vi.spyOn(apiClient, 'getCustomers').mockResolvedValue(liveCustomers as any);
      const getUsersSpy = vi.spyOn(apiClient, 'getUsers').mockResolvedValue(liveUsers as any);
      const createInvoiceSpy = vi.spyOn(apiClient, 'createInvoice').mockResolvedValue(syntheticInvoice as any);
      const closeSpy = vi.fn();

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '99',
          order_type: 'RECURRING',
          po_number: 'INV-REC-101',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '4',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Monthly Maintenance Retainer',
          quantity: '1',
          unit_price: '50000',
          tax_rate: '0.18',
          remarks: 'Direct recurring invoice',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={closeSpy} />
        </MockSessionProvider>
      );

      // Verify live customer and user fetching
      await waitFor(() => {
        expect(getCustSpy).toHaveBeenCalled();
        expect(getUsersSpy).toHaveBeenCalled();
      });

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
        expect(createInvoiceSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            customer_id: 99,
            invoice_number: 'INV-REC-101',
            invoice_date: '2026-06-15',
            items: expect.arrayContaining([
              expect.objectContaining({
                description: 'Monthly Maintenance Retainer',
                quantity: 1,
                unit_price: 50000,
                tax_rate: 0.18,
              }),
            ]),
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

  describe('CF4C3-03: LIVE Isolation & Failure Paths', () => {
    it('handles reference loading state: disables buttons and shows loading placeholders without mock IDs', async () => {
      apiClient.setToken('sales-token', {
        id: 3,
        username: 'sandbox_sales',
        role: 'sales',
        full_name: 'Sales Rep',
      });

      // Pending promises that do not immediately resolve
      vi.spyOn(apiClient, 'getCustomers').mockReturnValue(new Promise(() => {}));
      vi.spyOn(apiClient, 'getUsers').mockReturnValue(new Promise(() => {}));

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '1',
          order_type: 'PO',
          po_number: 'PO-LIVE-LOADING',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '3',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Loading State Test',
          quantity: '1',
          unit_price: '5000',
          tax_rate: '0.18',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      // Loading banner is displayed
      expect(screen.getByText(/Loading live customer and user references…/i)).toBeInTheDocument();

      // Submit and example buttons are disabled
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      expect(reviewBtn).toBeDisabled();
      const exampleBtn = screen.getByRole('button', { name: /Use verified example/i });
      expect(exampleBtn).toBeDisabled();

      // Dropdowns show loading placeholders and are disabled
      const custSelect = screen.getByLabelText(/Customer/i) as HTMLSelectElement;
      expect(custSelect).toBeDisabled();
      expect(screen.getByText('Loading live customers…')).toBeInTheDocument();

      const execSelect = screen.getByLabelText(/Sales executive/i) as HTMLSelectElement;
      expect(execSelect).toBeDisabled();
      expect(screen.getByText('Loading live sales executives…')).toBeInTheDocument();

      // Mock options must NOT be rendered
      expect(screen.queryByText('Acme Innovations Pvt Ltd')).not.toBeInTheDocument();
      expect(screen.queryByText('Neha Rao')).not.toBeInTheDocument();
    });

    it('handles backend API errors explicitly and blocks submission', async () => {
      apiClient.setToken('sales-token', {
        id: 3,
        username: 'sandbox_sales',
        role: 'sales',
        full_name: 'Sales Rep',
      });

      vi.spyOn(apiClient, 'getCustomers').mockRejectedValue(new Error('Network error: connection refused'));
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue([]);

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '1',
          order_type: 'PO',
          po_number: 'PO-LIVE-ERR',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '3',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Error State Test',
          quantity: '1',
          unit_price: '5000',
          tax_rate: '0.18',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      // Error alert banner is displayed
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load live backend records: Network error/i);
      });

      // Submit button is disabled
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      expect(reviewBtn).toBeDisabled();

      // Dropdown shows error option
      expect(screen.getByText('Failed to load live customers')).toBeInTheDocument();
      expect(screen.queryByText('Acme Innovations Pvt Ltd')).not.toBeInTheDocument();
    });

    it('handles empty backend results: displays notice and prevents order submission', async () => {
      apiClient.setToken('sales-token', {
        id: 3,
        username: 'sandbox_sales',
        role: 'sales',
        full_name: 'Sales Rep',
      });

      vi.spyOn(apiClient, 'getCustomers').mockResolvedValue([]);
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue([]);

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '',
          order_type: 'PO',
          po_number: 'PO-LIVE-EMPTY',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Empty Backend Test',
          quantity: '1',
          unit_price: '5000',
          tax_rate: '0.18',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      // Notice for empty customers is displayed
      await waitFor(() => {
        expect(screen.getByText(/No active customers found in backend/i)).toBeInTheDocument();
      });

      // Dropdown indicates no live customers
      expect(screen.getByText('No active live customers available')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review changes/i })).toBeDisabled();

      // Mock customers must NOT be used as fallback
      expect(screen.queryByText('Acme Innovations Pvt Ltd')).not.toBeInTheDocument();
    });

    it('rejects unvalidated mock IDs and prevents submission in LIVE mode', async () => {
      apiClient.setToken('sales-token', {
        id: 3,
        username: 'sandbox_sales',
        role: 'sales',
        full_name: 'Sales Rep',
      });

      // Live backend only has Customer 99 and Sales User 4
      const liveCustomers = [
        { id: 99, customer_name: 'Nexus Corp', billing_name: 'Nexus Corp', gstin: '29ABCDE9999F1Z5' },
      ];
      const liveUsers = [
        { id: 4, full_name: 'Live Sales Rep', role: 'sales', is_active: true },
      ];
      vi.spyOn(apiClient, 'getCustomers').mockResolvedValue(liveCustomers as any);
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue(liveUsers as any);
      const createOrderSpy = vi.spyOn(apiClient, 'createOrder').mockResolvedValue(syntheticInvoice);

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '1',
          order_type: 'PO',
          po_number: 'PO-LIVE-VERIFIED',
          po_date: '2026-06-15',
          fy_code: 'FY 2026-27',
          executive_id: '3',
          currency: 'INR',
          exchange_rate: '1.0',
          line_item_description: 'Live ID Test',
          quantity: '1',
          unit_price: '5000',
          tax_rate: '0.18',
          remarks: 'Verified remarks',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      // Wait for references to resolve
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Review changes/i })).not.toBeDisabled();
      });

      // In LIVE mode, customer_id should auto-populate with valid live customer 99
      const custSelect = screen.getByLabelText(/Customer/i) as HTMLSelectElement;
      expect(custSelect.value).toBe('99');
      expect(screen.queryByText('Acme Innovations Pvt Ltd')).not.toBeInTheDocument();
      expect(screen.getByText('Nexus Corp')).toBeInTheDocument();

      // Executive should auto-populate with valid live sales user 4
      const execSelect = screen.getByLabelText(/Sales executive/i) as HTMLSelectElement;
      expect(execSelect.value).toBe('4');
      expect(screen.queryByText('Neha Rao')).not.toBeInTheDocument();
      expect(screen.getByText('Live Sales Rep')).toBeInTheDocument();

      // Submit and verify it dispatches with valid live IDs 99 and 4
      fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm create purchase order/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm create purchase order/i }));

      await waitFor(() => {
        expect(createOrderSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            customer_id: 99,
            executive_id: 4,
          })
        );
      });
    });

    it('blocks submission when an unverified/mock customer ID is submitted in LIVE mode', async () => {
      apiClient.setToken('admin-token', {
        id: 1,
        username: 'sandbox_admin',
        role: 'admin',
        full_name: 'Admin User',
      });

      // Backend only has customer 99
      vi.spyOn(apiClient, 'getCustomers').mockResolvedValue([
        { id: 99, customer_name: 'Nexus Corp', billing_name: 'Nexus Corp', gstin: '29ABCDE9999F1Z5' },
      ] as any);
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue([
        { id: 4, full_name: 'Live Sales Rep', role: 'sales', is_active: true },
      ] as any);
      const updateOrderSpy = vi.spyOn(apiClient, 'updateOrder');

      const op: OrderOperation = {
        action: 'order-edit',
        target: '101',
        label: 'Edit Order',
        values: {
          customer_id: '999', // unverified customer ID
          executive_id: '4',
          po_number: 'PO-MOCK-CUST',
          po_date: '2026-06-15',
          line_item_description: 'Test Invalid Customer',
          remarks: 'Testing customer rejection',
        },
        example: {},
        record: syntheticInvoice,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Review changes/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));

      // Review should be blocked with explicit error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Selected customer is not a valid live customer/i);
      });
      expect(updateOrderSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /Continue to confirmation/i })).not.toBeInTheDocument();
    });

    it('blocks submission when an unverified/mock executive ID is submitted in LIVE mode', async () => {
      apiClient.setToken('admin-token', {
        id: 1,
        username: 'sandbox_admin',
        role: 'admin',
        full_name: 'Admin User',
      });

      // Backend only has customer 99 and sales user 4
      vi.spyOn(apiClient, 'getCustomers').mockResolvedValue([
        { id: 99, customer_name: 'Nexus Corp', billing_name: 'Nexus Corp', gstin: '29ABCDE9999F1Z5' },
      ] as any);
      vi.spyOn(apiClient, 'getUsers').mockResolvedValue([
        { id: 4, full_name: 'Live Sales Rep', role: 'sales', is_active: true },
      ] as any);
      const updateOrderSpy = vi.spyOn(apiClient, 'updateOrder');

      const op: OrderOperation = {
        action: 'order-edit',
        target: '101',
        label: 'Edit Order',
        values: {
          customer_id: '99',
          executive_id: '999', // unverified executive ID
          po_number: 'PO-MOCK-EXEC',
          po_date: '2026-06-15',
          line_item_description: 'Test Invalid Executive',
          remarks: 'Testing executive rejection',
        },
        example: {},
        record: syntheticInvoice,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Review changes/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));

      // Review should be blocked with explicit error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Selected sales executive is not a valid active sales user/i);
      });
      expect(updateOrderSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /Continue to confirmation/i })).not.toBeInTheDocument();
    });

    it('preserves MOCK mode unchanged: uses mock session references and allows full rehearsal', async () => {
      // Switch apiClient to mock mode via configure
      apiClient.configure({ mode: 'mock' });
      expect(apiClient.getMode()).toBe('mock');

      const op: OrderOperation = {
        action: 'order-create',
        target: '',
        label: 'Create Purchase Order',
        values: {
          customer_id: '1',
          order_type: 'PO',
          po_number: 'PO-2026-DEMO-001',
          po_date: '2026-04-15',
          fy_code: 'FY 2026-27',
          executive_id: '3',
          currency: 'INR',
          exchange_rate: '1',
          line_item_description: 'Cloud Security Audit & Review',
          quantity: '1',
          unit_price: '100000',
          tax_rate: '0.18',
          remarks: 'Enterprise security milestone',
        },
        example: orderCreateExample,
      };

      render(
        <MockSessionProvider>
          <OrderWorkflowModal operation={op} close={vi.fn()} />
        </MockSessionProvider>
      );

      // In MOCK mode, mock customers and executives are preserved
      expect(screen.getByText('Acme Cloud Solutions Pvt Ltd')).toBeInTheDocument();
      expect(screen.getByText('Neha Rao')).toBeInTheDocument();

      // Review changes button is immediately enabled without backend network calls
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      expect(reviewBtn).not.toBeDisabled();
      fireEvent.click(reviewBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Confirm create purchase order/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirm create purchase order/i }));

      // Demo result step reached
      await waitFor(() => {
        expect(screen.getByText(/Verified demo change applied/i)).toBeInTheDocument();
      });
    });
  });
});
