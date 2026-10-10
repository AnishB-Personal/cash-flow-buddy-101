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

describe('Empirical Adversarial Stress Suite: Payments & Settlements', () => {
  let invoices: Invoice[];

  beforeEach(() => {
    invoices = structuredClone(fixtures.invoices as Invoice[]);
  });

  // ---------------------------------------------------------------------------
  // 1. OVERPAYMENT BOUNDARY CONDITIONS
  // ---------------------------------------------------------------------------
  describe('1. Overpayment Boundary Conditions', () => {
    it('boundary: totalSettling === outstanding (exact clearance)', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const outstanding = inv101.outstanding_balance; // 322,000

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: outstanding,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'TEST-EXACT-001',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_outstanding).toBe(0);
      expect(review.resulting_status).toBe('PAID');
      expect(review.resulting_total_paid).toBe(inv101.total_amount);
    });

    it('boundary: totalSettling === outstanding + 0.01 (overpayment by 1 paisa MUST fail)', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const outstanding = inv101.outstanding_balance;

      const overpaidInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: outstanding + 0.01,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'TEST-OVER-001',
      };

      expect(() => reviewPayment(overpaidInput, 'finance', invoices)).toThrowError(
        /exceeds the outstanding balance of ₹3,22,000\.00/
      );
    });

    it('boundary: totalSettling === outstanding - 0.01 (underpayment by 1 paisa MUST succeed)', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const outstanding = inv101.outstanding_balance;

      const underpaidInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: outstanding - 0.01,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'TEST-UNDER-001',
      };

      const review = reviewPayment(underpaidInput, 'finance', invoices);
      expect(review.resulting_outstanding).toBe(0.01);
      expect(review.resulting_status).toBe('PARTIAL');
      expect(review.resulting_total_paid).toBe(inv101.total_amount - 0.01);
    });

    it('boundary with fractional rupees: cash + TDS split at exact 0.01 boundaries', () => {
      // Create a test invoice with non-integer balance
      const customInv: Invoice = {
        id: 999,
        invoice_number: 'INV-TEST-999',
        customer_id: 1,
        customer_name: 'Test Customer',
        po_number: 'PO-999',
        issue_date: '2026-04-01',
        due_date: '2026-04-30',
        payment_terms: 'NET_30',
        total_amount: 1000.55,
        total_cash_paid: 500.25,
        total_tds_deducted: 100.10,
        total_paid: 600.35,
        outstanding_balance: 400.20,
        payment_status: 'PARTIALLY_PAID',
        computed_status: 'PARTIAL',
        payments: [],
        lines: [],
      } as any;

      const testInvoices = [customInv];

      // Exact match: cash 300.15 + TDS 100.05 = 400.20
      const exactInput: PaymentCreateInput = {
        invoice_id: 999,
        payment_amount: 300.15,
        tds_amount: 100.05,
        payment_date: '2026-04-20',
        payment_mode: 'NEFT',
      };
      const exactRev = reviewPayment(exactInput, 'finance', testInvoices);
      expect(exactRev.resulting_outstanding).toBe(0);
      expect(exactRev.resulting_status).toBe('PAID');

      // +0.01 Overpayment: cash 300.15 + TDS 100.06 = 400.21 -> MUST FAIL
      const overInput: PaymentCreateInput = {
        invoice_id: 999,
        payment_amount: 300.15,
        tds_amount: 100.06,
        payment_date: '2026-04-20',
        payment_mode: 'NEFT',
      };
      expect(() => reviewPayment(overInput, 'finance', testInvoices)).toThrowError(
        /exceeds the outstanding balance of ₹400\.20/
      );

      // -0.01 Underpayment: cash 300.15 + TDS 100.04 = 400.19 -> MUST SUCCEED with 0.01 left
      const underInput: PaymentCreateInput = {
        invoice_id: 999,
        payment_amount: 300.15,
        tds_amount: 100.04,
        payment_date: '2026-04-20',
        payment_mode: 'NEFT',
      };
      const underRev = reviewPayment(underInput, 'finance', testInvoices);
      expect(underRev.resulting_outstanding).toBe(0.01);
      expect(underRev.resulting_status).toBe('PARTIAL');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ZERO AND NEGATIVE AMOUNT GUARDS
  // ---------------------------------------------------------------------------
  describe('2. Zero and Negative Amount Guards', () => {
    it('strictly rejects cash 0 & TDS 0 with exact validation message', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 0,
        tds_amount: 0,
        payment_date: '2026-04-25',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe(
          'Payment amount or TDS deduction must be greater than zero'
        );
      }
    });

    it('rejects sub-cent amounts that round to 0 (e.g. 0.004 cash & 0 TDS)', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 0.004,
        tds_amount: 0,
        payment_date: '2026-04-25',
      });
      // 0.004 rounds to 0.00, which is <= 0
      expect(res.success).toBe(false);
    });

    it('strictly rejects negative cash amount', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: -0.01,
        tds_amount: 500,
        payment_date: '2026-04-25',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('cannot be negative'))).toBe(true);
      }
    });

    it('strictly rejects negative TDS amount', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 500,
        tds_amount: -0.01,
        payment_date: '2026-04-25',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('cannot be negative'))).toBe(true);
      }
    });

    it('strictly rejects negative cash and negative TDS simultaneously', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: -100,
        tds_amount: -50,
        payment_date: '2026-04-25',
      });
      expect(res.success).toBe(false);
    });

    it('rejects non-numeric NaN values', () => {
      const res = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: NaN,
        tds_amount: 0,
        payment_date: '2026-04-25',
      });
      expect(res.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SETTLEMENT MODES: CASH-ONLY, TDS-ONLY (194C, 194J), & COMBINED
  // ---------------------------------------------------------------------------
  describe('3. Settlement Modes & TDS Section Workflows', () => {
    it('handles cash-only settlement: updates cash and preserves existing TDS', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const initialCash = inv101.total_cash_paid; // 200,000
      const initialTds = inv101.total_tds_deducted; // 9,000

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 50000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(initialCash + 50000);
      expect(review.resulting_tds_deducted).toBe(initialTds);
      expect(review.resulting_total_paid).toBe(initialCash + 50000 + initialTds);
      expect(review.resulting_outstanding).toBe(inv101.outstanding_balance - 50000);
      expect(review.resulting_status).toBe('PARTIAL');
    });

    it('handles TDS-only Section 194C settlement (Contractor withholding)', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const initialCash = inv101.total_cash_paid;
      const initialTds = inv101.total_tds_deducted;

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 0,
        tds_amount: 9000,
        tds_section: '194C (2%)',
        payment_date: '2026-04-28',
        payment_mode: 'OTHER',
        remittance_number: 'TDS-194C-CERT-2026',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(initialCash);
      expect(review.resulting_tds_deducted).toBe(initialTds + 9000);
      expect(review.resulting_outstanding).toBe(inv101.outstanding_balance - 9000);
      expect(review.impact.cashDelta).toBe(0);
      expect(review.impact.tdsDelta).toBe(9000);
      expect(review.impact.totalSettling).toBe(9000);
    });

    it('handles TDS-only Section 194J settlement (Professional withholding)', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const initialCash = inv101.total_cash_paid;
      const initialTds = inv101.total_tds_deducted;

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 0,
        tds_amount: 10000,
        tds_section: '194J (2%)',
        payment_date: '2026-04-24',
        payment_mode: 'OTHER',
        remittance_number: 'TDS-194J-CERT-2026',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(initialCash);
      expect(review.resulting_tds_deducted).toBe(initialTds + 10000);
      expect(review.resulting_outstanding).toBe(inv101.outstanding_balance - 10000);
      expect(review.resulting_status).toBe('PARTIAL');
    });

    it('handles combined settlement: cash + TDS in a single atomic transaction', () => {
      const inv101 = invoices.find(i => i.id === 101)!;
      const initialCash = inv101.total_cash_paid; // 200,000
      const initialTds = inv101.total_tds_deducted; // 9,000

      const input: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 300000,
        tds_amount: 22000,
        tds_section: '194C (2%)',
        payment_date: '2026-04-28',
        payment_mode: 'NEFT',
        remittance_number: 'NEFT-COMBINED-01',
      };

      const review = reviewPayment(input, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(initialCash + 300000);
      expect(review.resulting_tds_deducted).toBe(initialTds + 22000);
      expect(review.resulting_total_paid).toBe(531000);
      expect(review.resulting_outstanding).toBe(0);
      expect(review.resulting_status).toBe('PAID');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. DECIMAL PRECISION & HALF-UP ROUNDING HARNESS
  // ---------------------------------------------------------------------------
  describe('4. Decimal Precision & Half-Up Rounding Stress Test', () => {
    it('accurately executes half-up rounding across standard thresholds', () => {
      expect(roundCurrency(0.005)).toBe(0.01);
      expect(roundCurrency(0.0049)).toBe(0.0);
      expect(roundCurrency(0.015)).toBe(0.02);
      expect(roundCurrency(0.014)).toBe(0.01);
      expect(roundCurrency(100.005)).toBe(100.01);
      expect(roundCurrency(100.004)).toBe(100.0);
      expect(roundCurrency(9999.995)).toBe(10000.0);
    });

    it('eliminates IEEE 754 binary floating-point drift', () => {
      // 0.1 + 0.2 = 0.30000000000000004
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
      // 0.7 + 0.1 = 0.7999999999999999
      expect(roundCurrency(0.7 + 0.1)).toBe(0.8);
      // Multi-step addition drift
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += 0.1;
      expect(roundCurrency(sum)).toBe(1.0);
    });

    it('preserves penny-perfect integrity over sequential fractional payments', () => {
      // Set up invoice of 100.00
      const inv: Invoice = {
        id: 777,
        invoice_number: 'INV-FRACT-777',
        customer_id: 1,
        customer_name: 'Fractional Co',
        po_number: 'PO-777',
        issue_date: '2026-04-01',
        due_date: '2026-04-30',
        payment_terms: 'NET_30',
        total_amount: 100.0,
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 100.0,
        payment_status: 'PENDING',
        computed_status: 'PENDING',
        payments: [],
        lines: [],
      } as any;

      const adapter = createPaymentAdapter();
      let state = [inv];

      // Payment 1: 33.33
      state = adapter.recordPayment(
        {
          invoice_id: 777,
          payment_amount: 33.33,
          tds_amount: 0,
          payment_date: '2026-04-10',
          payment_mode: 'NEFT',
        },
        state
      );
      expect(state[0]!.outstanding_balance).toBe(66.67);
      expect(state[0]!.total_paid).toBe(33.33);
      expect(state[0]!.computed_status).toBe('PARTIAL');

      // Payment 2: 33.33
      state = adapter.recordPayment(
        {
          invoice_id: 777,
          payment_amount: 33.33,
          tds_amount: 0,
          payment_date: '2026-04-15',
          payment_mode: 'NEFT',
        },
        state
      );
      expect(state[0]!.outstanding_balance).toBe(33.34);
      expect(state[0]!.total_paid).toBe(66.66);
      expect(state[0]!.computed_status).toBe('PARTIAL');

      // Payment 3: 33.34 (Exact remainder)
      state = adapter.recordPayment(
        {
          invoice_id: 777,
          payment_amount: 33.34,
          tds_amount: 0,
          payment_date: '2026-04-20',
          payment_mode: 'NEFT',
        },
        state
      );
      expect(state[0]!.outstanding_balance).toBe(0.0);
      expect(state[0]!.total_paid).toBe(100.0);
      expect(state[0]!.computed_status).toBe('PAID');

      // Check invariant at completion
      expect(
        roundCurrency(state[0]!.total_cash_paid + state[0]!.total_tds_deducted + state[0]!.outstanding_balance)
      ).toBe(state[0]!.total_amount);

      // Now delete middle payment and verify exact recomputation
      const payment2Id = state[0]!.payments[1]!.id;
      state = adapter.deletePayment(payment2Id, state);
      expect(state[0]!.payments.length).toBe(2);
      expect(state[0]!.total_paid).toBe(66.67);
      expect(state[0]!.outstanding_balance).toBe(33.33);
      expect(state[0]!.computed_status).toBe('PARTIAL');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. DUPLICATE REMITTANCE & PAYMENT MODES
  // ---------------------------------------------------------------------------
  describe('5. Duplicate Remittance & Payment Modes Validation', () => {
    it('detects duplicate remittance on same invoice with identical amount', () => {
      const dupInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 200000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-ICICI-9876543210',
      };

      expect(() => reviewPayment(dupInput, 'finance', invoices)).toThrowError(
        "Duplicate payment detected with remittance number 'UTR-ICICI-9876543210'"
      );
    });

    it('detects duplicate remittance even when surrounded with whitespace', () => {
      const paddedInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 200000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: '   UTR-ICICI-9876543210   ',
      };

      expect(() => reviewPayment(paddedInput, 'finance', invoices)).toThrowError(
        "Duplicate payment detected with remittance number 'UTR-ICICI-9876543210'"
      );
    });

    it('allows same remittance on a DIFFERENT invoice', () => {
      // Invoice 101 has UTR-ICICI-9876543210
      // Invoice 102 should allow the same remittance reference
      const inv102 = invoices.find(i => i.id === 102)!;
      const inputFor102: PaymentCreateInput = {
        invoice_id: 102,
        payment_amount: 50000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-ICICI-9876543210',
      };

      const review = reviewPayment(inputFor102, 'finance', invoices);
      expect(review.resulting_cash_paid).toBe(50000);
      expect(review.resulting_outstanding).toBe(inv102.total_amount - 50000);
    });

    it('allows same remittance on same invoice if amount is DIFFERENT', () => {
      // Existing payment on 101 has amount 200,000
      const diffAmountInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 100000, // Different amount
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-ICICI-9876543210',
      };

      const review = reviewPayment(diffAmountInput, 'finance', invoices);
      expect(review.resulting_outstanding).toBe(222000);
    });

    it('does not trigger duplicate detection when remittance is null or empty', () => {
      const nullRemitInput: PaymentCreateInput = {
        invoice_id: 101,
        payment_amount: 10000,
        tds_amount: 0,
        payment_date: '2026-04-25',
        payment_mode: 'CASH',
        remittance_number: null,
      };

      const review = reviewPayment(nullRemitInput, 'finance', invoices);
      expect(review.resulting_outstanding).toBe(312000);
    });

    it('supports all valid payment modes with case insensitivity and whitespace trimming', () => {
      for (const mode of VALID_PAYMENT_MODES) {
        const parsed = paymentCreateSchema.parse({
          invoice_id: 101,
          payment_amount: 1000,
          payment_date: '2026-04-25',
          payment_mode: `  ${mode.toLowerCase()}  `,
        });
        expect(parsed.payment_mode).toBe(mode);
      }
    });

    it('rejects invalid payment modes (crypto, credit_card, empty string)', () => {
      const invalidModes = ['CRYPTO', 'BITCOIN', 'CREDIT_CARD', 'PAYPAL', 'BARTER', ''];
      for (const badMode of invalidModes) {
        const res = paymentCreateSchema.safeParse({
          invoice_id: 101,
          payment_amount: 1000,
          payment_date: '2026-04-25',
          payment_mode: badMode,
        });
        expect(res.success).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. ADVERSARIAL EDGE CASES & SECURITY GUARDS
  // ---------------------------------------------------------------------------
  describe('6. Adversarial Edge Cases & Security Guards', () => {
    it('blocks double submission / replay attack via consumed fingerprint', async () => {
      const adapter = createPaymentAdapter();
      const review = reviewPayment(verifiedPaymentPresets[0]!, 'finance', invoices);
      expect(review.supported).toBe(true);

      // First confirmation succeeds
      const updated = await adapter.confirm(review, 'finance', invoices);
      expect(updated.length).toBe(invoices.length);

      // Second confirmation replay MUST fail
      await expect(adapter.confirm(review, 'finance', updated)).rejects.toThrowError(
        'This confirmation was already applied.'
      );
    });

    it('rejects payment on an invoice with negative or 0 outstanding balance', () => {
      const zeroBalInv: Invoice = {
        ...invoices[0]!,
        total_cash_paid: invoices[0]!.total_amount,
        total_paid: invoices[0]!.total_amount,
        outstanding_balance: 0,
      };

      const input: PaymentCreateInput = {
        invoice_id: zeroBalInv.id,
        payment_amount: 100,
        tds_amount: 0,
        payment_mode: 'NEFT',
        payment_date: '2026-04-25',
      };

      expect(() => reviewPayment(input, 'finance', [zeroBalInv])).toThrowError(
        'Invoice is already fully paid. No further payments can be recorded.'
      );
    });

    it('rejects payment with calendar date that does not exist (e.g. Feb 29 on non-leap year)', () => {
      const nonLeapFeb29 = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 1000,
        payment_date: '2026-02-29', // 2026 is NOT a leap year
      });
      expect(nonLeapFeb29.success).toBe(false);

      const invalidMonth = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 1000,
        payment_date: '2026-13-01',
      });
      expect(invalidMonth.success).toBe(false);

      const invalidDay = paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 1000,
        payment_date: '2026-04-31', // April has 30 days
      });
      expect(invalidDay.success).toBe(false);
    });

    it('rejects non-existent invoice ID', () => {
      const badIdInput: PaymentCreateInput = {
        invoice_id: 999999,
        payment_amount: 1000,
        tds_amount: 0,
        payment_mode: 'NEFT',
        payment_date: '2026-04-25',
      };
      expect(() => reviewPayment(badIdInput, 'finance', invoices)).toThrowError(
        'Invoice not found'
      );
    });

    it('strictly preserves financial equation across all states: Cash + TDS + Outstanding === Total', () => {
      const adapter = createPaymentAdapter();
      let state = invoices;

      // Execute verified preset 1
      state = adapter.recordPayment(verifiedPaymentPresets[0]!, state, 'finance');
      const inv1 = state.find(i => i.id === 101)!;
      expect(roundCurrency(inv1.total_cash_paid + inv1.total_tds_deducted + inv1.outstanding_balance)).toBe(
        roundCurrency(inv1.total_amount)
      );

      // Execute verified preset 2 to complete payment
      state = adapter.recordPayment(
        {
          invoice_id: 101,
          payment_amount: inv1.outstanding_balance,
          tds_amount: 0,
          payment_date: '2026-04-30',
          payment_mode: 'RTGS',
        },
        state,
        'finance'
      );
      const invFinal = state.find(i => i.id === 101)!;
      expect(invFinal.outstanding_balance).toBe(0);
      expect(invFinal.computed_status).toBe('PAID');
      expect(roundCurrency(invFinal.total_cash_paid + invFinal.total_tds_deducted + invFinal.outstanding_balance)).toBe(
        roundCurrency(invFinal.total_amount)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. IMMUTABILITY, RANDOMIZED PARTITIONS & BOUNDARY LENGTH HARNESS
  // ---------------------------------------------------------------------------
  describe('7. Immutability, Randomized Partitions & Boundary Lengths', () => {
    it('guarantees pure immutability: original invoice collection is never mutated in-place', () => {
      const originalJson = JSON.stringify(invoices);
      const adapter = createPaymentAdapter();

      // 1. reviewPayment does not mutate
      reviewPayment(verifiedPaymentPresets[0]!, 'finance', invoices);
      expect(JSON.stringify(invoices)).toBe(originalJson);

      // 2. recordPayment does not mutate original array
      adapter.recordPayment(verifiedPaymentPresets[0]!, invoices, 'finance');
      expect(JSON.stringify(invoices)).toBe(originalJson);

      // 3. deletePayment does not mutate original array
      adapter.deletePayment(85, invoices, 'finance');
      expect(JSON.stringify(invoices)).toBe(originalJson);

      // 4. cancelInvoice does not mutate original array
      adapter.cancelInvoice({ invoice_id: 102, reason: 'Test' }, invoices, 'finance');
      expect(JSON.stringify(invoices)).toBe(originalJson);
    });

    it('survives multi-step randomized installment partition and complete reversal', () => {
      // Create a fresh test invoice of 50,000.00
      const testInv: Invoice = {
        id: 888,
        invoice_number: 'INV-RAND-888',
        customer_id: 1,
        customer_name: 'Randomized Stress Co',
        po_number: 'PO-888',
        issue_date: '2026-04-01',
        due_date: '2026-04-30',
        payment_terms: 'NET_30',
        total_amount: 50000.0,
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 50000.0,
        payment_status: 'PENDING',
        computed_status: 'PENDING',
        payments: [],
        lines: [],
      } as any;

      const adapter = createPaymentAdapter();
      let state = [testInv];

      // Fixed 5-installment partition summing to exactly 50,000.00
      const installments = [
        { cash: 12500.50, tds: 250.00 }, // 12,750.50 -> remaining 37,249.50
        { cash: 8200.00, tds: 300.00 },  // 8,500.00  -> remaining 28,749.50
        { cash: 15000.25, tds: 500.00 }, // 15,500.25 -> remaining 13,249.25
        { cash: 10000.00, tds: 249.25 }, // 10,249.25 -> remaining 3,000.00
        { cash: 2900.00, tds: 100.00 },  // 3,000.00  -> remaining 0.00
      ];

      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i]!;
        state = adapter.recordPayment(
          {
            invoice_id: 888,
            payment_amount: inst.cash,
            tds_amount: inst.tds,
            tds_section: '194C (2%)',
            payment_date: `2026-04-${10 + i}`,
            payment_mode: 'NEFT',
            remittance_number: `REMIT-PART-${i}`,
          },
          state,
          'finance'
        );

        const current = state.find(inv => inv.id === 888)!;
        expect(roundCurrency(current.total_cash_paid + current.total_tds_deducted + current.outstanding_balance)).toBe(50000.0);

        if (i < installments.length - 1) {
          expect(current.computed_status).toBe('PARTIAL');
          expect(current.outstanding_balance).toBeGreaterThan(0);
        } else {
          expect(current.computed_status).toBe('PAID');
          expect(current.outstanding_balance).toBe(0);
        }
      }

      // Reversal: delete all 5 recorded payments one by one in reverse order
      const recordedPaymentIds = [...state[0]!.payments.map(p => p.id)];
      expect(recordedPaymentIds.length).toBe(5);

      for (let i = recordedPaymentIds.length - 1; i >= 0; i--) {
        state = adapter.deletePayment(recordedPaymentIds[i]!, state, 'finance');
        const current = state.find(inv => inv.id === 888)!;
        expect(roundCurrency(current.total_cash_paid + current.total_tds_deducted + current.outstanding_balance)).toBe(50000.0);
      }

      // Final state after all deletions: invoice is back to clean PENDING state with 0 paid
      const restored = state.find(inv => inv.id === 888)!;
      expect(restored.payments.length).toBe(0);
      expect(restored.total_paid).toBe(0);
      expect(restored.outstanding_balance).toBe(50000.0);
      expect(restored.computed_status).toBe('PENDING');
    });

    it('enforces string length constraints on remittance_number and notes', () => {
      // remittance_number: max 100 chars
      const valid100 = 'R'.repeat(100);
      const invalid101 = 'R'.repeat(101);

      expect(paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 100,
        payment_date: '2026-04-25',
        remittance_number: valid100,
      }).success).toBe(true);

      expect(paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 100,
        payment_date: '2026-04-25',
        remittance_number: invalid101,
      }).success).toBe(false);

      // notes: max 500 chars
      const validNotes500 = 'N'.repeat(500);
      const invalidNotes501 = 'N'.repeat(501);

      expect(paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 100,
        payment_date: '2026-04-25',
        notes: validNotes500,
      }).success).toBe(true);

      expect(paymentCreateSchema.safeParse({
        invoice_id: 101,
        payment_amount: 100,
        payment_date: '2026-04-25',
        notes: invalidNotes501,
      }).success).toBe(false);
    });

    it('enforces invoiceCancelSchema bounds: non-empty trimmed reason and max 500 chars', () => {
      // Empty or whitespace-only reason must fail
      expect(invoiceCancelSchema.safeParse({ invoice_id: 101, reason: '' }).success).toBe(false);
      expect(invoiceCancelSchema.safeParse({ invoice_id: 101, reason: '   ' }).success).toBe(false);

      // Valid reason
      expect(invoiceCancelSchema.safeParse({ invoice_id: 101, reason: 'Operational cancellation' }).success).toBe(true);

      // Max 500 chars
      expect(invoiceCancelSchema.safeParse({ invoice_id: 101, reason: 'C'.repeat(500) }).success).toBe(true);
      expect(invoiceCancelSchema.safeParse({ invoice_id: 101, reason: 'C'.repeat(501) }).success).toBe(false);
    });
  });
});
