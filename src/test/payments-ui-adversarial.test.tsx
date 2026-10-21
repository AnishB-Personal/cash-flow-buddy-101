import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  reviewPayment,
  createPaymentAdapter,
  getPaymentPresets,
  type PaymentCreateInput,
  type PaymentReview,
} from '@/data/payments';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { RecordPaymentDrawer } from '@/components/collectflow/payment-workflows';
import { RecordDrawer } from '@/components/collectflow/record-drawer';
import { RecordList } from '@/components/collectflow/record-list';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

function Harness({
  children,
  onSessionReady,
}: {
  children?: React.ReactNode;
  onSessionReady?: (session: ReturnType<typeof useMockSession>) => void;
}) {
  function SessionGrabber() {
    const session = useMockSession();
    if (onSessionReady) onSessionReady(session);
    return null;
  }
  return (
    <MockSessionProvider>
      <SessionGrabber />
      {children}
    </MockSessionProvider>
  );
}

describe('Empirical Adversarial Challenge Suite: Payments, UI & Settlements', () => {
  let invoices: Invoice[];

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
  });

  describe('Suite 1: Paid and CANCELLED Invoice Boundary Guards', () => {
    it('strictly blocks reviewPayment, recordPayment, and confirm on a CANCELLED invoice', async () => {
      const cancelledInvoices = structuredClone(invoices);
      cancelledInvoices[0]!.computed_status = 'CANCELLED' as any;
      cancelledInvoices[0]!.payment_status = 'CANCELLED' as any;

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
      };

      // 1. reviewPayment must throw
      expect(() => reviewPayment(input, 'finance', cancelledInvoices)).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );

      // 2. recordPayment must throw
      const adapter = createPaymentAdapter();
      expect(() => adapter.recordPayment(input, cancelledInvoices, 'finance')).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );

      // 3. confirm with a pre-created review against cancelled state must throw
      const staleReview: PaymentReview = {
        invoice: cancelledInvoices[0]!,
        input,
        resulting_cash_paid: 300000,
        resulting_tds_deducted: 9000,
        resulting_total_paid: 309000,
        resulting_outstanding: 222000,
        resulting_status: 'PARTIAL',
        supported: true,
        message: 'Spoofed supported',
        fingerprint: 'spoof',
        changes: [],
        impact: {
          cashDelta: 100000,
          tdsDelta: 0,
          totalSettling: 100000,
          resultingOutstanding: 222000,
          resultingStatus: 'PARTIAL',
        },
      };

      await expect(adapter.confirm(staleReview, 'finance', cancelledInvoices)).rejects.toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );
    });

    it('strictly blocks reviewPayment, recordPayment, and confirm on a fully PAID invoice', async () => {
      const adapter = createPaymentAdapter();
      const paidInvoices = adapter.recordPayment(
        {
          invoice_id: 101,
          payment_amount: 322000,
          tds_amount: 0,
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
          remittance_number: 'RTGS-FULL-SETTLE',
        },
        invoices
      );

      const target = paidInvoices.find(i => i.id === 101)!;
      expect(target.outstanding_balance).toBe(0);
      expect(target.computed_status).toBe('PAID');

      const nextInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 1000,
        tds_amount: 0,
        payment_date: '2026-04-26',
        payment_mode: 'NEFT',
      };

      expect(() => reviewPayment(nextInput, 'finance', paidInvoices)).toThrowError(
        'Invoice is already fully paid. No further payments can be recorded.'
      );

      expect(() => adapter.recordPayment(nextInput, paidInvoices, 'finance')).toThrowError(
        'Invoice is already fully paid. No further payments can be recorded.'
      );
    });

    it('RecordPaymentDrawer renders blocking alert and NO payment form for CANCELLED invoice', () => {
      const cancelledInvoice = structuredClone(invoices[0]!);
      cancelledInvoice.computed_status = 'CANCELLED' as any;
      cancelledInvoice.payment_status = 'CANCELLED' as any;

      render(
        <Harness>
          <RecordPaymentDrawer invoice={cancelledInvoice} close={() => {}} />
        </Harness>
      );

      expect(
        screen.getByText('Cannot record payments against a CANCELLED invoice.')
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Cash payment amount/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Review changes/i })).not.toBeInTheDocument();
    });

    it('RecordPaymentDrawer renders blocking alert and NO payment form for fully PAID invoice', () => {
      const paidInvoice = structuredClone(invoices[0]!);
      paidInvoice.outstanding_balance = 0;
      paidInvoice.computed_status = 'PAID' as any;
      paidInvoice.payment_status = 'PAID' as any;

      render(
        <Harness>
          <RecordPaymentDrawer invoice={paidInvoice} close={() => {}} />
        </Harness>
      );

      expect(
        screen.getByText('Invoice is already fully settled (₹0.00 outstanding balance).')
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Cash payment amount/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Review changes/i })).not.toBeInTheDocument();
    });

    it('RecordDrawer hides Record Payment action button on PAID and CANCELLED invoices', () => {
      const paidInvoice = structuredClone(invoices[0]!);
      paidInvoice.outstanding_balance = 0;
      paidInvoice.computed_status = 'PAID' as any;

      const { rerender } = render(
        <Harness>
          <RecordDrawer
            record={paidInvoice}
            kind="invoice"
            role="finance"
            close={() => {}}
            unavailable={() => {}}
            onRecordPayment={() => {}}
          />
        </Harness>
      );

      expect(screen.queryByRole('button', { name: /Record Payment/i })).not.toBeInTheDocument();

      const cancelledInvoice = structuredClone(invoices[0]!);
      cancelledInvoice.computed_status = 'CANCELLED' as any;

      rerender(
        <Harness>
          <RecordDrawer
            record={cancelledInvoice}
            kind="invoice"
            role="finance"
            close={() => {}}
            unavailable={() => {}}
            onRecordPayment={() => {}}
          />
        </Harness>
      );

      expect(screen.queryByRole('button', { name: /Record Payment/i })).not.toBeInTheDocument();
    });

    it('RecordList hides Record Payment row action for CANCELLED or zero balance invoices', () => {
      const modifiedInvoices = structuredClone(invoices);
      modifiedInvoices[0]!.outstanding_balance = 0; // paid
      modifiedInvoices[0]!.computed_status = 'PAID' as any;

      const mockRecordPayment = vi.fn();

      render(
        <Harness>
          <RecordList
            screen="Invoices"
            fy="FY 2026-27"
            role="finance"
            bucket={null}
            clearBucket={() => {}}
            open={() => {}}
            unavailable={() => {}}
            records={modifiedInvoices}
            onRecordPayment={mockRecordPayment}
          />
        </Harness>
      );

      // Open menu for invoice 101
      const menuTrigger = screen.getAllByRole('button', { name: /Actions for INV-2026-042/i })[0]!;
      fireEvent.click(menuTrigger);

      // Record Payment button must NOT exist in the open menu
      expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument();
    });
  });

  describe('Suite 2: Unsupported Arbitrary Inputs Review-Only Guard', () => {
    it('flags arbitrary custom cash input as review-only and rejects confirmation', async () => {
      const customInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 12345.67,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-CUSTOM-12345',
      };

      const review = reviewPayment(customInput, 'finance', invoices);
      expect(review.supported).toBe(false);
      expect(review.message).toContain('Review only: custom inputs have no verified scenario outcome');

      const adapter = createPaymentAdapter();
      await expect(adapter.confirm(review, 'finance', invoices)).rejects.toThrowError(
        'Review only: custom inputs have no verified scenario outcome'
      );
    });

    it('flags verified amount with unverified payment mode as review-only', async () => {
      const preset = getPaymentPresets(invoices[0]!)[0]!;
      const modifiedInput: PaymentCreateInput = {
        ...preset.values,
        payment_mode: 'CHEQUE', // preset uses NEFT
      };

      const review = reviewPayment(modifiedInput, 'finance', invoices);
      expect(review.supported).toBe(false);
      expect(review.message).toContain('Review only');
    });

    it('rejects confirmation even if review.supported flag is tampered by client (server-side re-verification)', async () => {
      const customInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 55555,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
      };

      const review = reviewPayment(customInput, 'finance', invoices);
      expect(review.supported).toBe(false);

      // Malicious client tampering: force supported = true
      const tamperedReview = { ...review, supported: true };

      const adapter = createPaymentAdapter();
      // adapter.confirm() re-calls reviewPayment under the hood
      await expect(adapter.confirm(tamperedReview, 'finance', invoices)).rejects.toThrowError(
        'Review only: custom inputs have no verified scenario outcome'
      );
    });

    it('UI blocks confirmation when custom unverified inputs are entered in RecordPaymentDrawer', async () => {
      render(
        <Harness>
          <RecordPaymentDrawer invoice={invoices[0]!} close={() => {}} />
        </Harness>
      );

      // Enter arbitrary amount: 45000
      const cashInput = screen.getByLabelText(/Cash payment amount/i);
      fireEvent.change(cashInput, { target: { value: '45000' } });

      // Click Review changes
      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      fireEvent.click(reviewBtn);

      // Drawer advances to Review step
      await screen.findByText('Planned balance changes');
      expect(
        screen.getByText(/Review only: custom inputs have no verified scenario outcome/i)
      ).toBeInTheDocument();

      // Crucial boundary check: Continue to confirmation button MUST NOT exist
      expect(
        screen.queryByRole('button', { name: /Continue to confirmation/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirm payment/i })).not.toBeInTheDocument();

      // Only "Back to form" is available
      expect(screen.getByRole('button', { name: 'Back to form' })).toBeInTheDocument();
    });
  });

  describe('Suite 3: RecordPaymentDrawer State Flow, Discard Confirmation & Focus Restoration', () => {
    it('executes clean 4-step state flow (form -> review -> confirm -> result)', async () => {
      let sessionRef: ReturnType<typeof useMockSession> | null = null;
      const closeSpy = vi.fn();

      render(
        <Harness onSessionReady={s => { sessionRef = s; }}>
          <RecordPaymentDrawer invoice={invoices[0]!} close={closeSpy} />
        </Harness>
      );

      // Step 1: Form
      const progressBar = screen.getByText('Form');
      expect(progressBar).toHaveAttribute('aria-current', 'step');

      // Select preset Full Settlement
      const fullPreset = screen.getByRole('button', { name: /Full Settlement/i });
      fireEvent.click(fullPreset);

      const reviewBtn = screen.getByRole('button', { name: /Review changes/i });
      fireEvent.click(reviewBtn);

      // Step 2: Review
      await screen.findByText('Planned balance changes');
      expect(screen.getByText('Review')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText('Financial review & impact')).toBeInTheDocument();
      expect(screen.getByText(/Verified settlement rehearsal/i)).toBeInTheDocument();

      const continueBtn = screen.getByRole('button', { name: /Continue to confirmation/i });
      fireEvent.click(continueBtn);

      // Step 3: Confirm
      await screen.findByText('Confirmed balance changes');
      expect(screen.getByText('Confirm')).toHaveAttribute('aria-current', 'step');
      expect(
        screen.getByText(/Confirm recording payment against INV-2026-042/i)
      ).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Confirm payment' });
      fireEvent.click(confirmBtn);

      // Step 4: Result
      await screen.findByText('Payment recorded successfully');
      expect(screen.getByText('Result')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(/balance updated to ₹0\.00 \(PAID\)/i)).toBeInTheDocument();

      // Session state check
      const targetInvoice = sessionRef!.demo.invoices.find(i => i.id === 101)!;
      expect(targetInvoice.outstanding_balance).toBe(0);
      expect(targetInvoice.computed_status).toBe('PAID');
      expect(targetInvoice.payments.length).toBe(2);

      // Return to workspace closes the drawer
      const returnBtn = screen.getByRole('button', { name: 'Return to workspace' });
      fireEvent.click(returnBtn);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('allows navigating Back to form from Review and Confirm without losing data', async () => {
      render(
        <Harness>
          <RecordPaymentDrawer invoice={invoices[0]!} close={() => {}} />
        </Harness>
      );

      // Modify Remittance
      const remitInput = screen.getByLabelText(/Remittance \/ UTR number/i);
      fireEvent.change(remitInput, { target: { value: 'UTR-CUSTOM-NAV' } });

      // Go to Review
      fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
      await screen.findByText('Planned balance changes');

      // Click Back to form
      fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
      expect(screen.getByLabelText(/Remittance \/ UTR number/i)).toHaveValue('UTR-CUSTOM-NAV');

      // Go to Review then Confirm
      // Need a valid supported preset to go to confirm
      fireEvent.click(screen.getByRole('button', { name: /Partial Cash/i }));
      fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
      await screen.findByText('Planned balance changes');

      fireEvent.click(screen.getByRole('button', { name: /Continue to confirmation/i }));
      await screen.findByText('Confirmed balance changes');

      // Click Back to form from Confirm
      fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
      expect(screen.getByText('Form')).toHaveAttribute('aria-current', 'step');
    });

    it('enforces discard confirmation dialog on dirty form close and respects keep editing vs discard', () => {
      const closeSpy = vi.fn();
      render(
        <Harness>
          <RecordPaymentDrawer invoice={invoices[0]!} close={closeSpy} />
        </Harness>
      );

      // Form is initially untouched: close closes immediately
      const closeBtn = screen.getByLabelText('Close payment workflow');
      fireEvent.click(closeBtn);
      expect(closeSpy).toHaveBeenCalledTimes(1);

      closeSpy.mockClear();

      // Now dirty the form
      const cashInput = screen.getByLabelText(/Cash payment amount/i);
      fireEvent.change(cashInput, { target: { value: '99000' } });

      // Click Close: should open discard warning
      fireEvent.click(closeBtn);
      expect(screen.getByText('Discard unsaved payment inputs?')).toBeInTheDocument();
      expect(closeSpy).not.toHaveBeenCalled();

      // Click Keep editing: dismisses discard prompt, drawer stays open
      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(screen.queryByText('Discard unsaved payment inputs?')).not.toBeInTheDocument();
      expect(closeSpy).not.toHaveBeenCalled();

      // Click Close and click Discard inputs
      fireEvent.click(closeBtn);
      fireEvent.click(screen.getByRole('button', { name: 'Discard inputs' }));
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('restores focus to the triggering element upon drawer closure', async () => {
      function TriggerHarness() {
        const [open, setOpen] = useState(false);
        return (
          <Harness>
            <button id="test-trigger-btn" onClick={() => setOpen(true)}>
              Open Drawer
            </button>
            {open && (
              <RecordPaymentDrawer invoice={invoices[0]!} close={() => setOpen(false)} />
            )}
          </Harness>
        );
      }

      const { useState } = await import('react');
      render(<TriggerHarness />);

      const triggerBtn = screen.getByRole('button', { name: 'Open Drawer' });
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Click trigger to open drawer
      fireEvent.click(triggerBtn);
      await screen.findByRole('dialog');

      // Close drawer (clean form)
      const closeBtn = screen.getByLabelText('Close payment workflow');
      fireEvent.click(closeBtn);

      // Verify dialog unmounted
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Radix onCloseAutoFocus triggers focus restoration
      await waitFor(() => {
        expect(document.activeElement).toBe(triggerBtn);
      });
    });
  });

  describe('Suite 4: Session Adapter Reset & Financial Baseline Invariants', () => {
    it('restores exact invoice balances and payment counts after recording full settlement', async () => {
      const sessionRef = { current: null as ReturnType<typeof useMockSession> | null };
      render(<Harness onSessionReady={s => { sessionRef.current = s; }} />);

      expect(sessionRef.current).not.toBeNull();
      const initialInv = sessionRef.current!.demo.invoices.find(i => i.id === 101)!;
      expect(initialInv.outstanding_balance).toBe(322000);
      expect(initialInv.total_cash_paid).toBe(200000);
      expect(initialInv.total_tds_deducted).toBe(9000);
      expect(initialInv.total_paid).toBe(209000);
      expect(initialInv.payments.length).toBe(1);

      // Perform full settlement
      const review = reviewPayment(
        {
          invoice_id: 101,
          payment_amount: 322000,
          tds_amount: 0,
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
          remittance_number: 'RTGS-FULL-1',
        },
        'finance',
        sessionRef.current!.demo.invoices
      );

      await sessionRef.current!.confirmPayment(review);

      // Verify mutated state
      await waitFor(() => {
        const settledInv = sessionRef.current!.demo.invoices.find(i => i.id === 101)!;
        expect(settledInv.outstanding_balance).toBe(0);
        expect(settledInv.total_cash_paid).toBe(522000);
        expect(settledInv.total_paid).toBe(531000);
        expect(settledInv.computed_status).toBe('PAID');
        expect(settledInv.payments.length).toBe(2);
      });

      // Trigger reset
      sessionRef.current!.resetDemo();

      // Verify restored exact invariants
      await waitFor(() => {
        const resetInv = sessionRef.current!.demo.invoices.find(i => i.id === 101)!;
        expect(resetInv.outstanding_balance).toBe(322000);
        expect(resetInv.total_cash_paid).toBe(200000);
        expect(resetInv.total_tds_deducted).toBe(9000);
        expect(resetInv.total_paid).toBe(209000);
        expect(resetInv.computed_status).toBe('PARTIAL');
        expect(resetInv.payments.length).toBe(1);
        expect(resetInv.payments[0]?.remittance_number).toBe('UTR-ICICI-9876543210');
      });

      // Verify that after reset, the same payment review can be confirmed again without "already consumed" error
      const freshReview = reviewPayment(
        {
          invoice_id: 101,
          payment_amount: 322000,
          tds_amount: 0,
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
          remittance_number: 'RTGS-FULL-1',
        },
        'finance',
        sessionRef.current!.demo.invoices
      );
      await waitFor(async () => {
        await expect(sessionRef.current!.confirmPayment(freshReview)).resolves.not.toThrow();
      });
    });

    it('restores baseline payment count and totals after administrative payment deletion', async () => {
      const sessionRef = { current: null as ReturnType<typeof useMockSession> | null };
      render(<Harness onSessionReady={s => { sessionRef.current = s; }} />);

      // Delete payment 85
      await sessionRef.current!.deletePayment(85);

      await waitFor(() => {
        const modifiedInv = sessionRef.current!.demo.invoices.find(i => i.id === 101)!;
        expect(modifiedInv.payments.length).toBe(0);
        expect(modifiedInv.total_cash_paid).toBe(0);
        expect(modifiedInv.outstanding_balance).toBe(531000);
        expect(modifiedInv.computed_status).toBe('PENDING');
      });

      // Reset
      sessionRef.current!.resetDemo();

      await waitFor(() => {
        const restoredInv = sessionRef.current!.demo.invoices.find(i => i.id === 101)!;
        expect(restoredInv.payments.length).toBe(1);
        expect(restoredInv.total_cash_paid).toBe(200000);
        expect(restoredInv.total_tds_deducted).toBe(9000);
        expect(restoredInv.total_paid).toBe(209000);
        expect(restoredInv.outstanding_balance).toBe(322000);
        expect(restoredInv.computed_status).toBe('PARTIAL');
      });
    });

    it('restores unpaid order status and balance after invoice cancellation', async () => {
      const sessionRef = { current: null as ReturnType<typeof useMockSession> | null };
      render(<Harness onSessionReady={s => { sessionRef.current = s; }} />);

      // Cancel unpaid order 102
      await sessionRef.current!.cancelInvoice({
        invoice_id: 102,
        reason: 'Client requested cancellation',
      });

      await waitFor(() => {
        const cancelledOrder = sessionRef.current!.demo.invoices.find(i => i.id === 102)!;
        expect(cancelledOrder.computed_status).toBe('CANCELLED');
        expect(cancelledOrder.outstanding_balance).toBe(0);
      });

      // Reset
      sessionRef.current!.resetDemo();

      await waitFor(() => {
        const restoredOrder = sessionRef.current!.demo.invoices.find(i => i.id === 102)!;
        expect(restoredOrder.computed_status).toBe('UNBILLED');
        expect(restoredOrder.outstanding_balance).toBe(295000);
        expect(restoredOrder.remarks).not.toContain('[CANCELLED');
      });
    });

    it('verifies exact financial baseline KPI invariants across the demo snapshot', () => {
      const sessionRef = { current: null as ReturnType<typeof useMockSession> | null };
      render(<Harness onSessionReady={s => { sessionRef.current = s; }} />);

      const kpis = sessionRef.current!.demo.dashboard_summary.kpis;
      expect(kpis.total_invoiced).toBe(531000);
      expect(kpis.total_cash_collected).toBe(200000);
      expect(kpis.total_tds_recognized).toBe(9000);
      expect(kpis.total_settled).toBe(209000);
      expect(kpis.total_outstanding).toBe(322000);

      const unbilled = sessionRef.current!.demo.invoices
        .filter(i => i.computed_status === 'UNBILLED')
        .reduce((sum, i) => sum + i.total_amount, 0);
      expect(unbilled).toBe(295000);

      expect(sessionRef.current!.demo.reporting.asOfDate).toBe('2026-04-30');
    });
  });
});
