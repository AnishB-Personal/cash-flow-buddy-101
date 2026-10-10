import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  createPaymentAdapter,
  invoiceCancelSchema,
  reviewPayment,
  type InvoiceCancelInput,
  type PaymentCreateInput,
} from '@/data/payments';
import { snapshot, selectRecords } from '@/data/records';
import { classifyAging, summarizeAging, receivableRecord, type AgingRecord } from '@/data/reporting';
import { reviewOrder } from '@/data/orders';
import { readReferences } from '@/data/references';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';
import { CancelInvoiceDrawer, CANCELLATION_REASON_PRESETS } from '@/components/collectflow/cancel-workflow';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';

describe('Adversarial Stress Test: Invoice Cancellation & Financial Integrity (Milestone 2)', () => {
  let invoices: Invoice[];
  let adapter: ReturnType<typeof createPaymentAdapter>;

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
    adapter = createPaymentAdapter();
  });

  // =========================================================================
  // 1. PAYMENT CANCELLATION GUARD & FASTAPI HTTP 400 MESSAGE PARITY
  // =========================================================================
  describe('1. Payment Cancellation Guard & HTTP 400 Message Parity', () => {
    const EXPECTED_PAYMENT_ERROR =
      'Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.';

    it('strictly blocks cancellation of INV-2026-042 (id 101) with existing partial payment', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.invoice_number).toBe('INV-2026-042');
      expect(inv101.payments.length).toBe(1);

      expect(() =>
        adapter.cancelInvoice(
          { invoice_id: 101, reason: 'Commercial dispute regarding scope' },
          invoices,
          'finance'
        )
      ).toThrowError(EXPECTED_PAYMENT_ERROR);
    });

    it('strictly blocks cancellation of an invoice with a TDS-only payment', () => {
      // Create test invoice with only TDS deduction (0 cash)
      const tdsOnlyInvoice = structuredClone(invoices[0] as Invoice);
      tdsOnlyInvoice.id = 901;
      tdsOnlyInvoice.invoice_number = 'INV-2026-TDS';
      tdsOnlyInvoice.total_cash_paid = 0;
      tdsOnlyInvoice.total_tds_deducted = 5000;
      tdsOnlyInvoice.total_paid = 5000;
      tdsOnlyInvoice.outstanding_balance = (invoices[0] as Invoice).total_amount - 5000;
      tdsOnlyInvoice.payments = [
        {
          id: 801,
          invoice_id: 901,
          payment_amount: 0,
          tds_amount: 5000,
          tds_section: '194J (2%)',
          payment_date: '2026-04-20',
          payment_mode: 'OTHER',
          remittance_number: 'TDS-CERT-TEST',
        },
      ];

      const testList = [...invoices, tdsOnlyInvoice];
      expect(() =>
        adapter.cancelInvoice(
          { invoice_id: 901, reason: 'Attempt cancel on TDS settled invoice' },
          testList,
          'finance'
        )
      ).toThrowError(EXPECTED_PAYMENT_ERROR);
    });

    it('strictly blocks cancellation of a fully paid invoice with recorded payments', () => {
      // Invoice with 0 balance remaining but existing payment records
      const fullyPaidInvoice = structuredClone(invoices[0] as Invoice);
      fullyPaidInvoice.id = 902;
      fullyPaidInvoice.invoice_number = 'INV-2026-PAID';
      fullyPaidInvoice.outstanding_balance = 0;
      fullyPaidInvoice.total_cash_paid = (invoices[0] as Invoice).total_amount;
      fullyPaidInvoice.total_paid = (invoices[0] as Invoice).total_amount;
      fullyPaidInvoice.computed_status = 'PAID';
      fullyPaidInvoice.payment_status = 'PAID';
      fullyPaidInvoice.payments = [
        {
          id: 802,
          invoice_id: 902,
          payment_amount: (invoices[0] as Invoice).total_amount,
          tds_amount: 0,
          tds_section: '',
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
          remittance_number: 'RTGS-FULL-PAID',
        },
      ];

      const testList = [...invoices, fullyPaidInvoice];
      expect(() =>
        adapter.cancelInvoice(
          { invoice_id: 902, reason: 'Attempt cancel fully paid invoice' },
          testList,
          'finance'
        )
      ).toThrowError(EXPECTED_PAYMENT_ERROR);
    });

    it('strictly blocks cancellation when multiple payments exist on invoice', () => {
      const multiPayInvoice = structuredClone(invoices[0] as Invoice);
      multiPayInvoice.id = 903;
      multiPayInvoice.payments = [
        {
          id: 803,
          invoice_id: 903,
          payment_amount: 50000,
          tds_amount: 0,
          tds_section: '',
          payment_date: '2026-04-18',
          payment_mode: 'NEFT',
          remittance_number: 'REM-1',
        },
        {
          id: 804,
          invoice_id: 903,
          payment_amount: 50000,
          tds_amount: 1000,
          tds_section: '194C (2%)',
          payment_date: '2026-04-22',
          payment_mode: 'UPI',
          remittance_number: 'REM-2',
        },
      ];

      const testList = [...invoices, multiPayInvoice];
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 903, reason: 'Cancel multi-payment' }, testList, 'finance')
      ).toThrowError(EXPECTED_PAYMENT_ERROR);
    });

    it('ensures zero state mutation occurs when payment guard triggers', () => {
      const originalInv101 = structuredClone(invoices.find(i => i.id === 101)!);
      try {
        adapter.cancelInvoice({ invoice_id: 101, reason: 'Malicious cancel' }, invoices, 'finance');
      } catch (e) {
        expect((e as Error).message).toBe(EXPECTED_PAYMENT_ERROR);
      }

      const postInv101 = invoices.find(i => i.id === 101)!;
      expect(postInv101.computed_status).toBe(originalInv101.computed_status);
      expect(postInv101.payment_status).toBe(originalInv101.payment_status);
      expect(postInv101.outstanding_balance).toBe(originalInv101.outstanding_balance);
      expect(postInv101.total_paid).toBe(originalInv101.total_paid);
      expect(postInv101.remarks).toBe(originalInv101.remarks);
      expect(postInv101.payments.length).toBe(originalInv101.payments.length);
    });

    it('renders blocking banner with exact FastAPI detail message in CancelInvoiceDrawer', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const close = vi.fn();

      render(
        <MockSessionProvider>
          <CancelInvoiceDrawer invoice={inv101} close={close} />
        </MockSessionProvider>
      );

      // Verbatim HTTP 400 error text must be visible
      expect(
        screen.getByText(EXPECTED_PAYMENT_ERROR)
      ).toBeInTheDocument();

      // Blocking alert title
      expect(screen.getByText('Cancellation Blocked: Active Payments Recorded')).toBeInTheDocument();

      // Next steps guidance
      expect(screen.getByText(/Payments Ledger/)).toBeInTheDocument();

      // Review cancellation or submission button must NOT exist
      expect(screen.queryByRole('button', { name: /review cancellation/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /confirm cancellation/i })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. UNPAID INVOICE (INV-2026-041) CANCELLATION, BALANCE ZEROING & AR AGING
  // =========================================================================
  describe('2. Unpaid Invoice (INV-2026-041) Lifecycle, Balance Zeroing & AR Exclusion', () => {
    let unpaidInvoice41: Invoice;

    beforeEach(() => {
      // Build authentic unpaid commercial invoice INV-2026-041
      unpaidInvoice41 = {
        id: 102,
        fy_code: 'FY 2026-27',
        order_type: 'PO',
        po_number: 'PO-NEXUS-881',
        po_date: '2026-04-14',
        customer_id: 2,
        executive_id: 4,
        customer_name: 'Nexus Dynamics LLP',
        customer_gstin: '27BBBBB1111B2Z6',
        customer_address: 'Bandra-Kurla Complex, Mumbai',
        customer_state: 'Maharashtra',
        currency: 'INR',
        exchange_rate: 1.0,
        original_amount: 250000.0,
        exclusive_amount: 250000.0,
        tax_rate: 0.18,
        tax_amount: 45000.0,
        total_amount: 295000.0,
        invoice_number: 'INV-2026-041',
        invoice_date: '2026-04-15',
        due_date: '2026-05-15',
        remarks: 'Direct billing for cloud infrastructure',
        payment_status: 'PENDING',
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 295000.0,
        computed_status: 'PENDING',
        executive_name: 'Kavya Nair',
        line_items: [
          {
            id: 202,
            invoice_id: 102,
            description: 'Cloud Infrastructure Implementation',
            quantity: 1.0,
            unit_price: 250000.0,
            tax_rate: 0.18,
            tax_amount: 45000.0,
            total_amount: 295000.0,
          },
        ],
        payments: [],
      };
    });

    it('cancels unpaid invoice INV-2026-041 and enforces financial state transitions', () => {
      const dataset = [invoices[0]!, unpaidInvoice41];
      const cancellationReason = 'Customer rescinded commercial agreement prior to delivery';

      const after = adapter.cancelInvoice(
        { invoice_id: 102, reason: cancellationReason },
        dataset,
        'finance'
      );

      const cancelled = after.find(i => i.id === 102)!;
      // Invariant: status set to CANCELLED
      expect(cancelled.computed_status).toBe('CANCELLED');
      expect(cancelled.payment_status).toBe('CANCELLED');
      // Invariant: balance zeroed
      expect(cancelled.outstanding_balance).toBe(0.0);
      // Invariant: original total amount retained for historical accounting
      expect(cancelled.total_amount).toBe(295000.0);
      // Invariant: remarks appended with [CANCELLED: {reason}]
      expect(cancelled.remarks).toContain(`[CANCELLED: ${cancellationReason}]`);
    });

    it('drops cancelled INV-2026-041 from AR aging calculations and buckets', () => {
      const asOfDate = '2026-04-30';

      // Before cancellation: receivableRecord is true, aging bucket is assigned
      expect(receivableRecord(unpaidInvoice41 as unknown as AgingRecord)).toBe(true);
      const agingBefore = classifyAging(unpaidInvoice41 as unknown as AgingRecord, asOfDate);
      expect(agingBefore.bucket).toBe('Current / Not Due');

      // Cancel the invoice
      const dataset = [invoices[0]!, unpaidInvoice41];
      const after = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Duplicate invoice' },
        dataset,
        'finance'
      );
      const cancelled = after.find(i => i.id === 102)!;

      // After cancellation: receivableRecord MUST be false
      expect(receivableRecord(cancelled as unknown as AgingRecord)).toBe(false);

      // classifyAging MUST yield undefined bucket and 0 overdue
      const agingAfter = classifyAging(cancelled as unknown as AgingRecord, asOfDate);
      expect(agingAfter.bucket).toBeUndefined();
      expect(agingAfter.daysOverdue).toBe(0);
      expect(agingAfter.overdue).toBe(false);

      // summarizeAging MUST NOT include the cancelled invoice amount
      const summary = summarizeAging(after as unknown as AgingRecord[], asOfDate);
      const totalInAging = summary.reduce((acc, b) => acc + b.amount, 0);
      // Only invoice 101's outstanding balance (322,000) should be in aging
      expect(totalInAging).toBe(322000.0);
    });

    it('drops cancelled invoice from snapshot active receivables and invoiced count', () => {
      const dataset = [invoices[0]!, unpaidInvoice41];

      // Prior to cancellation: invoiced is 531k + 295k = 826k, outstanding is 322k + 295k = 617k
      const beforeSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', dataset);
      expect(beforeSnap.invoiced).toBe(826000.0);
      expect(beforeSnap.outstanding).toBe(617000.0);
      expect(beforeSnap.count).toBe(2);

      // Cancel invoice 102
      const afterList = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Scope reduction' },
        dataset,
        'finance'
      );

      const afterSnap = snapshot('FY 2026-27', 'finance', '2026-04-30', afterList);
      // Post cancellation: cancelled invoice excluded from active invoiced and outstanding
      expect(afterSnap.invoiced).toBe(531000.0);
      expect(afterSnap.outstanding).toBe(322000.0);
      expect(afterSnap.count).toBe(1);
    });

    it('filters out cancelled invoice from AR Aging screen view in selectRecords', () => {
      const dataset = [invoices[0]!, unpaidInvoice41];
      const afterList = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Contract rescinded' },
        dataset,
        'finance'
      );

      // AR Aging screen query MUST exclude cancelled records
      const agingRows = selectRecords('AR Aging', 'FY 2026-27', 'finance', '', 'All statuses', 'All executives', null, '2026-04-30', afterList);
      expect(agingRows.some(r => r.id === 102)).toBe(false);

      // Invoices screen query MUST include cancelled records with status filter
      const invoiceRows = selectRecords('Invoices', 'FY 2026-27', 'finance', '', 'All statuses', 'All executives', null, '2026-04-30', afterList);
      const cancelledInList = invoiceRows.find(r => r.id === 102);
      expect(cancelledInList).toBeDefined();
      expect(cancelledInList?.computed_status).toBe('CANCELLED');
    });

    it('executes full 4-step UI cancellation workflow on unpaid invoice with live diff', async () => {
      const close = vi.fn();

      render(
        <MockSessionProvider>
          <CancelInvoiceDrawer invoice={unpaidInvoice41} close={close} />
        </MockSessionProvider>
      );

      // Step 1: Form
      expect(screen.getByText('INVOICE CANCELLATION')).toBeInTheDocument();
      expect(screen.getByText(/Cancel Invoice · INV-2026-041/)).toBeInTheDocument();

      const textarea = screen.getByLabelText(/Audit reason \(required\)/i);
      fireEvent.change(textarea, {
        target: { value: 'Client rescinded contract / project scope cancelled' },
      });

      const reviewBtn = screen.getByRole('button', { name: /Review cancellation/i });
      fireEvent.click(reviewBtn);

      // Step 2: Review (Verify planned diff)
      expect(screen.getByText('Planned lifecycle changes')).toBeInTheDocument();
      expect(screen.getByText('CANCELLED')).toBeInTheDocument();
      expect(screen.getByText('₹0.00')).toBeInTheDocument();
      expect(screen.getByText('Excluded')).toBeInTheDocument();

      const continueBtn = screen.getByRole('button', { name: /Continue to confirmation/i });
      fireEvent.click(continueBtn);

      // Step 3: Confirm
      expect(screen.getByText('Confirmed lifecycle changes')).toBeInTheDocument();
      expect(screen.getByText(/Irreversible Action:/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /Confirm Cancellation/i });
      fireEvent.click(confirmBtn);

      // Step 4: Result
      await waitFor(() => {
        expect(screen.getByText('Invoice Successfully Cancelled')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Return to workspace/i }));
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. REASON VALIDATION BOUNDARIES (EMPTY, WHITESPACE, 500 CHARS, PRESETS)
  // =========================================================================
  describe('3. Reason Validation Boundaries & Adversarial Inputs', () => {
    it('rejects empty string reason ""', () => {
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: '' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toMatch(/mandatory/i);
      }
    });

    it('rejects whitespace-only strings (spaces, tabs, newlines)', () => {
      const whitespaceInputs = ['   ', '\t\t', '\n\n', '  \t  \n  \r  '];
      for (const input of whitespaceInputs) {
        const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: input });
        expect(res.success, `Expected failure for whitespace: ${JSON.stringify(input)}`).toBe(false);
      }
    });

    it('accepts minimum boundary: exactly 1 character reason', () => {
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: 'X' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBe('X');
      }
    });

    it('accepts maximum boundary: exactly 500 characters reason', () => {
      const exactly500 = 'R'.repeat(500);
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: exactly500 });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason.length).toBe(500);
      }
    });

    it('strictly rejects over-boundary: 501 characters reason', () => {
      const over500 = 'R'.repeat(501);
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: over500 });
      expect(res.success).toBe(false);
    });

    it('trims leading and trailing whitespace while preserving internal formatting', () => {
      const raw = '   Commercial dispute regarding Q1 deliverables   ';
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: raw });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason).toBe('Commercial dispute regarding Q1 deliverables');
      }
    });

    it('handles 500 characters with exterior padding by trimming to valid 500 characters', () => {
      const padded500 = '   ' + 'M'.repeat(500) + '   ';
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: padded500 });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.reason.length).toBe(500);
      }
    });

    it('strictly rejects padded string if trimmed content exceeds 500 characters', () => {
      const padded501 = '   ' + 'M'.repeat(501) + '   ';
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: padded501 });
      expect(res.success).toBe(false);
    });

    it('validates all verified preset reasons in CANCELLATION_REASON_PRESETS', () => {
      expect(CANCELLATION_REASON_PRESETS.length).toBe(4);
      for (const preset of CANCELLATION_REASON_PRESETS) {
        const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: preset });
        expect(res.success, `Preset failed validation: ${preset}`).toBe(true);
      }
    });

    it('rejects invalid invoice_id types and boundaries in invoiceCancelSchema', () => {
      expect(invoiceCancelSchema.safeParse({ invoice_id: 0, reason: 'Valid' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: -1, reason: 'Valid' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: 1.5, reason: 'Valid' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: NaN, reason: 'Valid' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: null as any, reason: 'Valid' }).success).toBe(false);
    });

    it('UI disables review button when reason is empty or whitespace-only', () => {
      const unpaidDoc = fixtures.invoices.find(i => i.id === 102) as unknown as Invoice;
      const close = vi.fn();

      render(
        <MockSessionProvider>
          <CancelInvoiceDrawer invoice={unpaidDoc} close={close} />
        </MockSessionProvider>
      );

      const reviewBtn = screen.getByRole('button', { name: /Review cancellation/i });
      expect(reviewBtn).toBeDisabled();

      const textarea = screen.getByLabelText(/Audit reason \(required\)/i);
      fireEvent.change(textarea, { target: { value: '    ' } });
      expect(reviewBtn).toBeDisabled();

      fireEvent.change(textarea, { target: { value: 'Valid reason' } });
      expect(reviewBtn).not.toBeDisabled();
    });
  });

  // =========================================================================
  // 4. RE-CANCELLATION GUARDS & COMMERCIAL INVOICE DELETION LOCK
  // =========================================================================
  describe('4. Re-Cancellation Guards & Commercial Invoice Deletion Lock', () => {
    it('strictly blocks duplicate cancellation with "Invoice is already cancelled"', () => {
      // First cancellation
      const cancelledList = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'First cancellation' },
        invoices,
        'finance'
      );
      const cancelledDoc = cancelledList.find(i => i.id === 102)!;
      expect(cancelledDoc.computed_status).toBe('CANCELLED');

      // Second cancellation attempt
      expect(() =>
        adapter.cancelInvoice(
          { invoice_id: 102, reason: 'Second cancellation attempt' },
          cancelledList,
          'finance'
        )
      ).toThrowError('Invoice is already cancelled');
    });

    it('UI blocks workflow when invoice is already cancelled', () => {
      const cancelledInvoice: Invoice = {
        ...invoices[1]!,
        computed_status: 'CANCELLED',
        payment_status: 'CANCELLED',
      };
      const close = vi.fn();

      render(
        <MockSessionProvider>
          <CancelInvoiceDrawer invoice={cancelledInvoice} close={close} />
        </MockSessionProvider>
      );

      expect(screen.getByText('Invoice is already cancelled.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Review cancellation/i })).not.toBeInTheDocument();
    });

    it('strictly blocks recording payment against a CANCELLED invoice', () => {
      const cancelledList = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Cancelled scope' },
        invoices,
        'finance'
      );

      const paymentInput: PaymentCreateInput = {
        invoice_id: 102,
        payment_amount: 50000,
        tds_amount: 0,
        payment_date: '2026-04-20',
        payment_mode: 'NEFT',
      };

      // Review payment check
      expect(() => reviewPayment(paymentInput, 'finance', cancelledList)).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );

      // Record payment check
      expect(() => adapter.recordPayment(paymentInput, cancelledList, 'finance')).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );
    });

    it('commercial invoice deletion lock: blocks deletion of issued commercial invoice INV-2026-042', () => {
      const refs = readReferences();
      // reviewOrder('order-delete') for record 101 which has invoice_number 'INV-2026-042'
      expect(() =>
        reviewOrder('order-delete', '101', {}, 'admin', invoices, refs, 'FY 2026-27')
      ).toThrowError(
        'Issued commercial invoices cannot be permanently deleted. Use the cancellation workflow (POST /api/invoices/{id}/cancel) instead.'
      );
    });

    it('commercial invoice deletion lock: blocks deletion of any converted invoice (e.g. INV-2026-041)', () => {
      const refs = readReferences();
      const withInvoice41: Invoice[] = structuredClone(invoices);
      withInvoice41[1]!.invoice_number = 'INV-2026-041';

      expect(() =>
        reviewOrder('order-delete', '102', {}, 'admin', withInvoice41, refs, 'FY 2026-27')
      ).toThrowError(
        'Issued commercial invoices cannot be permanently deleted. Use the cancellation workflow (POST /api/invoices/{id}/cancel) instead.'
      );
    });

    it('blocks deletion of an order if payment records exist even if unbilled', () => {
      const refs = readReferences();
      const orderWithPayment: Invoice[] = structuredClone(invoices);
      orderWithPayment[1]!.invoice_number = null; // Unbilled PO
      orderWithPayment[1]!.payments = [
        {
          id: 999,
          invoice_id: 102,
          payment_amount: 25000,
          tds_amount: 0,
          tds_section: '',
          payment_date: '2026-04-15',
          payment_mode: 'NEFT',
          remittance_number: 'ADVANCE-PAY',
        },
      ];

      expect(() =>
        reviewOrder('order-delete', '102', {}, 'admin', orderWithPayment, refs, 'FY 2026-27')
      ).toThrowError(
        'Cannot delete invoice with existing payment records. Reversal/credit note required to preserve financial audit history.'
      );
    });

    it('allows deletion of clean unbilled PO (Order 102) by authorized role', () => {
      const refs = readReferences();
      // Clean unbilled PO 102 with no invoice_number and no payments
      const order102 = invoices.find(i => i.id === 102)!;
      expect(order102.invoice_number).toBeNull();
      expect(order102.payments.length).toBe(0);

      const result = reviewOrder('order-delete', '102', {}, 'admin', invoices, refs, 'FY 2026-27');
      expect(result.supported).toBe(true);
      expect(result.message).toContain('Verified order deletion rehearsal');
      expect(result.after?.some(i => i.id === 102)).toBe(false);
    });

    it('enforces RBAC permissions on commercial invoice cancellation and order deletion', () => {
      const refs = readReferences();
      // Sales and viewer cannot cancel invoice
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 102, reason: 'Sales try' }, invoices, 'sales')
      ).toThrowError("Access forbidden: role 'sales' lacks required permissions (admin, finance)");

      expect(() =>
        adapter.cancelInvoice({ invoice_id: 102, reason: 'Viewer try' }, invoices, 'viewer')
      ).toThrowError("Access forbidden: role 'viewer' lacks required permissions (admin, finance)");

      // Sales and viewer cannot delete order
      expect(() =>
        reviewOrder('order-delete', '102', {}, 'sales', invoices, refs, 'FY 2026-27')
      ).toThrowError('This role cannot perform this action.');

      expect(() =>
        reviewOrder('order-delete', '102', {}, 'viewer', invoices, refs, 'FY 2026-27')
      ).toThrowError('This role cannot perform this action.');
    });
  });

  // =========================================================================
  // 5. BASELINE INVARIANT PRESERVATION & SESSION CONTEXT GUARDS
  // =========================================================================
  describe('5. Baseline Invariant Preservation & Session Context Guards', () => {
    it('restores all 6 financial baseline invariants deterministically upon resetDemo', async () => {
      let sessionContext!: ReturnType<typeof useMockSession>;

      function Harness() {
        sessionContext = useMockSession();
        return null;
      }

      render(
        <MockSessionProvider>
          <Harness />
        </MockSessionProvider>
      );

      // Verify baseline snapshot
      const baseline = snapshot('FY 2026-27', sessionContext.role, '2026-04-30', sessionContext.demo.invoices);
      expect(baseline.invoiced).toBe(531000);
      expect(baseline.cash).toBe(200000);
      expect(baseline.tds).toBe(9000);
      expect(baseline.settled).toBe(209000);
      expect(baseline.outstanding).toBe(322000);
      expect(baseline.unbilled).toBe(295000);

      // Mutate state: delete payment on 101, then cancel 101, then cancel 102
      await act(async () => {
        await sessionContext.deletePayment(85);
      });
      await act(async () => {
        await sessionContext.cancelInvoice({ invoice_id: 101, reason: 'Temporary cancel in demo' });
      });
      await act(async () => {
        await sessionContext.cancelInvoice({ invoice_id: 102, reason: 'Temporary order cancel' });
      });

      // Invariants are perturbed
      const perturbed = snapshot('FY 2026-27', sessionContext.role, '2026-04-30', sessionContext.demo.invoices);
      expect(perturbed.invoiced).toBe(0);
      expect(perturbed.outstanding).toBe(0);

      // Reset demo
      await act(async () => {
        sessionContext.resetDemo();
      });

      // Invariants must be strictly restored
      const restored = snapshot('FY 2026-27', sessionContext.role, '2026-04-30', sessionContext.demo.invoices);
      expect(restored.invoiced).toBe(531000);
      expect(restored.cash).toBe(200000);
      expect(restored.tds).toBe(9000);
      expect(restored.settled).toBe(209000);
      expect(restored.outstanding).toBe(322000);
      expect(restored.unbilled).toBe(295000);
    });

    it('session cancelInvoice rejects execution if role is sales or viewer', async () => {
      let sessionContext!: ReturnType<typeof useMockSession>;

      function Harness() {
        sessionContext = useMockSession();
        return null;
      }

      render(
        <MockSessionProvider>
          <Harness />
        </MockSessionProvider>
      );

      await act(async () => {
        sessionContext.setRole('viewer');
      });

      await expect(
        sessionContext.cancelInvoice({ invoice_id: 102, reason: 'Unauthorized cancel' })
      ).rejects.toThrowError(/Access forbidden/);
    });
  });
});

