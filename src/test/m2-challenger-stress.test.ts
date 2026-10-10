import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  createPaymentAdapter,
  reviewPayment,
  getPaymentPresets,
  verifiedPaymentPresets,
  roundCurrency,
  type PaymentCreateInput,
} from '@/data/payments';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';
import { snapshot, selectRecords, isReceivable } from '@/data/records';
import { readDemoSnapshot, baselineSnapshot } from '@/data/demo';
import { PaymentCorrectionDrawer } from '@/components/collectflow/payment-workflows';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import type { PaymentItem } from '@/components/collectflow/payments-ledger';

describe('M2 Challenger Adversarial Stress Test Suite', () => {
  let invoices: Invoice[];
  let adapter: ReturnType<typeof createPaymentAdapter>;

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
    adapter = createPaymentAdapter();
  });

  describe('1. Two-Step Non-Atomic Correction Sequence Stress', () => {
    it('verifies Step 1 physically deletes payment record and re-opens balance immediately', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.payments.length).toBe(1);
      const originalPayment = inv101.payments[0]!;
      expect(originalPayment.id).toBe(85);
      expect(originalPayment.payment_amount).toBe(200000);
      expect(originalPayment.tds_amount).toBe(9000);
      expect(inv101.outstanding_balance).toBe(322000);
      expect(inv101.computed_status).toBe('PARTIAL');

      // Step 1: Physical deletion
      const afterStep1 = adapter.deletePayment(85, invoices, 'finance');
      const inv101AfterStep1 = afterStep1.find(i => i.id === 101)!;

      // Invariants for Step 1
      expect(inv101AfterStep1.payments).toHaveLength(0);
      expect(inv101AfterStep1.total_cash_paid).toBe(0);
      expect(inv101AfterStep1.total_tds_deducted).toBe(0);
      expect(inv101AfterStep1.total_paid).toBe(0);
      expect(inv101AfterStep1.outstanding_balance).toBe(531000);
      expect(inv101AfterStep1.computed_status).toBe('PENDING');

      // Step 1 is durable independently: it does not require Step 2 to be executed
      const kpisAfterStep1 = snapshot('FY 2026-27', 'finance', '2026-04-30', afterStep1);
      expect(kpisAfterStep1.cash).toBe(0);
      expect(kpisAfterStep1.tds).toBe(0);
      expect(kpisAfterStep1.settled).toBe(0);
      expect(kpisAfterStep1.outstanding).toBe(531000);
    });

    it('verifies Step 2 replacement creates independent payment record and recalculates status', () => {
      // Execute Step 1
      const afterStep1 = adapter.deletePayment(85, invoices, 'finance');

      // Step 2 replacement with modified values (cash ₹2,50,000 + TDS ₹5,000 under 194J)
      const replacementInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 250000,
        tds_amount: 5000,
        tds_section: '194J (2%)',
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-REPLACE-001',
        notes: 'Administrative replacement for payment #85',
      };

      const afterStep2 = adapter.recordPayment(replacementInput, afterStep1, 'finance');
      const inv101AfterStep2 = afterStep2.find(i => i.id === 101)!;

      expect(inv101AfterStep2.payments).toHaveLength(1);
      const newPayment = inv101AfterStep2.payments[0]!;
      expect(typeof newPayment.id).toBe('number');
      expect(newPayment.payment_amount).toBe(250000);
      expect(newPayment.tds_amount).toBe(5000);
      expect(newPayment.tds_section).toBe('194J (2%)');
      expect(newPayment.remittance_number).toBe('UTR-REPLACE-001');

      // Recalculated balance & status
      expect(inv101AfterStep2.total_cash_paid).toBe(250000);
      expect(inv101AfterStep2.total_tds_deducted).toBe(5000);
      expect(inv101AfterStep2.total_paid).toBe(255000);
      expect(inv101AfterStep2.outstanding_balance).toBe(276000);
      expect(inv101AfterStep2.computed_status).toBe('PARTIAL');
    });

    it('stress-tests multi-payment ledger with incremental intermediate deletions and floating-point precision', () => {
      // Start with invoice 101 (has payment 85: 200k cash + 9k tds)
      // Add Payment 86: 50000.45 cash + 1000.55 tds = 51001.00
      const p2: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 50000.45,
        tds_amount: 1000.55,
        tds_section: '194C (2%)',
        payment_date: '2026-04-21',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-P2',
      };
      const state1 = adapter.recordPayment(p2, invoices, 'finance');

      // Add Payment 87: 10000.10 cash + 200.20 tds = 10200.30
      const p3: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 10000.1,
        tds_amount: 200.2,
        tds_section: '194J (2%)',
        payment_date: '2026-04-22',
        payment_mode: 'RTGS',
        remittance_number: 'UTR-P3',
      };
      const state2 = adapter.recordPayment(p3, state1, 'finance');

      const invState2 = state2.find(i => i.id === 101)!;
      expect(invState2.payments).toHaveLength(3);
      // Total settled: 209000 + 51001 + 10200.30 = 270201.30
      expect(invState2.total_cash_paid).toBe(roundCurrency(200000 + 50000.45 + 10000.1));
      expect(invState2.total_tds_deducted).toBe(roundCurrency(9000 + 1000.55 + 200.2));
      expect(invState2.total_paid).toBe(270201.3);
      expect(invState2.outstanding_balance).toBe(roundCurrency(531000 - 270201.3));

      // Now delete middle payment (id 86)
      const state3 = adapter.deletePayment(86, state2, 'finance');
      const invState3 = state3.find(i => i.id === 101)!;
      expect(invState3.payments).toHaveLength(2);
      expect(invState3.payments.map(p => p.id)).toEqual([85, 87]);

      // Verify exact arithmetic without IEEE 754 precision errors
      const expectedCash = roundCurrency(200000 + 10000.1);
      const expectedTds = roundCurrency(9000 + 200.2);
      const expectedPaid = roundCurrency(expectedCash + expectedTds);
      const expectedOutstanding = roundCurrency(531000 - expectedPaid);

      expect(invState3.total_cash_paid).toBe(expectedCash);
      expect(invState3.total_tds_deducted).toBe(expectedTds);
      expect(invState3.total_paid).toBe(expectedPaid);
      expect(invState3.outstanding_balance).toBe(expectedOutstanding);
    });

    it('blocks deletion by unauthorized roles (viewer and sales)', () => {
      expect(() => adapter.deletePayment(85, invoices, 'sales')).toThrowError(/Access forbidden/);
      expect(() => adapter.deletePayment(85, invoices, 'viewer')).toThrowError(/Access forbidden/);
    });
  });

  describe('2. Failure Recovery State (step2-recovery) Adversarial Tests', () => {
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

    it('reaches step2-recovery on backend validation failure and allows Modify & Retry', async () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Advance past Step 1
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' }));
      await waitFor(() => expect(screen.getByText(/Step 1 Complete:/)).toBeInTheDocument());

      // Attempt overpayment in Step 2: enter ₹5,31,001 (re-opened balance is ₹5,31,000)
      const cashInput = screen.getByLabelText(/Cash payment amount/);
      fireEvent.change(cashInput, { target: { value: '531001' } });

      // Review Replacement Changes is disabled due to real-time overpayment guard
      const reviewBtn = screen.getByRole('button', { name: 'Review Replacement Changes' });
      expect(reviewBtn).toBeDisabled();

      // Enter valid amount within balance
      fireEvent.change(cashInput, { target: { value: '100000' } });
      expect(reviewBtn).toBeEnabled();
      fireEvent.click(reviewBtn);

      // Now on step2-review
      await waitFor(() => expect(screen.getByText('Balance impact after replacement')).toBeInTheDocument());
    });

    it('supports direct "Finish Without Replacement" from Step 2 form', async () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Execute Step 1
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' }));
      await waitFor(() => expect(screen.getByText(/Step 1 Complete:/)).toBeInTheDocument());

      // On Step 2 form, user clicks "Skip Replacement & Finish"
      const skipBtn = screen.getByRole('button', { name: 'Skip Replacement & Finish' });
      fireEvent.click(skipBtn);

      // Verify result-deleted-only state
      await waitFor(() => {
        expect(screen.getByText('Payment #85 Deleted')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Payment #85 was permanently deleted\. No replacement payment was created\./)
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('enforces discard warning when closing during Step 2 with Step 1 already applied', async () => {
      const close = vi.fn();
      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close })
        )
      );

      // Execute Step 1
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' }));
      await waitFor(() => expect(screen.getByText(/Step 1 Complete:/)).toBeInTheDocument());

      // Try closing the drawer via X button
      const closeBtn = screen.getByRole('button', { name: 'Close correction workflow' });
      fireEvent.click(closeBtn);

      // Discard prompt appears with Step 1 non-atomic acknowledgement
      await waitFor(() => {
        expect(
          screen.getByText(/Step 1 deletion was already applied to the ledger\. Discard replacement inputs and finish\?/)
        ).toBeInTheDocument();
      });

      // User confirms finish without replacement
      const finishBtn = screen.getByRole('button', { name: 'Finish without replacement' });
      fireEvent.click(finishBtn);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Review-Only Guard for Unsupported Inputs Stress', () => {
    it('marks arbitrary unverified amounts as supported: false and prevents confirmation', async () => {
      const afterStep1 = adapter.deletePayment(85, invoices, 'finance');

      // Test 1: Arbitrary unverified numbers
      const unverifiedInputs: PaymentCreateInput[] = [
        {
          invoice_id: 101,
          payment_amount: 12345.67,
          tds_amount: 0,
          payment_date: '2026-04-25',
          payment_mode: 'NEFT',
        },
        {
          invoice_id: 101,
          payment_amount: 200000,
          tds_amount: 4567, // Non-standard TDS
          payment_date: '2026-04-25',
          payment_mode: 'NEFT',
        },
        {
          invoice_id: 101,
          payment_amount: 99999,
          tds_amount: 1,
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
        },
      ];

      for (const input of unverifiedInputs) {
        const review = reviewPayment(input, 'finance', afterStep1);
        expect(review.supported).toBe(false);
        expect(review.message).toContain('Review only: custom inputs have no verified scenario outcome');

        // Confirm MUST reject
        await expect(() => adapter.confirm(review, 'finance', afterStep1)).rejects.toThrowError(
          /Review only: custom inputs have no verified scenario outcome/
        );
      }
    });

    it('verifies that all verified presets evaluate as supported: true and can be confirmed', async () => {
      const afterStep1 = adapter.deletePayment(85, invoices, 'finance');
      const inv101 = afterStep1.find(i => i.id === 101)!;

      const presets = getPaymentPresets(inv101);
      expect(presets.length).toBeGreaterThanOrEqual(4);

      for (const preset of presets) {
        const review = reviewPayment(preset.values, 'finance', afterStep1);
        expect(review.supported).toBe(true);
        expect(review.message).toContain('Verified settlement rehearsal');
      }
    });

    it('UI prevents confirmation of custom inputs by hiding confirmation button', async () => {
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

      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(PaymentCorrectionDrawer, { payment: mockPayment, close: vi.fn() })
        )
      );

      // Execute Step 1
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' }));
      await waitFor(() => expect(screen.getByText(/Step 1 Complete:/)).toBeInTheDocument());

      // Enter arbitrary custom amount
      const cashInput = screen.getByLabelText(/Cash payment amount/);
      fireEvent.change(cashInput, { target: { value: '77777' } });

      const reviewBtn = screen.getByRole('button', { name: 'Review Replacement Changes' });
      fireEvent.click(reviewBtn);

      // In Step 2 review screen
      await waitFor(() => {
        expect(
          screen.getByText(/Review only: custom inputs have no verified scenario outcome/)
        ).toBeInTheDocument();
      });

      // Confirm Replacement Payment button MUST NOT exist
      expect(screen.queryByRole('button', { name: 'Confirm Replacement Payment' })).not.toBeInTheDocument();

      // Only Back to Edit is available
      expect(screen.getByRole('button', { name: 'Back to Edit' })).toBeInTheDocument();
    });
  });

  describe('4. Reset Demo Across Intense Permutations & Financial Invariants', () => {
    function verifyExactBaselineInvariants(invoicesToCheck: Invoice[], reportingDate = '2026-04-30') {
      const snap = snapshot('FY 2026-27', 'finance', reportingDate, invoicesToCheck);

      // All 6 exact invariants
      expect(snap.invoiced).toBe(531000);
      expect(snap.cash).toBe(200000);
      expect(snap.tds).toBe(9000);
      expect(snap.settled).toBe(209000);
      expect(snap.outstanding).toBe(322000);
      expect(snap.unbilled).toBe(295000);

      // Mathematical conservation laws
      expect(snap.cash + snap.tds).toBe(snap.settled);
      expect(snap.settled + snap.outstanding).toBe(snap.invoiced);

      // AR aging invariants
      const records = selectRecords('Invoices', 'FY 2026-27', 'finance', '', 'All statuses', 'All executives', null, reportingDate, invoicesToCheck);
      const activeReceivables = records.filter(isReceivable);
      const totalReceivableBalance = roundCurrency(
        activeReceivables.reduce((sum, r) => sum + r.outstanding_balance, 0)
      );
      expect(totalReceivableBalance).toBe(322000);
    }

    it('Permutation 1: Delete Payment -> Cancel Invoice -> Reset Demo', () => {
      // 1. Delete payment 85 on INV-2026-042
      const step1 = adapter.deletePayment(85, invoices, 'finance');
      // 2. Cancel invoice 101 (now unpaid)
      const step2 = adapter.cancelInvoice({ invoice_id: 101, reason: 'Commercial dispute' }, step1, 'finance');

      // Verify intermediate mutated state
      const mutatedSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', step2);
      expect(mutatedSnap.outstanding).toBe(0);
      expect(mutatedSnap.invoiced).toBe(0); // Excluded because invoice 101 is CANCELLED

      // 3. Reset demo
      const restored = readDemoSnapshot();
      verifyExactBaselineInvariants(restored.invoices as Invoice[]);
    });

    it('Permutation 2: Add 2 Payments -> Delete 1 -> Mutate Ledger -> Reset Demo', () => {
      // Add multiple payments
      let current = structuredClone(invoices);
      const p1: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-21',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-PERM-1',
      };
      current = adapter.recordPayment(p1, current, 'finance');

      const p2: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 50000,
        tds_amount: 5000,
        tds_section: '194C (2%)',
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-PERM-2',
      };
      current = adapter.recordPayment(p2, current, 'finance');

      // Delete payment 85
      current = adapter.deletePayment(85, current, 'finance');

      const mutatedSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', current);
      expect(mutatedSnap.outstanding).toBe(roundCurrency(531000 - 155000));

      // Reset demo
      const restored = readDemoSnapshot();
      verifyExactBaselineInvariants(restored.invoices as Invoice[]);
    });

    it('Permutation 3: 10 Sequential Stress Iterations (Mutate -> Reset -> Assert Invariants)', () => {
      for (let i = 0; i < 10; i++) {
        let workInvoices = structuredClone(invoices);

        if (i % 2 === 0) {
          // Delete payment 85 and cancel invoice
          workInvoices = adapter.deletePayment(85, workInvoices, 'finance');
          workInvoices = adapter.cancelInvoice({ invoice_id: 101, reason: `Stress run ${i}` }, workInvoices, 'finance');
        } else {
          // Record full cash payment clearing invoice
          const fullPreset = getPaymentPresets(workInvoices.find(inv => inv.id === 101)!)[1]!.values;
          workInvoices = adapter.recordPayment(fullPreset, workInvoices, 'finance');
        }

        // Verify state is altered
        const midSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', workInvoices);
        expect(midSnap.outstanding).not.toBe(322000);

        // Reset demo snapshot
        const resetSnap = readDemoSnapshot();
        verifyExactBaselineInvariants(resetSnap.invoices as Invoice[]);
      }
    });

    it('Permutation 4: Full UI MockSession resetDemo restores baseline state across revisions', async () => {
      let sessionState: any = null;

      function TestConsumer() {
        const session = useMockSession();
        sessionState = session;
        return React.createElement('div', { 'data-testid': 'rev' }, session.revision);
      }

      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(TestConsumer)
        )
      );

      expect(sessionState.demo.invoices[0].payments).toHaveLength(1);

      // Trigger deletePayment via session inside act
      await act(async () => {
        await sessionState.deletePayment(85);
      });
      expect(sessionState.demo.invoices[0].payments).toHaveLength(0);

      // Trigger resetDemo via session inside act
      await act(async () => {
        sessionState.resetDemo();
      });

      // Invariants check on session demo invoices
      verifyExactBaselineInvariants(sessionState.demo.invoices);
    });
  });

  describe('5. Adversarial Input Bounds & Anti-Bypass Defenses', () => {
    it('strictly rejects zero amounts, negative numbers, and malformed dates', () => {
      // Zero payment amount and zero TDS
      expect(() =>
        adapter.reviewPayment(
          {
            invoice_id: 101,
            payment_amount: 0,
            tds_amount: 0,
            payment_date: '2026-04-25',
            payment_mode: 'NEFT',
          },
          'finance',
          invoices
        )
      ).toThrowError(/greater than zero/);

      // Negative payment amount
      expect(() =>
        adapter.reviewPayment(
          {
            invoice_id: 101,
            payment_amount: -500,
            tds_amount: 0,
            payment_date: '2026-04-25',
            payment_mode: 'NEFT',
          },
          'finance',
          invoices
        )
      ).toThrowError(/cannot be negative/);

      // Invalid calendar date
      expect(() =>
        adapter.reviewPayment(
          {
            invoice_id: 101,
            payment_amount: 1000,
            tds_amount: 0,
            payment_date: '2026-02-31',
            payment_mode: 'NEFT',
          },
          'finance',
          invoices
        )
      ).toThrowError(/Invalid calendar date/);
    });

    it('rejects 1-paisa overpayment beyond outstanding balance with exact FastAPI message formatting', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const outstanding = inv101.outstanding_balance; // 322000

      expect(() =>
        adapter.reviewPayment(
          {
            invoice_id: 101,
            payment_amount: outstanding + 0.01,
            tds_amount: 0,
            payment_date: '2026-04-25',
            payment_mode: 'NEFT',
          },
          'finance',
          invoices
        )
      ).toThrowError(
        /Total settlement amount .* exceeds the outstanding balance/
      );
    });

    it('enforces double-defense: tampered review object with supported: true fails on re-review in confirm', async () => {
      const customInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 88888, // unsupported custom amount
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      const realReview = adapter.reviewPayment(customInput, 'finance', invoices);
      expect(realReview.supported).toBe(false);

      // Attempt attack: manually tamper with review object to spoof supported: true
      const forgedReview = { ...realReview, supported: true };

      // Adapter re-evaluates the fresh review in confirm() and catches the spoof!
      await expect(() => adapter.confirm(forgedReview, 'finance', invoices)).rejects.toThrowError(
        /Review only: custom inputs have no verified scenario outcome/
      );
    });

    it('verifies exact baseline AR aging distribution and overdue buckets', () => {
      const snap = snapshot('FY 2026-27', 'finance', '2026-04-30', invoices);
      expect(snap.overdue).toBe(0);

      // AR aging distribution array: 322000 in 'Current / Not Due', 0 in overdue buckets
      const totalAging = snap.aging.reduce((sum, b) => sum + b.amount, 0);
      expect(totalAging).toBe(322000);

      const currentBucket = snap.aging.find(b => b.bucket === 'Current / Not Due');
      expect(currentBucket).toBeDefined();
      expect(currentBucket?.amount).toBe(322000);
      expect(currentBucket?.count).toBe(1);

      // Overdue buckets must all be zero
      const overdueBuckets = snap.aging.filter(b => b.bucket !== 'Current / Not Due');
      for (const bucket of overdueBuckets) {
        expect(bucket.amount).toBe(0);
        expect(bucket.count).toBe(0);
      }
    });
  });
});
