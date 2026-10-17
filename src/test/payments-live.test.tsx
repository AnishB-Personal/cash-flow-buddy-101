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
      notes: "First milestone payment",
    },
  ],
};

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
    expect(screen.getByText(/Atomic Accounting Correction \(PostgreSQL\)/i)).toBeInTheDocument();
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
    const reasonInput = screen.getByLabelText(/Correction reason/i);
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

  it('PaymentsLedger: displays live settlement items and allows finance/admin to open correction drawer', () => {
    const onCorrectSpy = vi.fn();
    const openInvoiceSpy = vi.fn();

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

    // Check payment row rendered (present in desktop table and mobile card)
    expect(screen.getAllByText('UTR-HDFC-9918273645')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Nexus Corp')[0]).toBeInTheDocument();
    expect(screen.getAllByText('₹2,00,000')[0]).toBeInTheDocument();

    // Open row menu (first in desktop table)
    const menuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-HDFC-9918273645/i })[0];
    fireEvent.click(menuBtn);

    // Check Correct / Reverse button exists and triggers callback
    const correctBtn = screen.getAllByRole('button', { name: /Correct \/ Reverse Payment/i })[0];
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

  it('PaymentsLedger: renders type badges, parent references, signed amounts, and restricts corrections (CF4C4-03)', () => {
    const onCorrectSpy = vi.fn();
    const openInvoiceSpy = vi.fn();

    const activeInvoice: Invoice = {
      ...mockLiveInvoice,
      id: 10,
      invoice_number: 'INV-2026-ACTIVE',
      computed_status: 'PARTIAL',
      payments: [
        {
          id: 101,
          invoice_id: 10,
          transaction_type: 'PAYMENT',
          payment_amount: 50000.0,
          tds_amount: 0.0,
          payment_date: '2026-04-15',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-ACTIVE-101',
          notes: 'Active payment eligible for correction',
        },
        {
          id: 102,
          invoice_id: 10,
          transaction_type: 'REVERSAL',
          parent_transaction_id: 100,
          payment_amount: 25000.0,
          tds_amount: 0.0,
          payment_date: '2026-04-16',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-REV-102',
          notes: 'Reversal of Payment #100',
        },
        {
          id: 103,
          invoice_id: 10,
          transaction_type: 'PAYMENT',
          is_superseded: true,
          payment_amount: 30000.0,
          tds_amount: 0.0,
          payment_date: '2026-04-14',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-SUPER-103',
          notes: 'Superseded payment not eligible for correction',
        },
      ],
    };

    const cancelledInvoice: Invoice = {
      ...mockLiveInvoice,
      id: 20,
      invoice_number: 'INV-2026-CANCELLED',
      computed_status: 'CANCELLED',
      payments: [
        {
          id: 201,
          invoice_id: 20,
          transaction_type: 'PAYMENT',
          payment_amount: 15000.0,
          tds_amount: 0.0,
          payment_date: '2026-04-10',
          payment_mode: 'NEFT',
          remittance_number: 'UTR-CANC-201',
          notes: 'Retained payment for cancelled invoice',
        },
      ],
    };

    render(
      <MockSessionProvider>
        <PaymentsLedger
          records={[activeInvoice, cancelledInvoice]}
          fy="FY 2026-27"
          role="admin"
          openInvoice={openInvoiceSpy}
          onCorrectPayment={onCorrectSpy}
        />
      </MockSessionProvider>
    );

    // 1. Transaction Type Badges & Retention of Cancelled Invoice History
    expect(screen.getAllByText('PAYMENT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REVERSAL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SUPERSEDED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reversal of #100/i)[0]).toBeInTheDocument();

    // 2. Signed negative amount for reversal
    expect(screen.getAllByText('-₹25,000')[0]).toBeInTheDocument();

    // 3. Correction eligibility: Only active payment has 'Correct / Reverse Payment' option
    // Open menu for active payment 101 -> Should have correction option
    const activeMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-ACTIVE-101/i })[0];
    fireEvent.click(activeMenuBtn);
    expect(screen.getAllByRole('button', { name: /Correct \/ Reverse Payment/i })[0]).toBeInTheDocument();
    fireEvent.click(activeMenuBtn); // close

    // Open menu for reversal 102 -> Must NOT have correction option
    const revMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-REV-102/i })[0];
    fireEvent.click(revMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
    fireEvent.click(revMenuBtn); // close

    // Open menu for superseded payment 103 -> Must NOT have correction option
    const superMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-SUPER-103/i })[0];
    fireEvent.click(superMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
    fireEvent.click(superMenuBtn); // close

    // Open menu for cancelled invoice payment 201 -> Must NOT have correction option
    const cancMenuBtn = screen.getAllByRole('button', { name: /Actions for payment UTR-CANC-201/i })[0];
    fireEvent.click(cancMenuBtn);
    expect(screen.queryByRole('button', { name: /Correct \/ Reverse Payment/i })).not.toBeInTheDocument();
  });
});
