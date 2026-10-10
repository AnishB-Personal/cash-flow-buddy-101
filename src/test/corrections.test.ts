import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  createPaymentAdapter,
  reviewPayment,
  getPaymentPresets,
  type PaymentCreateInput,
} from '@/data/payments';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';
import { snapshot } from '@/data/records';
import { readDemoSnapshot } from '@/data/demo';
import { PaymentCorrectionDrawer } from '@/components/collectflow/payment-workflows';
import { MockSessionProvider } from '@/components/collectflow/session';
import type { PaymentItem } from '@/components/collectflow/payments-ledger';

describe('Administrative Payment Corrections (corrections.test.ts)', () => {
  let invoices: Invoice[];
  let adapter: ReturnType<typeof createPaymentAdapter>;

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
    adapter = createPaymentAdapter();
  });

  describe('1. Physical Deletion & Recalculation Parity', () => {
    it('physically deletes payment record from invoice payments list', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.payments.length).toBe(1);

      const updated = adapter.deletePayment(85, invoices, 'finance');
      const updated101 = updated.find(i => i.id === 101)!;

      expect(updated101.payments.length).toBe(0);
      expect(updated101.total_cash_paid).toBe(0);
      expect(updated101.total_tds_deducted).toBe(0);
      expect(updated101.total_paid).toBe(0);
      expect(updated101.outstanding_balance).toBe(531000);
      expect(updated101.computed_status).toBe('PENDING');
    });

    it('throws error when payment id does not exist (404 parity)', () => {
      expect(() => adapter.deletePayment(9999, invoices, 'finance')).toThrowError(
        'Payment record not found'
      );
    });

    it('enforces RBAC permissions on deletePayment', () => {
      expect(() => adapter.deletePayment(85, invoices, 'sales')).toThrowError(
        "Access forbidden: role 'sales' lacks required permissions (admin, finance)"
      );
      expect(() => adapter.deletePayment(85, invoices, 'viewer')).toThrowError(
        "Access forbidden: role 'viewer' lacks required permissions (admin, finance)"
      );
    });
  });

  describe('2. Multi-Payment Incremental Recalculation', () => {
    it('deleting one payment preserves remaining payments and updates balance correctly', () => {
      const input2: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-HDFC-9918273645',
      };
      const withTwo = adapter.recordPayment(input2, invoices, 'finance');
      const invTwo = withTwo.find(i => i.id === 101)!;
      expect(invTwo.payments.length).toBe(2);
      expect(invTwo.outstanding_balance).toBe(222000);

      // Now delete the newly added payment (id 86)
      const afterDelete = adapter.deletePayment(86, withTwo, 'finance');
      const invAfter = afterDelete.find(i => i.id === 101)!;
      expect(invAfter.payments.length).toBe(1);
      expect(invAfter.payments[0]!.id).toBe(85);
      expect(invAfter.total_cash_paid).toBe(200000);
      expect(invAfter.total_tds_deducted).toBe(9000);
      expect(invAfter.outstanding_balance).toBe(322000);
      expect(invAfter.computed_status).toBe('PARTIAL');
    });
  });

  describe('3. Two-Step Correction Sequence (Delete + Recreate)', () => {
    it('executes two distinct steps without pretending to be native atomic reversal', () => {
      // Step 1: Delete original payment
      const step1Invoices = adapter.deletePayment(85, invoices, 'finance');
      const invStep1 = step1Invoices.find(i => i.id === 101)!;
      expect(invStep1.outstanding_balance).toBe(531000);
      expect(invStep1.computed_status).toBe('PENDING');

      // Step 2: Re-create replacement payment with corrected details
      const replacementInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 210000,
        tds_amount: 9000,
        tds_section: '194J (2%)',
        payment_date: '2026-04-21',
        payment_mode: 'RTGS',
        remittance_number: 'UTR-CORRECTED-98765',
        notes: 'Correction replacement for deleted payment #85',
      };
      const step2Invoices = adapter.recordPayment(replacementInput, step1Invoices, 'finance');
      const invStep2 = step2Invoices.find(i => i.id === 101)!;

      expect(invStep2.payments.length).toBe(1);
      expect(invStep2.payments[0]!.remittance_number).toBe('UTR-CORRECTED-98765');
      expect(invStep2.total_cash_paid).toBe(210000);
      expect(invStep2.total_tds_deducted).toBe(9000);
      expect(invStep2.total_paid).toBe(219000);
      expect(invStep2.outstanding_balance).toBe(312000);
      expect(invStep2.computed_status).toBe('PARTIAL');
    });

    it('enables cancellation of invoice once payment is deleted', () => {
      // Verify blocked prior to delete
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 101, reason: 'Dispute' }, invoices, 'finance')
      ).toThrowError(/Cannot cancel invoice with existing payments/);

      // Delete payment
      const afterDelete = adapter.deletePayment(85, invoices, 'finance');

      // Cancellation now succeeds
      const cancelled = adapter.cancelInvoice({ invoice_id: 101, reason: 'Dispute' }, afterDelete, 'finance');
      const inv101 = cancelled.find(i => i.id === 101)!;
      expect(inv101.computed_status).toBe('CANCELLED');
      expect(inv101.outstanding_balance).toBe(0);
    });
  });

  describe('4. Failure Recovery during Correction Sequence', () => {
    it('leaves Step 1 valid and recoverable if Step 2 encounters invalid input', () => {
      const step1Invoices = adapter.deletePayment(85, invoices, 'finance');

      // Attempt invalid replacement (exceeding invoice balance)
      const invalidReplacement: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 600000, // exceeds 531000
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      expect(() =>
        adapter.recordPayment(invalidReplacement, step1Invoices, 'finance')
      ).toThrowError(/exceeds the outstanding balance/);

      // System state is still at Step 1 outcome: invoice is PENDING with 531000 available
      const recovered = step1Invoices.find(i => i.id === 101)!;
      expect(recovered.outstanding_balance).toBe(531000);
      expect(recovered.payments.length).toBe(0);
    });
  });

  describe('5. Review-Only Guard for Unsupported Inputs', () => {
    it('marks arbitrary custom inputs as review-only (supported: false)', async () => {
      const step1Invoices = adapter.deletePayment(85, invoices, 'finance');
      const customInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 77777, // arbitrary custom amount
        tds_amount: 1111,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      const review = reviewPayment(customInput, 'finance', step1Invoices);
      expect(review.supported).toBe(false);
      expect(review.message).toContain('Review only: custom inputs have no verified scenario outcome');

      await expect(() => adapter.confirm(review, 'finance', step1Invoices)).rejects.toThrowError(
        /Review only: custom inputs have no verified scenario outcome/
      );
    });

    it('marks verified presets as supported: true and permits confirmation', async () => {
      const step1Invoices = adapter.deletePayment(85, invoices, 'finance');
      const inv101 = step1Invoices.find(i => i.id === 101)!;
      const presets = getPaymentPresets(inv101);
      expect(presets.length).toBeGreaterThan(0);

      const verifiedInput = presets[0]!.values;
      const review = reviewPayment(verifiedInput, 'finance', step1Invoices);
      expect(review.supported).toBe(true);

      const updated = await adapter.confirm(review, 'finance', step1Invoices);
      const invUpdated = updated.find(i => i.id === 101)!;
      expect(invUpdated.payments.length).toBe(1);
    });
  });

  describe('6. PaymentCorrectionDrawer UI Component Verification', () => {
    const mockPayment: PaymentItem = {
      id: 85,
      invoice_id: 101,
      payment_amount: 200000,
      tds_amount: 9000,
      tds_section: '194J (2%)',
      payment_date: '2026-04-20',
      payment_mode: 'NEFT',
      remittance_number: 'UTR-ICICI-9876543210',
      notes: null,
      invoice: fixtures.invoices.find(i => i.id === 101) as unknown as Invoice,
      invoice_number: 'INV-2026-042',
      customer_name: 'Starlight Retail Private Limited',
      net_settled: 209000,
    };

    it('renders Step 1 with non-atomic sequence disclosure and balance impact preview', () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Verify header
      expect(screen.getByText('ADMINISTRATIVE CORRECTION')).toBeInTheDocument();
      expect(screen.getByText(/Correct Payment · UTR-ICICI-9876543210/)).toBeInTheDocument();

      // Verify non-atomic sequence disclosure
      expect(screen.getByText('Non-Atomic Administrative Sequence')).toBeInTheDocument();
      expect(
        screen.getByText(/This is NOT an atomic accounting reversal/)
      ).toBeInTheDocument();

      // Verify balance impact preview: re-opened balance should be ₹5,31,000
      expect(screen.getByText('Re-opened balance after deletion')).toBeInTheDocument();
      expect(screen.getAllByText('₹5,31,000.00').length).toBeGreaterThan(0);

      // Verify action buttons
      expect(screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Only (No Replacement)' })).toBeInTheDocument();
    });

    it('completes Step 1 delete and advances to Step 2 replacement form', async () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Click Confirm Deletion & Proceed to Step 2
      const step1Btn = screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' });
      fireEvent.click(step1Btn);

      // Wait for Step 2 form to appear
      await waitFor(() => {
        expect(screen.getByText(/Step 1 Complete:/)).toBeInTheDocument();
      });
      expect(screen.getByText('Replacement payment amounts')).toBeInTheDocument();
      expect(screen.getByText('Verified settlement presets')).toBeInTheDocument();

      // Select a verified preset button (e.g., Partial Cash)
      const partialPreset = screen.getByRole('button', { name: /Partial Cash/i });
      fireEvent.click(partialPreset);

      // Click Review Replacement Changes
      const reviewBtn = screen.getByRole('button', { name: 'Review Replacement Changes' });
      fireEvent.click(reviewBtn);

      // Verify Step 2 review screen
      await waitFor(() => {
        expect(screen.getByText('Balance impact after replacement')).toBeInTheDocument();
      });

      // Confirm button is enabled because verified preset was used
      const confirmReplacementBtn = screen.getByRole('button', { name: 'Confirm Replacement Payment' });
      expect(confirmReplacementBtn).toBeEnabled();

      fireEvent.click(confirmReplacementBtn);

      // Wait for success result screen
      await waitFor(() => {
        expect(screen.getByText('Administrative Correction Completed')).toBeInTheDocument();
      });

      // Click Return to workspace
      fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('supports Delete Only (No Replacement) workflow', async () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Click Delete Only (No Replacement)
      const deleteOnlyBtn = screen.getByRole('button', { name: 'Delete Only (No Replacement)' });
      fireEvent.click(deleteOnlyBtn);

      // Wait for deleted-only result screen
      await waitFor(() => {
        expect(screen.getByText('Payment #85 Deleted')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('7. Baseline Invariant Preservation & Demo Reset', () => {
    it('preserves all 6 baseline financial invariants after reset', () => {
      // Mutate by deleting payment and cancelling the invoice
      const step1 = adapter.deletePayment(85, invoices, 'finance');
      const step2 = adapter.cancelInvoice({ invoice_id: 101, reason: 'Test' }, step1, 'finance');

      const mutatedSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', step2);
      expect(mutatedSnap.cash).toBe(0);
      expect(mutatedSnap.outstanding).toBe(0);
      expect(mutatedSnap.invoiced).toBe(0);

      // Now reset to baseline via readDemoSnapshot
      const restored = readDemoSnapshot();
      const baseSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', restored.invoices);

      // Verify all 6 exact baseline invariants:
      expect(baseSnap.invoiced).toBe(531000);
      expect(baseSnap.cash).toBe(200000);
      expect(baseSnap.tds).toBe(9000);
      expect(baseSnap.settled).toBe(209000);
      expect(baseSnap.outstanding).toBe(322000);
      expect(baseSnap.unbilled).toBe(295000);

      // Verify reporting / aging date
      expect(fixtures.reporting.asOfDate).toBe('2026-04-30');
    });
  });
});
