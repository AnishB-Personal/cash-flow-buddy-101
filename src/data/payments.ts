import { z } from 'zod';
import { type Invoice, exactMoney, money } from './collectflow';
import { type Role, canPay, dateLabel } from './records';

export const VALID_PAYMENT_MODES = [
  'NEFT',
  'RTGS',
  'CHEQUE',
  'UPI',
  'CASH',
  'WIRE',
  'OTHER',
] as const;

export type PaymentMode = (typeof VALID_PAYMENT_MODES)[number];

export type Payment = Invoice['payments'][number];

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in valid YYYY-MM-DD format')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

export const paymentCreateSchema = z
  .object({
    invoice_id: z.coerce.number().int().positive('Invoice ID must be a positive integer'),
    payment_amount: z.coerce
      .number()
      .min(0, 'Payment and TDS amounts cannot be negative')
      .default(0),
    tds_amount: z.coerce
      .number()
      .min(0, 'Payment and TDS amounts cannot be negative')
      .default(0),
    tds_section: z.string().trim().optional().nullable(),
    payment_date: calendarDate,
    payment_mode: z
      .string()
      .trim()
      .transform(val => val.toUpperCase())
      .refine(
        (val): val is PaymentMode => VALID_PAYMENT_MODES.includes(val as PaymentMode),
        'Invalid payment mode. Must be one of: NEFT, RTGS, CHEQUE, UPI, CASH, WIRE, OTHER'
      )
      .default('NEFT'),
    remittance_number: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    idempotency_key: z.string().trim().optional().nullable(),
  })
  .refine(
    data => roundCurrency(data.payment_amount + (data.tds_amount ?? 0)) > 0,
    {
      message: 'Payment amount or TDS deduction must be greater than zero',
      path: ['payment_amount'],
    }
  );

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const invoiceCancelSchema = z.object({
  invoice_id: z.coerce.number().int().positive('Invoice ID must be a positive integer'),
  reason: z.string().trim().min(1, 'Reason is mandatory for cancellation').max(500),
});

export type InvoiceCancelInput = z.infer<typeof invoiceCancelSchema>;

export interface PaymentFieldChange {
  field: string;
  label: string;
  previous: string;
  current: string;
}

export interface PaymentFinancialImpact {
  cashDelta: number;
  tdsDelta: number;
  totalSettling: number;
  resultingOutstanding: number;
  resultingStatus: 'PARTIAL' | 'PAID';
}

export interface PaymentReview {
  invoice: Invoice;
  input: PaymentCreateInput;
  resulting_cash_paid: number;
  resulting_tds_deducted: number;
  resulting_total_paid: number;
  resulting_outstanding: number;
  resulting_status: 'PARTIAL' | 'PAID';
  supported: boolean;
  message: string;
  fingerprint: string;
  changes: PaymentFieldChange[];
  impact: PaymentFinancialImpact;
}

export interface PaymentPreset {
  id: 'partial-cash' | 'full-cash' | 'tds-only' | 'combined';
  label: string;
  description: string;
  values: PaymentCreateInput;
}

export function getPaymentPresets(invoice: Invoice): PaymentPreset[] {
  const outstanding = invoice.outstanding_balance;
  return [
    {
      id: 'partial-cash',
      label: 'Partial Cash (₹1,00,000)',
      description: 'NEFT installment reducing balance to ₹2,22,000',
      values: {
        invoice_id: invoice.id,
        payment_amount: 100000,
        tds_amount: 0,
        tds_section: null,
        payment_date: '2026-04-22',
        payment_mode: 'NEFT',
        remittance_number: 'UTR-HDFC-9918273645',
        notes: 'Second installment - partial cash settlement via NEFT',
        idempotency_key: null,
      },
    },
    {
      id: 'full-cash',
      label: `Full Settlement (${money(outstanding)})`,
      description: 'RTGS clearing the entire outstanding balance to ₹0',
      values: {
        invoice_id: invoice.id,
        payment_amount: outstanding,
        tds_amount: 0,
        tds_section: null,
        payment_date: '2026-04-25',
        payment_mode: 'RTGS',
        remittance_number: 'RTGS-SBI-8822334411',
        notes: 'Final settlement - remaining invoice balance cleared in full',
        idempotency_key: null,
      },
    },
    {
      id: 'tds-only',
      label: 'TDS Only (₹10,000 · 194J)',
      description: 'Section 194J tax withholding certificate',
      values: {
        invoice_id: invoice.id,
        payment_amount: 0,
        tds_amount: 10000,
        tds_section: '194J (2%)',
        payment_date: '2026-04-24',
        payment_mode: 'OTHER',
        remittance_number: 'TDS-CERT-2026-Q1',
        notes: 'Withholding tax certificate received for Q1',
        idempotency_key: null,
      },
    },
    {
      id: 'combined',
      label: 'Combined Cash + TDS (₹3.0L + ₹22k)',
      description: 'Cash payment plus Section 194C TDS clearing remainder',
      values: {
        invoice_id: invoice.id,
        payment_amount: 300000,
        tds_amount: 22000,
        tds_section: '194C (2%)',
        payment_date: '2026-04-28',
        payment_mode: 'NEFT',
        remittance_number: 'NEFT-KOTAK-55443322',
        notes: 'Combined final settlement with TDS deduction',
        idempotency_key: null,
      },
    },
  ];
}

export const verifiedPaymentPresets: PaymentCreateInput[] = [
  // 1. Partial Cash Settlement
  {
    invoice_id: 101,
    payment_amount: 100000,
    tds_amount: 0,
    tds_section: null,
    payment_date: '2026-04-22',
    payment_mode: 'NEFT',
    remittance_number: 'UTR-HDFC-9918273645',
    notes: 'Second installment - partial cash settlement via NEFT',
  },
  // 2. Full Cash Settlement
  {
    invoice_id: 101,
    payment_amount: 322000,
    tds_amount: 0,
    tds_section: null,
    payment_date: '2026-04-25',
    payment_mode: 'RTGS',
    remittance_number: 'RTGS-SBI-8822334411',
    notes: 'Final settlement - remaining invoice balance cleared in full',
  },
  // 3. TDS-only Settlement (Section 194J 2%)
  {
    invoice_id: 101,
    payment_amount: 0,
    tds_amount: 10000,
    tds_section: '194J (2%)',
    payment_date: '2026-04-24',
    payment_mode: 'OTHER',
    remittance_number: 'TDS-CERT-2026-Q1',
    notes: 'Withholding tax certificate received for Q1',
  },
  // 4. TDS-only Settlement (Section 194C 2%)
  {
    invoice_id: 101,
    payment_amount: 0,
    tds_amount: 9000,
    tds_section: '194C (2%)',
    payment_date: '2026-04-28',
    payment_mode: 'OTHER',
    remittance_number: 'TDS-CERT-Q4-2026',
    notes: 'TDS credit certificate adjustment',
  },
  // 5. Combined Cash + TDS Settlement
  {
    invoice_id: 101,
    payment_amount: 300000,
    tds_amount: 22000,
    tds_section: '194C (2%)',
    payment_date: '2026-04-28',
    payment_mode: 'NEFT',
    remittance_number: 'NEFT-KOTAK-55443322',
    notes: 'Combined final settlement with TDS deduction',
  },
  // 6. Additional combined preset
  {
    invoice_id: 101,
    payment_amount: 150000,
    tds_amount: 5000,
    tds_section: '194J (2%)',
    payment_date: '2026-04-29',
    payment_mode: 'NEFT',
    remittance_number: 'UTR-KOTAK-2026042901',
    notes: 'Milestone payment with TDS deduction',
  },
  // 7. Full settlement with combined
  {
    invoice_id: 101,
    payment_amount: 312000,
    tds_amount: 10000,
    tds_section: '194J (2%)',
    payment_date: '2026-04-30',
    payment_mode: 'RTGS',
    remittance_number: 'UTR-AXIS-2026043099',
    notes: 'Final closing settlement with TDS',
  },
];

export function reviewPayment(
  input: PaymentCreateInput,
  role: Role,
  invoices: Invoice[]
): PaymentReview {
  if (!canPay(role)) {
    throw new Error(`Access forbidden: role '${role}' lacks required permissions (admin, finance)`);
  }

  const validated = paymentCreateSchema.parse(input);
  const invoice = invoices.find(inv => inv.id === validated.invoice_id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.computed_status === 'CANCELLED' || invoice.payment_status === 'CANCELLED') {
    throw new Error('Cannot record payments against a CANCELLED invoice');
  }

  const payAmt = roundCurrency(validated.payment_amount);
  const tdsAmt = roundCurrency(validated.tds_amount || 0);
  const totalSettling = roundCurrency(payAmt + tdsAmt);

  const currentCash = roundCurrency(invoice.total_cash_paid);
  const currentTds = roundCurrency(invoice.total_tds_deducted);
  const currentSettled = roundCurrency(currentCash + currentTds);
  const outstanding = roundCurrency(invoice.total_amount - currentSettled);

  if (outstanding <= 0) {
    throw new Error('Invoice is already fully paid. No further payments can be recorded.');
  }

  // Exact overpayment guard matching FastAPI detail message
  if (totalSettling > outstanding) {
    const formattedCash = payAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedTds = tdsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedSettling = totalSettling.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedOutstanding = outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    throw new Error(
      `Total settlement amount (Cash ₹${formattedCash} + TDS ₹${formattedTds} = ₹${formattedSettling}) exceeds the outstanding balance of ₹${formattedOutstanding}`
    );
  }

  // Duplicate remittance check against existing payments for this invoice
  if (validated.remittance_number) {
    const trimmedRemit = validated.remittance_number.trim();
    const isDup = invoice.payments.some(
      p => p.remittance_number?.trim() === trimmedRemit && roundCurrency(p.payment_amount) === payAmt
    );
    if (isDup) {
      throw new Error(`Duplicate payment detected with remittance number '${trimmedRemit}'`);
    }
  }

  const resultingCash = roundCurrency(currentCash + payAmt);
  const resultingTds = roundCurrency(currentTds + tdsAmt);
  const resultingTotalPaid = roundCurrency(currentSettled + totalSettling);
  const resultingOutstanding = roundCurrency(invoice.total_amount - resultingTotalPaid);
  const resultingStatus: 'PARTIAL' | 'PAID' = resultingOutstanding <= 0 ? 'PAID' : 'PARTIAL';

  // Check if input matches any verified presets
  const presetsForInvoice = getPaymentPresets(invoice);
  const matchesPreset = presetsForInvoice.some(preset =>
    preset.values.invoice_id === validated.invoice_id &&
    roundCurrency(preset.values.payment_amount) === payAmt &&
    roundCurrency(preset.values.tds_amount || 0) === tdsAmt &&
    preset.values.payment_mode === validated.payment_mode
  ) || verifiedPaymentPresets.some(preset =>
    preset.invoice_id === validated.invoice_id &&
    roundCurrency(preset.payment_amount) === payAmt &&
    roundCurrency(preset.tds_amount || 0) === tdsAmt &&
    preset.payment_mode === validated.payment_mode
  );

  const supported = matchesPreset;
  const message = supported
    ? `Verified settlement rehearsal. Recording Cash ₹${payAmt.toLocaleString('en-IN')} (TDS: ₹${tdsAmt.toLocaleString('en-IN')}) against ${invoice.invoice_number || invoice.po_number}. Resulting outstanding: ₹${resultingOutstanding.toLocaleString('en-IN')}.`
    : 'Review only: custom inputs have no verified scenario outcome. In demo mode, only pre-verified payment scenarios can be confirmed.';

  const fingerprint = JSON.stringify([
    validated.invoice_id,
    payAmt,
    tdsAmt,
    validated.payment_mode,
    validated.payment_date,
    validated.remittance_number ?? '',
  ]);

  const changes: PaymentFieldChange[] = [
    {
      field: 'cash',
      label: 'Cash Collected',
      previous: exactMoney(currentCash),
      current: exactMoney(resultingCash),
    },
    {
      field: 'tds',
      label: 'TDS Recognized',
      previous: exactMoney(currentTds),
      current: exactMoney(resultingTds),
    },
    {
      field: 'settled',
      label: 'Total Settled',
      previous: exactMoney(currentSettled),
      current: exactMoney(resultingTotalPaid),
    },
    {
      field: 'outstanding',
      label: 'Outstanding Balance',
      previous: exactMoney(outstanding),
      current: exactMoney(resultingOutstanding),
    },
    {
      field: 'status',
      label: 'Invoice Status',
      previous: invoice.computed_status,
      current: resultingStatus,
    },
  ];

  const impact: PaymentFinancialImpact = {
    cashDelta: payAmt,
    tdsDelta: tdsAmt,
    totalSettling,
    resultingOutstanding,
    resultingStatus,
  };

  return {
    invoice,
    input: validated as PaymentCreateInput,
    resulting_cash_paid: resultingCash,
    resulting_tds_deducted: resultingTds,
    resulting_total_paid: resultingTotalPaid,
    resulting_outstanding: resultingOutstanding,
    resulting_status: resultingStatus,
    supported,
    message,
    fingerprint,
    changes,
    impact,
  };
}

export interface PaymentAdapter {
  reviewPayment(input: PaymentCreateInput, role: Role, invoices: Invoice[]): PaymentReview;
  recordPayment(input: PaymentCreateInput, invoices: Invoice[], role?: Role): Invoice[];
  deletePayment(paymentId: number, invoices: Invoice[], role?: Role): Invoice[];
  cancelInvoice(input: InvoiceCancelInput, invoices: Invoice[], role?: Role): Invoice[];
  confirm(review: PaymentReview, role: Role, invoices: Invoice[]): Promise<Invoice[]>;
  reset(): void;
}

export function createPaymentAdapter(): PaymentAdapter {
  const consumed = new Set<string>();
  const idempotencyMap = new Map<string, { paymentId: number; review: PaymentReview }>();

  return {
    reset() {
      consumed.clear();
      idempotencyMap.clear();
    },

    reviewPayment(input, role, invoices) {
      return reviewPayment(input, role, invoices);
    },

    recordPayment(input, invoices, role = 'finance') {
      if (!canPay(role)) {
        throw new Error(`Access forbidden: role '${role}' lacks required permissions (admin, finance)`);
      }
      const review = reviewPayment(input, role, invoices);
      const nextInvoices = structuredClone(invoices);
      const targetIdx = nextInvoices.findIndex(inv => inv.id === input.invoice_id);
      if (targetIdx === -1) throw new Error('Invoice not found');

      const target = nextInvoices[targetIdx];
      if (!target) throw new Error('Invoice not found');

      const allPaymentIds = nextInvoices.flatMap(inv => (inv.payments as any[]).map(p => p.id));
      const nextId = (allPaymentIds.length ? Math.max(...allPaymentIds) : 84) + 1;

      const newPayment = {
        id: nextId,
        invoice_id: target.id,
        payment_amount: roundCurrency(input.payment_amount),
        tds_amount: roundCurrency(input.tds_amount || 0),
        tds_section: input.tds_section ?? '',
        payment_date: input.payment_date,
        payment_mode: input.payment_mode,
        remittance_number: input.remittance_number ?? '',
      };

      (target.payments as any[]).push(newPayment);
      target.total_cash_paid = review.resulting_cash_paid;
      target.total_tds_deducted = review.resulting_tds_deducted;
      target.total_paid = review.resulting_total_paid;
      target.outstanding_balance = review.resulting_outstanding;
      target.computed_status = review.resulting_status as any;
      target.payment_status = review.resulting_status as any;

      return nextInvoices;
    },

    deletePayment(paymentId, invoices, role = 'finance') {
      if (!canPay(role)) {
        throw new Error(`Access forbidden: role '${role}' lacks required permissions (admin, finance)`);
      }
      const nextInvoices = structuredClone(invoices);
      let found = false;

      for (const inv of nextInvoices) {
        const pIdx = inv.payments.findIndex(p => p.id === paymentId);
        if (pIdx !== -1) {
          inv.payments.splice(pIdx, 1);
          // Recompute invoice totals from remaining payments
          const newCash = roundCurrency(inv.payments.reduce((sum, p) => sum + p.payment_amount, 0));
          const newTds = roundCurrency(inv.payments.reduce((sum, p) => sum + p.tds_amount, 0));
          const newTotalPaid = roundCurrency(newCash + newTds);
          const newOutstanding = roundCurrency(inv.total_amount - newTotalPaid);
          inv.total_cash_paid = newCash;
          inv.total_tds_deducted = newTds;
          inv.total_paid = newTotalPaid;
          inv.outstanding_balance = newOutstanding;
          inv.computed_status = newTotalPaid <= 0 ? (inv.invoice_number ? 'PENDING' : 'UNBILLED') : newOutstanding <= 0 ? 'PAID' : 'PARTIAL';
          inv.payment_status = inv.computed_status;
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error('Payment record not found');
      }
      return nextInvoices;
    },

    cancelInvoice(input, invoices, role = 'finance') {
      if (!canPay(role)) {
        throw new Error(`Access forbidden: role '${role}' lacks required permissions (admin, finance)`);
      }
      const validated = invoiceCancelSchema.parse(input);
      const nextInvoices = structuredClone(invoices);
      const target = nextInvoices.find(inv => inv.id === validated.invoice_id);
      if (!target) throw new Error('Invoice not found');

      if (target.computed_status === 'CANCELLED' || target.payment_status === 'CANCELLED') {
        throw new Error('Invoice is already cancelled');
      }

      if (target.payments.length > 0) {
        throw new Error('Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.');
      }

      target.computed_status = 'CANCELLED';
      target.payment_status = 'CANCELLED';
      target.outstanding_balance = 0.0;
      target.remarks = target.remarks ? `${target.remarks} [CANCELLED: ${validated.reason}]` : `[CANCELLED: ${validated.reason}]`;

      return nextInvoices;
    },

    async confirm(review, role, invoices) {
      if (!canPay(role)) {
        throw new Error('Permission changed. No changes applied.');
      }
      if (consumed.has(review.fingerprint)) {
        throw new Error('This confirmation was already applied.');
      }
      if (!review.supported) {
        throw new Error(review.message);
      }

      // Re-verify under current invoices context
      const freshReview = reviewPayment(review.input, role, invoices);
      if (!freshReview.supported) {
        throw new Error(freshReview.message);
      }

      consumed.add(review.fingerprint);
      return this.recordPayment(review.input, invoices, role);
    },
  };
}
