import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { RecordPaymentDrawer, PaymentCorrectionDrawer } from '@/components/collectflow/payment-workflows';
import { PaymentsLedger, type PaymentItem } from '@/components/collectflow/payments-ledger';
import { MockSessionProvider } from '@/components/collectflow/session';
import type { Invoice } from '@/data/collectflow';

const mockLiveInvoice: Invoice = {
  id: 1,
  fy_code: "FY 2026-27",
  order_type: "PO",
  po_number: "PO-2026-001",
  po_date: "2026-04-10",
  customer_id: 1,
  executive_id: 2,
  customer_name: "Nexus Corp",
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
  remarks: "Synthetic test invoice",
  payment_status: "PARTIAL",
  total_cash_paid: 200000.0,
  total_tds_deducted: 9000.0,
  total_paid: 209000.0,
  outstanding_balance: 322000.0,
  computed_status: "PARTIAL",
  executive_name: "Neha Rao",
  line_items: [],
  payments: [
    {
      id: 1,
      invoice_id: 1,
      payment_amount: 200000.0,
      tds_amount: 9000.0,
      tds_section: "194C",
      payment_date: "2026-04-18",
      payment_mode: "NEFT",
      remittance_number: "UTR-HDFC-9918273645",
    },
  ],
} as unknown as Invoice;

const mockPaymentItem: PaymentItem = {
  id: 1,
  invoice_id: 1,
  payment_amount: 200000.0,
  tds_amount: 9000.0,
  tds_section: "194C",
  payment_date: "2026-04-18",
  payment_mode: "NEFT",
  remittance_number: "UTR-HDFC-9918273645",
  notes: "First milestone payment",
  invoice: mockLiveInvoice,
  invoice_number: "INV-2026-042",
  customer_name: "Nexus Corp",
  net_settled: 209000.0,
};

describe('Stage 4C.4: LIVE Payments & Adjustments Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiClient.configure({ mode: 'live', baseUrl: 'http://127.0.0.1:8000' });
    apiClient.setToken('mock-admin-token', {
      id: 1,
      username: 'admin_user',
      role: 'admin',
      full_name: 'Admin User',
    });
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue({
      invoice: mockLiveInvoice,
      payments: [],
      items: [],
    });
  });

  it('RecordPaymentDrawer: executes live settlement workflow Form -> Review -> Confirm -> Result', async () => {
    const createPaymentSpy = vi.spyOn(apiClient, 'createPayment').mockResolvedValueOnce({
      success: true,
      payment_id: 42,
      message: 'Payment recorded successfully',
      invoice_summary: {
        outstanding_balance: '222000.00',
        total_paid: '309000.00',
        total_cash_paid: '300000.00',
        total_tds_deducted: '9000.00',
        computed_status: 'PARTIAL',
      },
    });

    const closeSpy = vi.fn();

    render(
      <MockSessionProvider>
        <RecordPaymentDrawer invoice={mockLiveInvoice} close={closeSpy} />
      </MockSessionProvider>
    );

    // Verify drawer header and form step
    expect(screen.getByRole('heading', { name: /Record Payment/i })).toBeInTheDocument();
    expect(screen.getByText('Form')).toHaveAttribute('aria-current', 'step');

    // Fill Cash Amount
    const cashInput = screen.getByLabelText(/Cash payment amount/i);
    fireEvent.change(cashInput, { target: { value: '100000' } });

    // Review step
    const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(screen.getByText('Review')).toHaveAttribute('aria-current', 'step');
    });
    expect(screen.getByText(/Live settlement: Recording Cash ₹1,00,000/i)).toBeInTheDocument();

    // Confirm step
    const continueBtn = screen.getByRole('button', { name: /Continue to confirmation/i });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/on live PostgreSQL ledger\?/i)).toBeInTheDocument();
    });

    // Execute confirmation
    const confirmBtn = screen.getByRole('button', { name: /Confirm payment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(createPaymentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_id: 1,
          payment_amount: 100000,
        })
      );
    });

    // Result step
    await waitFor(() => {
      expect(screen.getByText('Result')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/Payment recorded successfully/i)).toBeInTheDocument();
    });
  });

  it('PaymentCorrectionDrawer: executes LIVE atomic correction Form -> Review -> Confirm -> Result', async () => {
    const correctPaymentSpy = vi.spyOn(apiClient, 'correctPayment').mockResolvedValueOnce({
      success: true,
      reversal_id: 10,
      replacement_id: 11,
      message: 'Payment #1 corrected successfully',
      invoice_summary: {
        outstanding_balance: '331000.00',
        total_paid: '200000.00',
        total_cash_paid: '196000.00',
        total_tds_deducted: '4000.00',
        computed_status: 'PARTIAL',
      },
    });

    const closeSpy = vi.fn();

    render(
      <MockSessionProvider>
        <PaymentCorrectionDrawer payment={mockPaymentItem} close={closeSpy} />
      </MockSessionProvider>
    );

    // Step 1: Form
    expect(await screen.findByText(/Atomic Accounting Correction \(PostgreSQL\)/i)).toBeInTheDocument();
    expect(screen.getByText('Form')).toHaveAttribute('aria-current', 'step');

    // Enter mandatory reason (min 5 chars)
    const reasonInput = screen.getByLabelText(/Correction reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Bank reconciliation discrepancy corrected' } });

    // Modify cash amount
    const cashInput = screen.getByLabelText(/Corrected cash amount/i);
    fireEvent.change(cashInput, { target: { value: '196000' } });

    // Modify TDS amount
    const tdsInput = screen.getByLabelText(/Corrected TDS amount/i);
    fireEvent.change(tdsInput, { target: { value: '4000' } });

    // Review correction
    const reviewBtn = screen.getByRole('button', { name: /Review correction/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(screen.getByText('Review')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/-₹2,09,000\.00/i)).toBeInTheDocument(); // Compensating reversal
      expect(screen.getByText(/\+₹2,00,000\.00/i)).toBeInTheDocument(); // Replacement
    });

    // Advance to confirmation
    const contBtn = screen.getByRole('button', { name: /Continue to confirmation/i });
    fireEvent.click(contBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/Confirm committing this atomic payment correction to the live PostgreSQL database\?/i)).toBeInTheDocument();
    });

    // Confirm
    const confirmBtn = screen.getByRole('button', { name: /Confirm correction/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(correctPaymentSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reason: 'Bank reconciliation discrepancy corrected',
          corrected_payment_amount: 196000,
          corrected_tds_amount: 4000,
        })
      );
    });

    // Result step
    await waitFor(() => {
      expect(screen.getByText('Result')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/Payment #1 Corrected Successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/Reversal event #10 recorded/i)).toBeInTheDocument();
      expect(screen.getByText(/Replacement payment #11 created/i)).toBeInTheDocument();
    });
  });

  it('PaymentCorrectionDrawer: Full Reversal preset sets replacement to ₹0.00 and executes correctly', async () => {
    const correctPaymentSpy = vi.spyOn(apiClient, 'correctPayment').mockResolvedValueOnce({
      success: true,
      reversal_id: 15,
      replacement_id: null,
      message: 'Payment #1 fully reversed successfully',
      invoice_summary: {
        outstanding_balance: '531000.00',
        total_paid: '0.00',
        computed_status: 'PENDING',
      },
    });

    const closeSpy = vi.fn();

    render(
      <MockSessionProvider>
        <PaymentCorrectionDrawer payment={mockPaymentItem} close={closeSpy} />
      </MockSessionProvider>
    );

    // Enter reason
    const reasonInput = await screen.findByLabelText(/Correction reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Payment refunded to client' } });

    // Click "Full Reversal (₹0.00 replacement)"
    const fullRevBtn = screen.getByRole('button', { name: /Full Reversal/i });
    fireEvent.click(fullRevBtn);

    // Check that replacement amounts are 0
    expect(screen.getByLabelText(/Corrected cash amount/i)).toHaveValue(0);
    expect(screen.getByLabelText(/Corrected TDS amount/i)).toHaveValue(0);

    // Review
    const reviewBtn = screen.getByRole('button', { name: /Review correction/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(screen.getByText(/₹0\.00 \(Full Reversal\)/i)).toBeInTheDocument();
    });

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm correction/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm correction/i }));

    await waitFor(() => {
      expect(correctPaymentSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reason: 'Payment refunded to client',
          corrected_payment_amount: 0,
          corrected_tds_amount: 0,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Settlement fully reversed/i)).toBeInTheDocument();
    });
  });

  it('PaymentCorrectionDrawer: uses authoritative invoice balance and permits valid replacement settlement (CF4C4-04)', async () => {
    const authoritativeInvoice: Invoice = {
      id: 99,
      fy_code: 'FY 2026-27',
      order_type: 'PO',
      po_number: 'PO-2026-099',
      po_date: '2026-04-10',
      customer_id: 1,
      executive_id: 2,
      customer_name: 'Regression Client',
      customer_gstin: '29AAAAA0000A1Z5',
      customer_address: 'Bangalore, India',
      customer_state: 'Karnataka',
      currency: 'INR',
      exchange_rate: 1.0,
      original_amount: 100000.0,
      exclusive_amount: 100000.0,
      tax_rate: 0.18,
      tax_amount: 18000.0,
      total_amount: 118000.0,
      invoice_number: 'INV-2026-099',
      invoice_date: '2026-04-12',
      due_date: '2026-05-12',
      remarks: 'Regression PO',
      payment_status: 'PARTIAL',
      total_cash_paid: 100000.0,
      total_tds_deducted: 0.0,
      total_paid: 100000.0,
      outstanding_balance: 18000.0,
      computed_status: 'PARTIAL',
      executive_name: 'Neha Rao',
      line_items: [],
      payments: [],
    } as unknown as Invoice;

    const regressionPayment: PaymentItem = {
      id: 88,
      invoice_id: 99,
      payment_amount: 100000.0,
      tds_amount: 0.0,
      tds_section: null,
      payment_date: '2026-04-15',
      payment_mode: 'NEFT',
      remittance_number: 'UTR-REGRESSION-88',
      notes: 'Original partial payment of 100000',
      invoice: {
        id: 99,
        invoice_number: 'INV-2026-099',
        customer_name: 'Regression Client',
        outstanding_balance: 0, // Placeholder zero balance that MUST NOT contaminate LIVE calculations
      } as any,
      invoice_number: 'INV-2026-099',
      customer_name: 'Regression Client',
      net_settled: 100000.0,
    };

    const getInvoiceSpy = vi.spyOn(apiClient, 'getInvoice').mockResolvedValueOnce({
      invoice: authoritativeInvoice,
      payments: [],
      items: [],
    });

    const correctPaymentSpy = vi.spyOn(apiClient, 'correctPayment').mockResolvedValueOnce({
      success: true,
      reversal_id: 880,
      replacement_id: 881,
      message: 'Payment #88 corrected successfully',
      invoice_summary: {
        outstanding_balance: '16000.00',
        total_paid: '102000.00',
        total_cash_paid: '102000.00',
        total_tds_deducted: '0.00',
        computed_status: 'PARTIAL',
      },
    });

    render(
      <MockSessionProvider>
        <PaymentCorrectionDrawer payment={regressionPayment} close={vi.fn()} />
      </MockSessionProvider>
    );

    // Wait for authoritative invoice data to load
    expect(await screen.findByText(/Atomic Accounting Correction \(PostgreSQL\)/i)).toBeInTheDocument();
    expect(getInvoiceSpy).toHaveBeenCalledWith(99);

    // Enter mandatory reason
    const reasonInput = screen.getByLabelText(/Correction reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Increasing allocation per revised invoice reconciliation' } });

    // Set corrected cash amount to 102,000 (replacement net: 102,000)
    // Formula: liveResultingOutstanding = 18,000 (authoritative outstanding) + 100,000 (orig) - 102,000 (rep) = 16,000
    const cashInput = screen.getByLabelText(/Corrected cash amount/i);
    fireEvent.change(cashInput, { target: { value: '102000' } });

    // Verify preview calculation: replacement total ₹1,02,000.00 and resulting outstanding ₹16,000.00
    expect(screen.getByText('₹1,02,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹16,000.00')).toBeInTheDocument();

    // Verify "Review correction" is enabled and not blocked by false overpayment
    const reviewBtn = screen.getByRole('button', { name: /Review correction/i });
    expect(reviewBtn).not.toBeDisabled();
    fireEvent.click(reviewBtn);

    // Verify Review step reflects ₹16,000.00 net balance adjustment
    await waitFor(() => {
      expect(screen.getByText('Review')).toHaveAttribute('aria-current', 'step');
      expect(screen.getAllByText(/-₹1,00,000\.00/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/\+₹1,02,000\.00/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText('₹16,000.00').length).toBeGreaterThan(0);
    });

    // Continue to Confirm
    const continueBtn = screen.getByRole('button', { name: /Continue to confirmation/i });
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toHaveAttribute('aria-current', 'step');
    });

    // Submit confirmation
    const confirmBtn = screen.getByRole('button', { name: /Confirm correction/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(correctPaymentSpy).toHaveBeenCalledWith(
        88,
        expect.objectContaining({
          corrected_payment_amount: 102000,
          reason: 'Increasing allocation per revised invoice reconciliation',
        })
      );
      expect(screen.getByText('Result')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/Payment #88 Corrected Successfully/i)).toBeInTheDocument();
    });
  });

  it('PaymentCorrectionDrawer: renders loading and error states and prevents submission until authoritative invoice is loaded', async () => {
    let resolveInvoice: (value: any) => void;
    let rejectInvoice: (reason?: any) => void;

    // 1. Loading state
    vi.spyOn(apiClient, 'getInvoice').mockImplementation(() => {
      return new Promise((resolve, reject) => {
        resolveInvoice = resolve;
        rejectInvoice = reject;
      });
    });

    render(
      <MockSessionProvider>
        <PaymentCorrectionDrawer payment={mockPaymentItem} close={vi.fn()} />
      </MockSessionProvider>
    );

    // Assert loading spinner / status indicator
    expect(screen.getByRole('status')).toHaveTextContent(/Loading authoritative invoice details…/i);
    expect(screen.queryByLabelText(/Correction reason/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review correction/i })).not.toBeInTheDocument();

    // 2. Reject and assert error state
    rejectInvoice!(new Error('Failed to load authoritative invoice: 503 Service Unavailable'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/503 Service Unavailable/i);
    });
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review correction/i })).not.toBeInTheDocument();

    // 3. Retry and resolve successfully
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValueOnce({
      invoice: mockLiveInvoice,
      payments: [],
      items: [],
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    // Assert form renders after successful retry
    expect(await screen.findByLabelText(/Correction reason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review correction/i })).toBeInTheDocument();
  });

  it('PaymentCorrectionDrawer: preserves Phase 3 simulated deletion in MOCK mode', () => {
    apiClient.configure({ mode: 'mock', baseUrl: 'http://127.0.0.1:8000' });
    apiClient.clearSession();

    render(
      <MockSessionProvider>
        <PaymentCorrectionDrawer payment={mockPaymentItem} close={vi.fn()} />
      </MockSessionProvider>
    );

    // In mock mode, step 1 is physical deletion
    expect(screen.getByText(/Non-Atomic Administrative Sequence/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm Deletion & Proceed to Step 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Only \(No Replacement\)/i })).toBeInTheDocument();
  });

  it('PaymentsLedger: displays live settlement items and allows finance/admin to open correction drawer', async () => {
    const onCorrectSpy = vi.fn();
    const openInvoiceSpy = vi.fn();

    vi.spyOn(apiClient, 'getPayments').mockResolvedValue({
      page: 1,
      limit: 10,
      total: 1,
      total_pages: 1,
      summary: {
        total_cash: '200000.00',
        total_tds: '9000.00',
        total_settled: '209000.00',
        transaction_count: 1,
      },
      data: [
        {
          id: 1,
          invoice_id: 1,
          invoice_number: 'INV-2026-042',
          customer_name: 'Nexus Corp',
          cash_amount: '200000.00',
          tds_amount: '9000.00',
          total_settled: '209000.00',
          payment_date: '2026-04-18',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-HDFC-9918273645',
          notes: 'First milestone payment',
          tds_section: '194C',
          transaction_type: 'PAYMENT',
          is_superseded: false,
          invoice_lifecycle_status: 'PARTIAL',
          fy_code: 'FY 2026-27',
          created_at: '2026-04-18T10:00:00Z',
        } as any,
      ],
    });

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[mockLiveInvoice]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={openInvoiceSpy}
          onCorrectPayment={onCorrectSpy}
        />
      </MockSessionProvider>
    );

    // Wait for live fetch to finish and check payment row rendered
    await waitFor(() => {
      expect(screen.getAllByText('UTR-HDFC-9918273645')[0]).toBeInTheDocument();
    });
    expect(screen.getAllByText('Nexus Corp')[0]).toBeInTheDocument();
    expect(screen.getAllByText('₹2,00,000')[0]).toBeInTheDocument();

    // Open row menu (first in desktop table)
    const menuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-HDFC-9918273645/i })[0]!;
    fireEvent.click(menuBtn);

    // Check Correct / Reverse button exists and triggers callback
    const correctBtn = screen.getAllByRole('button', { name: /Correct \/ Reverse Payment/i })[0]!;
    expect(correctBtn).toBeInTheDocument();
    fireEvent.click(correctBtn);

    expect(onCorrectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        invoice_number: 'INV-2026-042',
      })
    );
  });

  it('RecordPaymentDrawer: preserves stable idempotency key across failed submission and manual retry (CF4C4-02)', async () => {
    let callCount = 0;
    const capturedPayloads: any[] = [];
    vi.spyOn(apiClient, 'createPayment').mockImplementation(async (payload) => {
      callCount++;
      capturedPayloads.push(payload);
      if (callCount === 1) {
        throw new Error('Network timeout: Please retry');
      }
      return {
        success: true,
        payment_id: 999,
        message: 'Payment recorded successfully',
      };
    });

    render(
      <MockSessionProvider>
        <RecordPaymentDrawer invoice={mockLiveInvoice} close={vi.fn()} />
      </MockSessionProvider>
    );

    // 1. Submit Form to Review
    const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
    fireEvent.click(reviewBtn);

    // 2. Review -> Confirm
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Continue to confirmation/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));

    // 3. First Confirm Attempt (Simulates Failure)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm payment/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm payment/i }));

    // Error alert should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Network timeout: Please retry/i)).toBeInTheDocument();
    });
    expect(callCount).toBe(1);
    const firstKey = capturedPayloads[0].idempotency_key;
    expect(firstKey).toBeDefined();
    expect(firstKey).toMatch(/^pay-idem-/);

    // 4. Retry Confirm Attempt (Manual retry of same submission)
    const retryBtn = screen.getByRole('button', { name: /Confirm payment/i });
    fireEvent.click(retryBtn);

    // Success screen should now display
    await waitFor(() => {
      expect(screen.getByText(/Payment recorded successfully/i)).toBeInTheDocument();
    });
    expect(callCount).toBe(2);
    const secondKey = capturedPayloads[1].idempotency_key;
    // Exactly the same idempotency key preserved across retries
    expect(secondKey).toBe(firstKey);
  });

  it('PaymentsLedger: renders type badges, parent references, signed amounts, and restricts corrections (CF4C4-03)', async () => {
    const onCorrectSpy = vi.fn();
    const openInvoiceSpy = vi.fn();

    vi.spyOn(apiClient, 'getPayments').mockResolvedValue({
      page: 1,
      limit: 10,
      total: 4,
      total_pages: 1,
      summary: {
        total_cash: '70000.00',
        total_tds: '0.00',
        total_settled: '70000.00',
        transaction_count: 4,
      },
      data: [
        {
          id: 101,
          invoice_id: 10,
          invoice_number: 'INV-2026-ACTIVE',
          customer_name: 'Nexus Corp',
          cash_amount: '50000.00',
          tds_amount: '0.00',
          total_settled: '50000.00',
          payment_date: '2026-04-15',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-ACTIVE-101',
          notes: 'Active payment eligible for correction',
          transaction_type: 'PAYMENT',
          is_superseded: false,
          invoice_lifecycle_status: 'PARTIAL',
          fy_code: 'FY 2026-27',
          created_at: '2026-04-15T10:00:00Z',
        } as any,
        {
          id: 102,
          invoice_id: 10,
          invoice_number: 'INV-2026-ACTIVE',
          customer_name: 'Nexus Corp',
          cash_amount: '25000.00',
          tds_amount: '0.00',
          total_settled: '25000.00',
          payment_date: '2026-04-16',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-REV-102',
          notes: 'Reversal of Payment #100',
          transaction_type: 'REVERSAL',
          parent_transaction_id: 100,
          is_superseded: false,
          invoice_lifecycle_status: 'PARTIAL',
          fy_code: 'FY 2026-27',
          created_at: '2026-04-16T10:00:00Z',
        } as any,
        {
          id: 103,
          invoice_id: 10,
          invoice_number: 'INV-2026-ACTIVE',
          customer_name: 'Nexus Corp',
          cash_amount: '30000.00',
          tds_amount: '0.00',
          total_settled: '30000.00',
          payment_date: '2026-04-14',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-SUPER-103',
          notes: 'Superseded payment not eligible for correction',
          transaction_type: 'PAYMENT',
          is_superseded: true,
          invoice_lifecycle_status: 'PARTIAL',
          fy_code: 'FY 2026-27',
          created_at: '2026-04-14T10:00:00Z',
        } as any,
        {
          id: 201,
          invoice_id: 20,
          invoice_number: 'INV-2026-CANCELLED',
          customer_name: 'Nexus Corp',
          cash_amount: '15000.00',
          tds_amount: '0.00',
          total_settled: '15000.00',
          payment_date: '2026-04-10',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-CANC-201',
          notes: 'Retained payment for cancelled invoice',
          transaction_type: 'PAYMENT',
          is_superseded: false,
          invoice_lifecycle_status: 'CANCELLED',
          fy_code: 'FY 2026-27',
          created_at: '2026-04-10T10:00:00Z',
        } as any,
      ],
    });

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={openInvoiceSpy}
          onCorrectPayment={onCorrectSpy}
        />
      </MockSessionProvider>
    );

    // Wait for live fetch to complete
    await waitFor(() => {
      expect(screen.getAllByText('PAYMENT').length).toBeGreaterThan(0);
    });

    // 1. Transaction Type Badges & Retention of Cancelled Invoice History
    expect(screen.getAllByText('REVERSAL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SUPERSEDED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reversal of #100/i)[0]).toBeInTheDocument();

    // 2. Signed negative amount for reversal
    expect(screen.getAllByText('-₹25,000')[0]).toBeInTheDocument();

    // 3. Correction eligibility: Only active payment has 'Correct / Reverse Payment' option
    // Open menu for active payment 101 -> Should have correction option
    const activeMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-ACTIVE-101/i })[0]!;
    fireEvent.click(activeMenuBtn);
    expect(screen.getAllByRole('button', { name: /Correct \/ Reverse Payment/i })[0]).toBeInTheDocument();
    fireEvent.click(activeMenuBtn); // close

    // Open menu for reversal 102 -> Must NOT have correction option
    const revMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-REV-102/i })[0]!;
    fireEvent.click(revMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
    fireEvent.click(revMenuBtn); // close

    // Open menu for superseded payment 103 -> Must NOT have correction option
    const superMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-SUPER-103/i })[0]!;
    fireEvent.click(superMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
    fireEvent.click(superMenuBtn); // close

    // Open menu for cancelled invoice payment 201 -> Must NOT have correction option
    const cancMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-CANC-201/i })[0]!;
    fireEvent.click(cancMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
  });

  it('PaymentsLedger: respects backend pagination parameters and loads records beyond first page (CF4C4-03)', async () => {
    const getPaymentsSpy = vi.spyOn(apiClient, 'getPayments').mockImplementation(async (params) => {
      const pageNum = params?.page ?? 1;
      const limitNum = params?.limit ?? 10;
      return {
        page: pageNum,
        limit: limitNum,
        total: 75,
        total_pages: 8,
        summary: {
          total_cash: '750000.00',
          total_tds: '0.00',
          total_settled: '750000.00',
          transaction_count: 75,
        },
        data: [
          {
            id: pageNum * 10,
            invoice_id: 10,
            invoice_number: `INV-2026-P${pageNum}`,
            customer_name: `Customer P${pageNum}`,
            cash_amount: '10000.00',
            tds_amount: '0.00',
            total_settled: '10000.00',
            payment_date: '2026-04-15',
            payment_mode: 'NEFT',
            remittance_number: `UTR-PAGE-${pageNum}`,
            transaction_type: 'PAYMENT',
            is_superseded: false,
            invoice_lifecycle_status: 'ISSUED',
            fy_code: 'FY 2026-27',
            created_at: '2026-04-15T10:00:00Z',
          } as any,
        ],
      };
    });

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={vi.fn()}
        />
      </MockSessionProvider>
    );

    // Initial page 1 loads
    await waitFor(() => {
      expect(screen.getByText('1–10 of 75')).toBeInTheDocument();
    });
    expect(screen.getByText('1 / 8')).toBeInTheDocument();
    expect(screen.getAllByText('UTR-PAGE-1')[0]).toBeInTheDocument();

    // Previous page should be disabled on page 1
    const prevBtn = screen.getByRole('button', { name: /Previous page/i });
    expect(prevBtn).toBeDisabled();

    // Next page should be enabled
    const nextBtn = screen.getByRole('button', { name: /Next page/i });
    expect(nextBtn).not.toBeDisabled();

    // Click Next page
    fireEvent.click(nextBtn);

    // Should fetch page 2 from backend
    await waitFor(() => {
      expect(screen.getByText('11–20 of 75')).toBeInTheDocument();
    });
    expect(screen.getByText('2 / 8')).toBeInTheDocument();
    expect(screen.getAllByText('UTR-PAGE-2')[0]).toBeInTheDocument();

    expect(getPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
      })
    );
  });

  it('PaymentsLedger: displays explicit loading state during retrieval without silent mock fallback (CF4C4-03)', () => {
    // Hang promise to hold component in loading state
    vi.spyOn(apiClient, 'getPayments').mockReturnValue(new Promise(() => {}));

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[mockLiveInvoice]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={vi.fn()}
        />
      </MockSessionProvider>
    );

    // Verify loading status indicator is present
    const loadingElem = screen.getByRole('status');
    expect(loadingElem).toBeInTheDocument();
    expect(loadingElem).toHaveTextContent(/Loading payments ledger…/i);

    // Verify mockLiveInvoice payments are NOT silently rendered
    expect(screen.queryByText('UTR-HDFC-9918273645')).not.toBeInTheDocument();
  });

  it('PaymentsLedger: displays explicit API failure state with retry button without silent mock fallback (CF4C4-03)', async () => {
    let attempts = 0;
    vi.spyOn(apiClient, 'getPayments').mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('500 Internal Server Error: Database timeout');
      }
      return {
        page: 1,
        limit: 10,
        total: 1,
        total_pages: 1,
        summary: {
          total_cash: '50000.00',
          total_tds: '0.00',
          total_settled: '50000.00',
          transaction_count: 1,
        },
        data: [
          {
            id: 99,
            invoice_id: 1,
            invoice_number: 'INV-2026-099',
            customer_name: 'Nexus Corp',
            cash_amount: '50000.00',
            tds_amount: '0.00',
            total_settled: '50000.00',
            payment_date: '2026-04-18',
            payment_mode: 'NEFT',
            remittance_number: 'UTR-RECOVERED-99',
            transaction_type: 'PAYMENT',
            is_superseded: false,
            invoice_lifecycle_status: 'ISSUED',
            fy_code: 'FY 2026-27',
            created_at: '2026-04-18T10:00:00Z',
          } as any,
        ],
      };
    });

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[mockLiveInvoice]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={vi.fn()}
        />
      </MockSessionProvider>
    );

    // Verify error alert is displayed
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/500 Internal Server Error: Database timeout/i)).toBeInTheDocument();

    // Verify mockLiveInvoice payments are NOT silently substituted
    expect(screen.queryByText('UTR-HDFC-9918273645')).not.toBeInTheDocument();

    // Click Retry button
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);

    // Second attempt should succeed and show recovered record
    await waitFor(() => {
      expect(screen.getAllByText('UTR-RECOVERED-99')[0]).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('PaymentsLedger: preserves MOCK mode behavior when apiClient mode is mock (CF4C4-03)', () => {
    apiClient.configure({ mode: 'mock' });
    const getPaymentsSpy = vi.spyOn(apiClient, 'getPayments');

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[mockLiveInvoice]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={vi.fn()}
        />
      </MockSessionProvider>
    );

    // MOCK records should render directly from mock records prop
    expect(screen.getAllByText('UTR-HDFC-9918273645')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Nexus Corp')[0]).toBeInTheDocument();
    expect(screen.getAllByText('₹2,00,000')[0]).toBeInTheDocument();

    // Backend endpoint must not be invoked in mock mode
    expect(getPaymentsSpy).not.toHaveBeenCalled();
  });
});
