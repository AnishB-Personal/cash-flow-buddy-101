import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  createPaymentAdapter,
  invoiceCancelSchema,
  type InvoiceCancelInput,
  type PaymentCreateInput,
} from '@/data/payments';
import { snapshot } from '@/data/records';
import { classifyAging, summarizeAging, receivableRecord } from '@/data/reporting';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';
import { CancelInvoiceDrawer } from '@/components/collectflow/cancel-workflow';
import { MockSessionProvider } from '@/components/collectflow/session';

describe('Invoice Cancellation & Financial Integrity Barrier (cancellation.test.ts)', () => {
  let invoices: Invoice[];
  let adapter: ReturnType<typeof createPaymentAdapter>;

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
    adapter = createPaymentAdapter();
  });

  describe('1. Input & Reason Validation (invoiceCancelSchema)', () => {
    it('validates a valid cancellation payload', () => {
      const parsed = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: 'Duplicate order' });
      expect(parsed.success).toBe(true);
    });

    it('rejects empty or whitespace-only reason string', () => {
      const empty = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: '' });
      expect(empty.success).toBe(false);
      const whitespace = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: '   ' });
      expect(whitespace.success).toBe(false);
    });

    it('rejects reason exceeding 500 characters', () => {
      const longReason = 'A'.repeat(501);
      const res = invoiceCancelSchema.safeParse({ invoice_id: 102, reason: longReason });
      expect(res.success).toBe(false);
    });

    it('rejects invalid or non-positive invoice_id', () => {
      expect(invoiceCancelSchema.safeParse({ invoice_id: 0, reason: 'Test' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: -5, reason: 'Test' }).success).toBe(false);
    });
  });

  describe('2. Payment Cancellation Guard (FastAPI Barrier Parity)', () => {
    it('strictly blocks cancellation of INV-2026-042 while recorded payment exists', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.payments.length).toBeGreaterThan(0);

      expect(() =>
        adapter.cancelInvoice({ invoice_id: 101, reason: 'Customer dispute' }, invoices, 'finance')
      ).toThrowError(
        'Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.'
      );
    });

    it('does not mutate invoice when cancellation is rejected', () => {
      try {
        adapter.cancelInvoice({ invoice_id: 101, reason: 'Customer dispute' }, invoices, 'finance');
      } catch {}
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.computed_status).toBe('PARTIAL');
      expect(inv101.outstanding_balance).toBe(322000);
      expect(inv101.remarks).not.toContain('[CANCELLED');
    });
  });

  describe('3. Unpaid Invoice & Order Cancellation Lifecycle', () => {
    it('successfully cancels unpaid document (Order 102)', () => {
      const updated = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Project cancelled by customer' },
        invoices,
        'finance'
      );
      const doc = updated.find(i => i.id === 102)!;
      expect(doc.computed_status).toBe('CANCELLED');
      expect(doc.payment_status).toBe('CANCELLED');
      expect(doc.outstanding_balance).toBe(0.0);
      expect(doc.remarks).toContain('[CANCELLED: Project cancelled by customer]');
    });

    it('rejects duplicate cancellation of already cancelled document', () => {
      const once = adapter.cancelInvoice({ invoice_id: 102, reason: 'First' }, invoices, 'finance');
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 102, reason: 'Second' }, once, 'finance')
      ).toThrowError('Invoice is already cancelled');
    });

    it('throws 404 equivalent when invoice id is not found', () => {
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 9999, reason: 'Missing' }, invoices, 'finance')
      ).toThrowError('Invoice not found');
    });
  });

  describe('4. Aging & Financial KPI Exclusion', () => {
    it('excludes CANCELLED invoices from receivableRecord and classifyAging', () => {
      const updated = adapter.cancelInvoice({ invoice_id: 102, reason: 'Test' }, invoices, 'finance');
      const doc = updated.find(i => i.id === 102)!;
      expect(receivableRecord(doc as any)).toBe(false);

      const aging = classifyAging(doc as any, '2026-04-30');
      expect(aging.overdue).toBe(false);
      expect(aging.daysOverdue).toBe(0);
      expect(aging.bucket).toBeUndefined();
    });

    it('excludes cancelled invoices from snapshot invoiced and outstanding calculations', () => {
      // Convert order 102 to an issued invoice with 0 payments
      const testInvoices = structuredClone(invoices);
      testInvoices[1]!.invoice_number = 'INV-2026-041';
      testInvoices[1]!.computed_status = 'PENDING';
      testInvoices[1]!.due_date = '2026-05-14';

      const before = snapshot('FY 2026-27', 'finance', '2026-04-30', testInvoices);
      expect(before.invoiced).toBe(531000 + 295000);

      const cancelled = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Void invoice' },
        testInvoices,
        'finance'
      );
      const after = snapshot('FY 2026-27', 'finance', '2026-04-30', cancelled);

      expect(after.invoiced).toBe(531000);
      expect(after.outstanding).toBe(322000);
    });

    it('blocks subsequent payments on a cancelled invoice', () => {
      // Delete payment 85 on 101, then cancel 101
      const withoutPayment = adapter.deletePayment(85, invoices, 'finance');
      const cancelled = adapter.cancelInvoice(
        { invoice_id: 101, reason: 'Cancelled after payment reversed' },
        withoutPayment,
        'finance'
      );

      const payInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      expect(() => adapter.recordPayment(payInput, cancelled, 'finance')).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );
    });
  });

  describe('5. RBAC Enforcement', () => {
    it('denies cancellation for non-privileged roles (sales, viewer)', () => {
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 102, reason: 'Sales try' }, invoices, 'sales')
      ).toThrowError("Access forbidden: role 'sales' lacks required permissions (admin, finance)");

      expect(() =>
        adapter.cancelInvoice({ invoice_id: 102, reason: 'Viewer try' }, invoices, 'viewer')
      ).toThrowError("Access forbidden: role 'viewer' lacks required permissions (admin, finance)");
    });

    it('allows cancellation for admin and finance roles', () => {
      const asAdmin = adapter.cancelInvoice({ invoice_id: 102, reason: 'Admin cancel' }, invoices, 'admin');
      expect(asAdmin.find(i => i.id === 102)!.computed_status).toBe('CANCELLED');
    });
  });

  describe('6. CancelInvoiceDrawer UI Component Verification', () => {
    it('renders strict payment blocking alert when invoice has active payments', () => {
      const inv101 = fixtures.invoices.find(i => i.id === 101) as unknown as Invoice;
      const close = vi.fn();

      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(CancelInvoiceDrawer, { invoice: inv101, close })
        )
      );

      // Verify header
      expect(screen.getByText('INVOICE CANCELLATION')).toBeInTheDocument();
      expect(screen.getByText(/Cancel Invoice · INV-2026-042/)).toBeInTheDocument();

      // Verify blocking alert
      expect(screen.getByText('Cancellation Blocked: Active Payments Recorded')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.'
        )
      ).toBeInTheDocument();

      // Verify payment details listed
      expect(screen.getByText(/Recorded payments on this invoice \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/UTR-ICICI-9876543210/)).toBeInTheDocument();

      // Review cancellation button should NOT be present
      expect(screen.queryByText('Review cancellation')).not.toBeInTheDocument();

      // Close button works
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('allows cancellation of unpaid invoice through 4-step workflow', async () => {
      const unpaidDoc = fixtures.invoices.find(i => i.id === 102) as unknown as Invoice;
      const close = vi.fn();

      render(
        React.createElement(
          MockSessionProvider,
          null,
          React.createElement(CancelInvoiceDrawer, { invoice: unpaidDoc, close })
        )
      );

      // Verify Form step
      expect(screen.getByText('INVOICE CANCELLATION')).toBeInTheDocument();
      expect(screen.getByText('Verified cancellation presets')).toBeInTheDocument();

      // Click a verified preset button
      const presetBtn = screen.getByRole('button', {
        name: 'Client rescinded contract / project scope cancelled',
      });
      fireEvent.click(presetBtn);

      const textarea = screen.getByLabelText(/Audit reason \(required\)/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Client rescinded contract / project scope cancelled');

      // Click "Review cancellation"
      const reviewBtn = screen.getByRole('button', { name: 'Review cancellation' });
      fireEvent.click(reviewBtn);

      // Verify Review step
      expect(screen.getByText('Planned lifecycle changes')).toBeInTheDocument();
      expect(screen.getByText('Financial review & impact')).toBeInTheDocument();
      expect(screen.getByText('CANCELLED')).toBeInTheDocument();
      expect(screen.getByText('Excluded')).toBeInTheDocument();

      // Click "Continue to confirmation"
      const continueBtn = screen.getByRole('button', { name: 'Continue to confirmation' });
      fireEvent.click(continueBtn);

      // Verify Confirm step
      expect(screen.getByText('Confirmed lifecycle changes')).toBeInTheDocument();
      expect(screen.getByText(/Irreversible Action:/)).toBeInTheDocument();

      // Click "Confirm Cancellation"
      const confirmBtn = screen.getByRole('button', { name: 'Confirm Cancellation' });
      fireEvent.click(confirmBtn);

      // Wait for Result step
      await waitFor(() => {
        expect(screen.getByText('Invoice Successfully Cancelled')).toBeInTheDocument();
      });

      // Click "Return to workspace"
      fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
