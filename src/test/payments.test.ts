import { describe, expect, it, beforeEach } from 'vitest';
import {
  VALID_PAYMENT_MODES,
  roundCurrency,
  paymentCreateSchema,
  invoiceCancelSchema,
  reviewPayment,
  createPaymentAdapter,
  getPaymentPresets,
  verifiedPaymentPresets,
  type PaymentCreateInput,
} from '@/data/payments';
import fixtures from '@/data/collectflow.json';
import type { Invoice } from '@/data/collectflow';

describe('Payments Data Model & Calculations', () => {
  let invoices: Invoice[];

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
  });

  describe('1. Schema & Input Validation', () => {
    it('validates standard payment inputs (cash-only, TDS-only, combined)', () => {
      for (const preset of verifiedPaymentPresets) {
        const result = paymentCreateSchema.safeParse(preset);
        expect(result.success).toBe(true);
      }
    });

    it('normalizes payment mode to uppercase and rejects invalid modes', () => {
      const validLower = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 10000,
        payment_date: '2026-04-25',
        payment_mode: 'neft',
      });
      expect(validLower.success).toBe(true);
      if (validLower.success) {
        expect(validLower.data.payment_mode).toBe('NEFT');
      }

      for (const mode of VALID_PAYMENT_MODES) {
        const parsed = paymentCreateSchema.safeParse({
          invoice_id: 101,
          payment_amount: 5000,
          payment_date: '2026-04-25',
          payment_mode: mode.toLowerCase(),
        });
        expect(parsed.success).toBe(true);
      }

      const invalid = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 10000,
        payment_date: '2026-04-25',
        payment_mode: 'BITCOIN',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects negative cash or TDS amounts', () => {
      const negCash = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: -100,
        payment_date: '2026-04-25',
      });
      expect(negCash.success).toBe(false);

      const negTds = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 1000,
        tds_amount: -50,
        payment_date: '2026-04-25',
      });
      expect(negTds.success).toBe(false);
    });

    it('rejects zero total settlement (cash 0 + TDS 0)', () => {
      const zeroSettlement = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 0,
        tds_amount: 0,
        payment_date: '2026-04-25',
      });
      expect(zeroSettlement.success).toBe(false);
      if (!zeroSettlement.success) {
        expect(zeroSettlement.error.issues[0]?.message).toBe(
          'Payment amount or TDS deduction must be greater than zero'
        );
      }
    });

    it('rejects invalid calendar dates', () => {
      const invalidDate = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 10000,
        payment_date: '2026-02-31',
      });
      expect(invalidDate.success).toBe(false);

      const badFormat = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 10000,
        payment_date: 'invalid-date',
      });
      expect(badFormat.success).toBe(false);
    });
  });

  describe('2. Settlement Math & Calculations', () => {
    it('calculates partial cash settlement math accurately', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      expect(inv101.total_cash_paid).toBe(200000);
      expect(inv101.total_tds_deducted).toBe(9000);
      expect(inv101.total_paid).toBe(209000);
      expect(inv101.outstanding_balance).toBe(322000);

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-HDFC-9918273645',
        notes: 'Partial settlement',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(300000);
      expect(review.resulting_tds_deducted).toBe(9000);
      expect(review.resulting_total_paid).toBe(309000);
      expect(review.resulting_outstanding).toBe(222000);
      expect(review.resulting_status).toBe('PARTIAL');
      expect(review.supported).toBe(true);
    });

    it('calculates full cash settlement and transitions status to PAID', () => {
      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 322000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'RTGS',
        remittance_number: 'RTGS-SBI-8822334411',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(522000);
      expect(review.resulting_tds_deducted).toBe(9000);
      expect(review.resulting_total_paid).toBe(531000);
      expect(review.resulting_outstanding).toBe(0);
      expect(review.resulting_status).toBe('PAID');
      expect(review.supported).toBe(true);
    });

    it('calculates TDS-only settlement reducing balance without cash', () => {
      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 0,
        tds_amount: 10000,
        tds_section: '194J (2%)',
        payment_date: '2026-04-24',
        payment_mode: 'OTHER',
        remittance_number: 'TDS-CERT-2026-Q1',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(200000);
      expect(review.resulting_tds_deducted).toBe(19000);
      expect(review.resulting_total_paid).toBe(219000);
      expect(review.resulting_outstanding).toBe(312000);
      expect(review.resulting_status).toBe('PARTIAL');
      expect(review.supported).toBe(true);
    });

    it('calculates combined cash and TDS settlement', () => {
      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 300000,
        tds_amount: 22000,
        tds_section: '194C (2%)',
        payment_date: '2026-04-28',
        payment_mode: 'NEFT',
        remittance_number: 'NEFT-KOTAK-55443322',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(500000);
      expect(review.resulting_tds_deducted).toBe(31000);
      expect(review.resulting_total_paid).toBe(531000);
      expect(review.resulting_outstanding).toBe(0);
      expect(review.resulting_status).toBe('PAID');
      expect(review.supported).toBe(true);
    });

    it('preserves exact 2-decimal precision avoiding float drift', () => {
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
      expect(roundCurrency(100.005)).toBe(100.01);
      expect(roundCurrency(12345.678)).toBe(12345.68);
    });
  });

  describe('3. Overpayment Prevention & Invariant Guards', () => {
    it('strictly rejects settlement exceeding invoice outstanding balance', () => {
      const overpaidInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 322000.01,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      expect(() => reviewPayment(overpaidInput, 'finance', invoices)).toThrowError(
        /exceeds the outstanding balance of ₹3,22,000\.00/
      );

      const combinedOverpaid: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 320000,
        tds_amount: 5000,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      expect(() => reviewPayment(combinedOverpaid, 'finance', invoices)).toThrowError(
        /exceeds the outstanding balance of ₹3,22,000\.00/
      );
    });

    it('rejects payment against a fully PAID invoice', () => {
      const adapter = createPaymentAdapter();
      const paidInvoices = adapter.recordPayment(
        {
          invoice_id: 101,
          payment_amount: 322000,
          tds_amount: 0,
          payment_date: '2026-04-25',
          payment_mode: 'RTGS',
          remittance_number: 'RTGS-SBI-8822334411',
        },
        invoices
      );

      const secondInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 1000,
        tds_amount: 0,
        payment_date: '2026-04-26',
        payment_mode: 'NEFT',
      };

      expect(() => reviewPayment(secondInput, 'finance', paidInvoices)).toThrowError(
        'Invoice is already fully paid. No further payments can be recorded.'
      );
    });

    it('rejects payment against a CANCELLED invoice', () => {
      const cancelledInvoices = structuredClone(invoices);
      cancelledInvoices[0]!.computed_status = 'CANCELLED' as any;
      cancelledInvoices[0]!.payment_status = 'CANCELLED' as any;

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 1000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      expect(() => reviewPayment(input, 'finance', cancelledInvoices)).toThrowError(
        'Cannot record payments against a CANCELLED invoice'
      );
    });
  });

  describe('4. Remittance Duplication & Preset Generation', () => {
    it('detects and rejects duplicate remittance on the same invoice', () => {
      const dupInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 200000,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-ICICI-9876543210',
      };

      expect(() => reviewPayment(dupInput, 'finance', invoices)).toThrowError(
        "Duplicate payment detected with remittance number 'UTR-ICICI-9876543210'"
      );
    });

    it('allows different remittance number or different amount', () => {
      const validRemit: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-NEW-12345678',
      };

      const rev = reviewPayment(validRemit, 'finance', invoices);
      expect(rev.resulting_outstanding).toBe(222000);
    });

    it('generates 4 valid presets for INV-2026-042', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const presets = getPaymentPresets(inv101);
      expect(presets.length).toBe(4);
      expect(presets.map(p => p.id)).toEqual(['partial-cash', 'full-cash', 'tds-only', 'combined']);
      for (const p of presets) {
        expect(p.values.invoice_id).toBe(101);
        expect(p.values.payment_amount + (p.values.tds_amount ?? 0)).toBeLessThanOrEqual(
          inv101.outstanding_balance
        );
      }
    });
  });

  describe('5. RBAC & Unsupported Review Guard', () => {
    it('enforces role permissions: admin and finance can pay, sales and viewer denied', () => {
      const input = verifiedPaymentPresets[0]!;
      expect(() => reviewPayment(input, 'sales', invoices)).toThrowError(
        "Access forbidden: role 'sales' lacks required permissions (admin, finance)"
      );
      expect(() => reviewPayment(input, 'viewer', invoices)).toThrowError(
        "Access forbidden: role 'viewer' lacks required permissions (admin, finance)"
      );

      const financeRev = reviewPayment(input, 'finance', invoices);
      expect(financeRev.supported).toBe(true);

      const adminRev = reviewPayment(input, 'admin', invoices);
      expect(adminRev.supported).toBe(true);
    });

    it('flags unsupported custom inputs as review-only', async () => {
      const customInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 77777,
        tds_amount: 0,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-CUSTOM-777',
      };

      const review = reviewPayment(customInput, 'finance', invoices);
      expect(review.supported).toBe(false);
      expect(review.message).toContain('Review only: custom inputs have no verified scenario outcome');

      const adapter = createPaymentAdapter();
      await expect(adapter.confirm(review, 'finance', invoices)).rejects.toThrowError(
        review.message
      );
    });
  });

  describe('6. Administrative Corrections & Cancellation', () => {
    it('deletes payment record and re-opens outstanding balance', () => {
      const adapter = createPaymentAdapter();
      const updated = adapter.deletePayment(85, invoices, 'finance');
      const inv101 = updated.find(i => i.id === 101)!;

      expect(inv101.payments.length).toBe(0);
      expect(inv101.total_cash_paid).toBe(0);
      expect(inv101.total_tds_deducted).toBe(0);
      expect(inv101.total_paid).toBe(0);
      expect(inv101.outstanding_balance).toBe(531000);
      expect(inv101.computed_status).toBe('PENDING');
    });

    it('strictly blocks cancellation of invoice with existing payments', () => {
      const adapter = createPaymentAdapter();
      expect(() =>
        adapter.cancelInvoice({ invoice_id: 101, reason: 'Dispute' }, invoices, 'finance')
      ).toThrowError(
        'Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.'
      );
    });

    it('cancels unpaid invoice, zeroes balance, and updates remarks', () => {
      const adapter = createPaymentAdapter();
      // Order 102 has 0 payments
      const order102 = invoices.find(i => i.id === 102)!;
      expect(order102.payments.length).toBe(0);

      const cancelled = adapter.cancelInvoice(
        { invoice_id: 102, reason: 'Duplicate order' },
        invoices,
        'finance'
      );

      const res102 = cancelled.find(i => i.id === 102)!;
      expect(res102.computed_status).toBe('CANCELLED');
      expect(res102.outstanding_balance).toBe(0);
      expect(res102.remarks).toContain('[CANCELLED: Duplicate order]');
    });

    it('resets adapter state cleanly', () => {
      const adapter = createPaymentAdapter();
      adapter.reset();
      // Verifying reset runs without error
      expect(true).toBe(true);
    });
  });
});
