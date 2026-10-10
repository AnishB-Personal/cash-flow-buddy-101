import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { exactMoney, money, type Invoice } from '@/data/collectflow';
import { dateLabel, canPay } from '@/data/records';
import { useMockSession } from './session';
import { FormSection, FieldError } from './demo-controls';
import type { PaymentItem } from './payments-ledger';
import {
  type PaymentCreateInput,
  type PaymentReview,
  paymentCreateSchema,
  VALID_PAYMENT_MODES,
  getPaymentPresets,
  reviewPayment,
  roundCurrency,
} from '@/data/payments';

export function RecordPaymentDrawer({
  invoice,
  container,
  close,
}: {
  invoice: Invoice;
  container?: HTMLElement | null | undefined;
  close: () => void;
}) {
  const { role, fy, revision, confirmPayment } = useMockSession();
  const presets = getPaymentPresets(invoice);

  const [input, setInput] = useState<PaymentCreateInput>(presets[0]!.values);
  const [step, setStep] = useState<'form' | 'review' | 'confirm' | 'result'>('form');
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const origin = useRef({ revision, fy, role });
  const trigger = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement)
  );
  const allowed = canPay(role);

  // Real-time calculation helpers
  const cash = Number(input.payment_amount || 0);
  const tds = Number(input.tds_amount || 0);
  const totalSettling = roundCurrency(cash + tds);
  const projectedRemaining = roundCurrency(invoice.outstanding_balance - totalSettling);
  const isOverpaid = totalSettling > invoice.outstanding_balance;

  function requestClose() {
    if (pending) return;
    if (dirty && step !== 'result') setDiscard(true);
    else close();
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (input.payment_amount < 0) {
      errs['payment_amount'] = 'Payment amount cannot be negative';
    }
    if (input.tds_amount < 0) {
      errs['tds_amount'] = 'TDS amount cannot be negative';
    }
    if (totalSettling <= 0) {
      errs['general'] = 'Payment amount or TDS deduction must be greater than zero';
    }
    if (isOverpaid) {
      const formattedCash = cash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedTds = tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedSettling = totalSettling.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedOutstanding = invoice.outstanding_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      errs['general'] = `Total settlement amount (Cash ₹${formattedCash} + TDS ₹${formattedTds} = ₹${formattedSettling}) exceeds the outstanding balance of ₹${formattedOutstanding}`;
    }
    if (!input.payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.payment_date)) {
      errs['payment_date'] = 'Payment date must be in valid YYYY-MM-DD format';
    }
    if (invoice.computed_status === 'CANCELLED') {
      errs['general'] = 'Cannot record payments against a CANCELLED invoice';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function prepare() {
    if (!validate()) return;
    setErrors({});

    try {
      const rev = reviewPayment(input, role, [invoice]);
      setReview(rev);
      setStep('review');
      setError('');
      origin.current = { revision, fy, role };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review calculation failed');
    }
  }

  async function confirm() {
    if (!review || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      if (
        origin.current.revision !== revision ||
        origin.current.fy !== fy ||
        origin.current.role !== role
      ) {
        throw new Error('Context changed. Return to the form and review again.');
      }
      await confirmPayment(review);
      setStep('result');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. No changes applied. Try again.');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="cf-overlay" />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          aria-describedby="record-payment-description"
          onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}
          onInteractOutside={event => event.preventDefault()}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
        >
          <header className="cf-drawer-header">
            <div>
              <span className="cf-kicker">SETTLEMENT WORKFLOW</span>
              <Dialog.Title>Record Payment · {invoice.invoice_number}</Dialog.Title>
              <Dialog.Description id="record-payment-description">
                {invoice.customer_name} · Outstanding: {exactMoney(invoice.outstanding_balance)}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close payment workflow"
              disabled={pending}
              onClick={requestClose}
            >
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body">
            {/* 4-step progress bar */}
            <div className="cf-demo-progress">
              {['Form', 'Review', 'Confirm', 'Result'].map(label => (
                <span
                  key={label}
                  aria-current={label.toLowerCase() === step ? 'step' : undefined}
                >
                  {label}
                </span>
              ))}
            </div>

            {!allowed ? (
              <p role="alert" className="cf-field-error">
                This role cannot perform this action. Permissions require finance or admin.
              </p>
            ) : invoice.computed_status === 'CANCELLED' ? (
              <p role="alert" className="cf-field-error">
                Cannot record payments against a CANCELLED invoice.
              </p>
            ) : invoice.outstanding_balance <= 0 ? (
              <p role="alert" className="cf-field-error">
                Invoice is already fully settled (₹0.00 outstanding balance).
              </p>
            ) : step === 'form' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  prepare();
                }}
              >
                {/* Verified Presets Toolbar */}
                <FormSection title="Verified settlement presets">
                  <p className="cf-muted" style={{ marginBottom: 8 }}>
                    Select a verified scenario or enter custom values:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {presets.map(p => (
                      <Button
                        key={p.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInput(p.values);
                          setDirty(true);
                          setErrors({});
                          setError('');
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </FormSection>

                {/* Monetary Inputs */}
                <FormSection title="Payment & withholding amounts">
                  <div className="cf-reference-fields">
                    <div>
                      <label htmlFor="pay-cash">Cash payment amount (INR)</label>
                      <Input
                        id="pay-cash"
                        type="number"
                        step="0.01"
                        min="0"
                        value={input.payment_amount}
                        aria-invalid={Boolean(errors['payment_amount'])}
                        aria-describedby="error-pay-cash"
                        onChange={e => {
                          setInput({ ...input, payment_amount: Number(e.target.value) });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-pay-cash" message={errors['payment_amount']} />
                    </div>

                    <div>
                      <label htmlFor="pay-tds">TDS deduction amount (INR)</label>
                      <Input
                        id="pay-tds"
                        type="number"
                        step="0.01"
                        min="0"
                        value={input.tds_amount}
                        aria-invalid={Boolean(errors['tds_amount'])}
                        aria-describedby="error-pay-tds"
                        onChange={e => {
                          setInput({ ...input, tds_amount: Number(e.target.value) });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-pay-tds" message={errors['tds_amount']} />
                    </div>

                    <div>
                      <label htmlFor="pay-tds-sec">TDS section</label>
                      <select
                        id="pay-tds-sec"
                        value={input.tds_section ?? ''}
                        onChange={e => {
                          setInput({ ...input, tds_section: e.target.value });
                          setDirty(true);
                        }}
                      >
                        <option value="">None / Not Applicable</option>
                        <option value="194J (2%)">194J (2%) — Technical Services</option>
                        <option value="194J (10%)">194J (10%) — Professional Fees</option>
                        <option value="194C (2%)">194C (2%) — Company Contractor</option>
                        <option value="194C (1%)">194C (1%) — Individual Contractor</option>
                        <option value="194Q (0.1%)">194Q (0.1%) — Goods Purchase</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="pay-mode">Payment mode</label>
                      <select
                        id="pay-mode"
                        value={input.payment_mode}
                        onChange={e => {
                          setInput({ ...input, payment_mode: e.target.value as any });
                          setDirty(true);
                        }}
                      >
                        {VALID_PAYMENT_MODES.map(mode => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="pay-date">Payment date</label>
                      <Input
                        id="pay-date"
                        type="date"
                        value={input.payment_date}
                        aria-invalid={Boolean(errors['payment_date'])}
                        aria-describedby="error-pay-date"
                        onChange={e => {
                          setInput({ ...input, payment_date: e.target.value });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-pay-date" message={errors['payment_date']} />
                    </div>

                    <div>
                      <label htmlFor="pay-remit">Remittance / UTR number</label>
                      <Input
                        id="pay-remit"
                        placeholder="UTR-HDFC-12345678"
                        value={input.remittance_number ?? ''}
                        onChange={e => {
                          setInput({ ...input, remittance_number: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label htmlFor="pay-notes">Remarks / Notes</label>
                    <Textarea
                      id="pay-notes"
                      placeholder="Optional settlement notes or reference..."
                      value={input.notes ?? ''}
                      onChange={e => {
                        setInput({ ...input, notes: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </div>
                </FormSection>

                {/* Real-time settlement calculation summary */}
                <div
                  style={{
                    padding: 12,
                    background: isOverpaid ? 'var(--destructive-light, #fee2e2)' : 'var(--accent)',
                    borderRadius: 6,
                    margin: '16px 0',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Total proposed settlement:</span>
                    <strong>{exactMoney(totalSettling)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Projected remaining balance:</span>
                    <strong style={{ color: isOverpaid ? 'var(--destructive)' : undefined }}>
                      {exactMoney(projectedRemaining)}
                    </strong>
                  </div>
                </div>

                {errors['general'] && (
                  <p role="alert" className="cf-field-error">
                    {errors['general']}
                  </p>
                )}

                <div className="cf-demo-actions">
                  <Button type="submit" disabled={isOverpaid || totalSettling <= 0}>
                    Review changes <ArrowUpRight size={16} />
                  </Button>
                </div>
              </form>
            ) : step === 'result' ? (
              <FormSection title="Demo result">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                  <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>Payment recorded successfully</p>
                    <p className="cf-muted" style={{ margin: 0 }}>
                      Invoice {invoice.invoice_number} balance updated to{' '}
                      {exactMoney(review?.resulting_outstanding ?? 0)} ({review?.resulting_status}).
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={close}>
                  Return to workspace
                </Button>
              </FormSection>
            ) : review ? (
              <>
                {/* Intended settlement details */}
                <FormSection title="Intended settlement details">
                  <dl className="cf-detail-grid">
                    <div>
                      <dt>Invoice</dt>
                      <dd>{invoice.invoice_number}</dd>
                    </div>
                    <div>
                      <dt>Customer</dt>
                      <dd>{invoice.customer_name}</dd>
                    </div>
                    <div>
                      <dt>Payment Mode</dt>
                      <dd>{input.payment_mode}</dd>
                    </div>
                    <div>
                      <dt>Payment Date</dt>
                      <dd>{dateLabel(input.payment_date)}</dd>
                    </div>
                    <div>
                      <dt>Remittance Number</dt>
                      <dd>{input.remittance_number || '—'}</dd>
                    </div>
                    <div>
                      <dt>TDS Section</dt>
                      <dd>{input.tds_section || 'None'}</dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Diff View */}
                <FormSection
                  title={step === 'confirm' ? 'Confirmed balance changes' : 'Planned balance changes'}
                >
                  <dl className="cf-change-list">
                    {review.changes.map(chg => (
                      <div key={chg.field} className="cf-change-row">
                        <dt>{chg.label}</dt>
                        <dd>
                          <span className="cf-change-prev">{chg.previous}</span>
                          <span className="cf-change-arrow" aria-hidden="true">→</span>
                          <strong className="cf-change-curr">{chg.current}</strong>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </FormSection>

                <p className="cf-drawer-message" role="status">
                  {review.message}
                </p>

                {/* Financial Review & Impact */}
                <FormSection title="Financial review & impact">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Cash payment amount</dt>
                      <dd>
                        {review.impact.cashDelta > 0
                          ? `+${exactMoney(review.impact.cashDelta)}`
                          : '₹0.00'}
                        <small>Direct bank inflow / credit</small>
                      </dd>
                    </div>
                    <div>
                      <dt>TDS deduction recognized</dt>
                      <dd>
                        {review.impact.tdsDelta > 0
                          ? `+${exactMoney(review.impact.tdsDelta)}`
                          : '₹0.00'}
                        <small>{input.tds_section ? `Section ${input.tds_section}` : 'Tax withholding'}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Total settling amount</dt>
                      <dd>
                        {exactMoney(review.impact.totalSettling)}
                        <small>Rupee-for-rupee receivable reduction</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Resulting outstanding balance</dt>
                      <dd>
                        {exactMoney(review.impact.resultingOutstanding)}
                        <small>Status: {review.impact.resultingStatus}</small>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {step === 'confirm' && (
                  <p className="cf-drawer-message">
                    Confirm recording payment against {invoice.invoice_number} in this isolated demo?
                  </p>
                )}

                <div className="cf-demo-actions">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setStep('form');
                      setError('');
                    }}
                  >
                    Back to form
                  </Button>
                  {review.supported && (
                    <Button
                      disabled={pending || !allowed}
                      onClick={() => {
                        if (step === 'review') setStep('confirm');
                        else void confirm();
                      }}
                    >
                      {pending
                        ? 'Submitting…'
                        : step === 'review'
                        ? 'Continue to confirmation'
                        : 'Confirm payment'}
                    </Button>
                  )}
                </div>
              </>
            ) : null}

            {error && (
              <p className="cf-field-error" role="alert">
                {error}
              </p>
            )}

            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved payment inputs?</p>
                <Button variant="outline" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button onClick={close}>Discard inputs</Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type CorrectionStep =
  | 'step1-confirm'
  | 'step1-deleting'
  | 'step2-form'
  | 'step2-review'
  | 'step2-submitting'
  | 'step2-recovery'
  | 'result-success'
  | 'result-deleted-only';

export interface PaymentCorrectionDrawerProps {
  payment: PaymentItem;
  container?: HTMLElement | null | undefined;
  close: () => void;
}

export function PaymentCorrectionDrawer({
  payment,
  container,
  close,
}: PaymentCorrectionDrawerProps) {
  const { role, revision, demo, deletePayment, confirmPayment } = useMockSession();
  const currentInvoice = demo.invoices.find(inv => inv.id === payment.invoice_id) ?? payment.invoice;
  const presets = getPaymentPresets(currentInvoice);

  const [step, setStep] = useState<CorrectionStep>('step1-confirm');
  const [input, setInput] = useState<PaymentCreateInput>({
    invoice_id: payment.invoice_id,
    payment_amount: payment.payment_amount,
    tds_amount: payment.tds_amount,
    tds_section: (payment.tds_section as any) || '',
    payment_mode: (payment.payment_mode as any) || 'NEFT',
    payment_date: payment.payment_date,
    remittance_number: payment.remittance_number ? `${payment.remittance_number}-CORR` : '',
    notes: `Replacement for deleted payment #${payment.id}`,
  });
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const trigger = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement)
  );
  const allowed = canPay(role);

  // Calculations for Step 2
  const cash = Number(input.payment_amount || 0);
  const tds = Number(input.tds_amount || 0);
  const totalSettling = roundCurrency(cash + tds);
  const updatedOutstanding = currentInvoice.outstanding_balance;
  const projectedRemaining = roundCurrency(updatedOutstanding - totalSettling);
  const isOverpaid = totalSettling > updatedOutstanding;

  // Calculation for Step 1
  const balanceAfterDeletion = roundCurrency(currentInvoice.outstanding_balance + payment.net_settled);

  function requestClose() {
    if (pending) return;
    if (step === 'result-success' || step === 'result-deleted-only') {
      close();
      return;
    }
    if (dirty || step === 'step2-form' || step === 'step2-review' || step === 'step2-recovery') {
      setDiscard(true);
    } else {
      close();
    }
  }

  async function executeStep1(targetStep: 'step2-form' | 'result-deleted-only') {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await deletePayment(payment.id);
      setStep(targetStep);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete payment record.');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  function handleReviewReplacement() {
    const parsed = paymentCreateSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    try {
      const rev = reviewPayment(parsed.data, role, demo.invoices);
      setReview(rev);
      setStep('step2-review');
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Validation failed for replacement payment.';
      setError(msg);
      setStep('step2-recovery');
    }
  }

  async function confirmReplacement() {
    if (!review || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await confirmPayment(review);
      setStep('result-success');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replacement payment submission failed.');
      setStep('step2-recovery');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  const step1Completed = step !== 'step1-confirm' && step !== 'step1-deleting';
  const isStep1 = step === 'step1-confirm' || step === 'step1-deleting';
  const isStep2 = !isStep1 && step !== 'result-deleted-only';

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="cf-overlay" />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          aria-describedby="payment-correction-description"
          onEscapeKeyDown={event => {
            event.preventDefault();
            requestClose();
          }}
          onInteractOutside={event => event.preventDefault()}
          onCloseAutoFocus={event => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <header className="cf-drawer-header">
            <div>
              <span className="cf-kicker">ADMINISTRATIVE CORRECTION</span>
              <Dialog.Title>
                Correct Payment · {payment.remittance_number || `PAY-${payment.id}`}
              </Dialog.Title>
              <Dialog.Description id="payment-correction-description">
                Invoice {payment.invoice_number} · {payment.customer_name}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close correction workflow"
              disabled={pending}
              onClick={requestClose}
            >
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body">
            {/* 2-step progress bar */}
            <div className="cf-demo-progress" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <span aria-current={isStep1 ? 'step' : undefined}>
                {step1Completed ? '✓ 1. Physical Deletion' : '1. Physical Deletion'}
              </span>
              <span aria-current={isStep2 ? 'step' : undefined}>
                2. Replacement Record
              </span>
            </div>

            {!allowed ? (
              <p role="alert" className="cf-field-error">
                This role cannot perform this action. Permissions require finance or admin.
              </p>
            ) : isStep1 ? (
              /* STEP 1: PHYSICAL DELETION */
              <div style={{ marginTop: 16 }}>
                {/* Non-Atomic Accounting Disclosure */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 16,
                    backgroundColor: 'var(--accent)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    marginBottom: 16,
                  }}
                >
                  <ShieldAlert size={22} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14, color: 'var(--foreground)', marginBottom: 4 }}>
                      Non-Atomic Administrative Sequence
                    </strong>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                      The FastAPI backend performs corrections in two discrete operations: physically deleting the payment record (<code>DELETE /api/payments/{'{id}'}</code>) and logging an audit event, followed by an independent creation request (<code>POST /api/payments</code>). This is NOT an atomic accounting reversal. Payment #{payment.id} will be permanently removed from the ledger.
                    </p>
                  </div>
                </div>

                <FormSection title="Target payment record to delete">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Payment ID</dt>
                      <dd>#{payment.id}</dd>
                    </div>
                    <div>
                      <dt>Payment mode & date</dt>
                      <dd>{payment.payment_mode} · {dateLabel(payment.payment_date)}</dd>
                    </div>
                    <div>
                      <dt>Remittance number</dt>
                      <dd>{payment.remittance_number || '—'}</dd>
                    </div>
                    <div>
                      <dt>Cash payment amount</dt>
                      <dd>{exactMoney(payment.payment_amount)}</dd>
                    </div>
                    <div>
                      <dt>TDS deduction</dt>
                      <dd>{exactMoney(payment.tds_amount)} ({payment.tds_section || 'None'})</dd>
                    </div>
                    <div>
                      <dt>Total settled in this payment</dt>
                      <dd>{exactMoney(payment.net_settled)}</dd>
                    </div>
                  </dl>
                </FormSection>

                <FormSection title="Invoice balance impact upon deletion">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Current outstanding balance</dt>
                      <dd>{exactMoney(currentInvoice.outstanding_balance)}</dd>
                    </div>
                    <div>
                      <dt>Re-opened balance after deletion</dt>
                      <dd>
                        {exactMoney(balanceAfterDeletion)}
                        <small>+{exactMoney(payment.net_settled)} balance restored</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Projected invoice status</dt>
                      <dd>PENDING</dd>
                    </div>
                  </dl>
                </FormSection>

                <div className="cf-demo-actions">
                  <Button
                    disabled={pending || !allowed}
                    onClick={() => void executeStep1('step2-form')}
                  >
                    {pending ? 'Deleting…' : 'Confirm Deletion & Proceed to Step 2'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending || !allowed}
                    onClick={() => void executeStep1('result-deleted-only')}
                  >
                    Delete Only (No Replacement)
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={requestClose}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : step === 'step2-recovery' ? (
              /* STEP 2: FAILURE RECOVERY STATE */
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    padding: 16,
                    backgroundColor: 'var(--accent)',
                    borderRadius: 6,
                    border: '1px solid var(--destructive)',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      Step 1 Completed: Payment #{payment.id} ({exactMoney(payment.net_settled)}) was deleted from the ledger.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <ShieldAlert size={16} style={{ color: 'var(--destructive)' }} />
                    <span role="alert" className="cf-field-error" style={{ margin: 0, fontWeight: 500 }}>
                      Step 2 Failed: {error || 'Submission rejected by server validation.'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                    Because this is a two-step administrative correction rather than an atomic reversal, Step 1 has already taken effect. Invoice {payment.invoice_number} currently has an outstanding balance of {exactMoney(updatedOutstanding)}. You can edit your replacement inputs and retry, apply a verified preset, or finish without recording a replacement.
                  </p>
                </div>

                <div className="cf-demo-actions">
                  <Button
                    onClick={() => {
                      setStep('step2-form');
                      setError('');
                    }}
                  >
                    Modify & Retry Replacement
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (presets.length) {
                        setInput(presets[0]!.values);
                        setDirty(true);
                        setErrors({});
                        setError('');
                        setStep('step2-form');
                      }
                    }}
                  >
                    Apply Verified Preset
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep('result-deleted-only')}
                  >
                    Finish Without Replacement
                  </Button>
                </div>
              </div>
            ) : step === 'step2-form' ? (
              /* STEP 2: REPLACEMENT FORM */
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleReviewReplacement();
                }}
              >
                {/* Step 1 Completion Callout */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    backgroundColor: 'var(--accent)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    marginTop: 16,
                    marginBottom: 16,
                  }}
                >
                  <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--foreground)' }}>
                    <strong>Step 1 Complete:</strong> Payment #{payment.id} was permanently deleted. Invoice {payment.invoice_number} balance has re-opened to {exactMoney(updatedOutstanding)}.
                  </span>
                </div>

                {/* Verified Presets Toolbar */}
                <FormSection title="Verified settlement presets">
                  <p className="cf-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                    Select a verified scenario or customize replacement values:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {presets.map(p => (
                      <Button
                        key={p.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInput(p.values);
                          setDirty(true);
                          setErrors({});
                          setError('');
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </FormSection>

                {/* Monetary Inputs */}
                <FormSection title="Replacement payment amounts">
                  <div className="cf-reference-fields">
                    <div>
                      <label htmlFor="corr-cash">Cash payment amount (INR)</label>
                      <Input
                        id="corr-cash"
                        type="number"
                        step="0.01"
                        min="0"
                        value={input.payment_amount}
                        aria-invalid={Boolean(errors['payment_amount'])}
                        aria-describedby="error-corr-cash"
                        onChange={e => {
                          setInput({ ...input, payment_amount: Number(e.target.value) });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-corr-cash" message={errors['payment_amount']} />
                    </div>

                    <div>
                      <label htmlFor="corr-tds">TDS deduction amount (INR)</label>
                      <Input
                        id="corr-tds"
                        type="number"
                        step="0.01"
                        min="0"
                        value={input.tds_amount}
                        aria-invalid={Boolean(errors['tds_amount'])}
                        aria-describedby="error-corr-tds"
                        onChange={e => {
                          setInput({ ...input, tds_amount: Number(e.target.value) });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-corr-tds" message={errors['tds_amount']} />
                    </div>
                  </div>

                  {/* Real-time Settlement Calculator */}
                  <div
                    style={{
                      background: 'var(--accent)',
                      padding: 12,
                      borderRadius: 6,
                      marginTop: 12,
                      fontSize: 13,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 8,
                    }}
                  >
                    <div>
                      <span className="cf-muted">Proposed settlement:</span>{' '}
                      <strong>{exactMoney(totalSettling)}</strong>
                    </div>
                    <div>
                      <span className="cf-muted">Projected remaining:</span>{' '}
                      <strong className={isOverpaid ? 'cf-field-error' : ''}>
                        {exactMoney(projectedRemaining)}
                      </strong>
                    </div>
                  </div>

                  {isOverpaid && (
                    <p className="cf-field-error" role="alert" style={{ marginTop: 8 }}>
                      Total settlement of ₹{totalSettling} exceeds the re-opened balance of ₹{updatedOutstanding}
                    </p>
                  )}
                </FormSection>

                {/* Metadata Fields */}
                <FormSection title="Transaction metadata">
                  <div className="cf-reference-fields">
                    <div>
                      <label htmlFor="corr-mode">Payment mode</label>
                      <select
                        id="corr-mode"
                        value={input.payment_mode}
                        onChange={e => {
                          setInput({ ...input, payment_mode: e.target.value as any });
                          setDirty(true);
                        }}
                      >
                        {VALID_PAYMENT_MODES.map(m => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="corr-section">TDS section</label>
                      <select
                        id="corr-section"
                        value={input.tds_section || ''}
                        onChange={e => {
                          setInput({ ...input, tds_section: e.target.value });
                          setDirty(true);
                        }}
                      >
                        <option value="">None / Not applicable</option>
                        <option value="194C (1%)">194C (1% - Contractors)</option>
                        <option value="194C (2%)">194C (2% - Companies)</option>
                        <option value="194J (2%)">194J (2% - Technical services)</option>
                        <option value="194J (10%)">194J (10% - Professional services)</option>
                        <option value="194Q (0.1%)">194Q (0.1% - Purchase of goods)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="corr-date">Payment date</label>
                      <Input
                        id="corr-date"
                        type="date"
                        value={input.payment_date}
                        aria-invalid={Boolean(errors['payment_date'])}
                        aria-describedby="error-corr-date"
                        onChange={e => {
                          setInput({ ...input, payment_date: e.target.value });
                          setDirty(true);
                        }}
                      />
                      <FieldError id="error-corr-date" message={errors['payment_date']} />
                    </div>

                    <div>
                      <label htmlFor="corr-remittance">Remittance / UTR number</label>
                      <Input
                        id="corr-remittance"
                        type="text"
                        placeholder="e.g. UTR-AXIS-9918273645-CORR"
                        value={input.remittance_number || ''}
                        onChange={e => {
                          setInput({ ...input, remittance_number: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label htmlFor="corr-notes">Audit notes</label>
                    <Textarea
                      id="corr-notes"
                      rows={2}
                      value={input.notes || ''}
                      placeholder="Reason for administrative correction..."
                      onChange={e => {
                        setInput({ ...input, notes: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </div>
                </FormSection>

                <div className="cf-demo-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('result-deleted-only')}
                  >
                    Skip Replacement & Finish
                  </Button>
                  <Button
                    type="submit"
                    disabled={isOverpaid || totalSettling <= 0}
                  >
                    Review Replacement Changes
                  </Button>
                </div>
              </form>
            ) : step === 'step2-review' && review ? (
              /* STEP 2: REVIEW & GUARD */
              <div>
                <FormSection title="Replacement settlement summary">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Invoice</dt>
                      <dd>{payment.invoice_number}</dd>
                    </div>
                    <div>
                      <dt>Customer</dt>
                      <dd>{payment.customer_name}</dd>
                    </div>
                    <div>
                      <dt>Payment Mode</dt>
                      <dd>{input.payment_mode}</dd>
                    </div>
                    <div>
                      <dt>Payment Date</dt>
                      <dd>{dateLabel(input.payment_date)}</dd>
                    </div>
                    <div>
                      <dt>Remittance Number</dt>
                      <dd>{input.remittance_number || '—'}</dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Diff View */}
                <FormSection title="Balance impact after replacement">
                  <dl className="cf-change-list">
                    <div className="cf-change-row">
                      <dt>Cash Collected</dt>
                      <dd>
                        <span className="cf-change-prev">₹0.00</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">+{exactMoney(cash)}</strong>
                      </dd>
                    </div>
                    {tds > 0 && (
                      <div className="cf-change-row">
                        <dt>TDS Recognized</dt>
                        <dd>
                          <span className="cf-change-prev">₹0.00</span>
                          <span className="cf-change-arrow" aria-hidden="true">→</span>
                          <strong className="cf-change-curr">+{exactMoney(tds)}</strong>
                        </dd>
                      </div>
                    )}
                    <div className="cf-change-row">
                      <dt>Total Settled</dt>
                      <dd>
                        <span className="cf-change-prev">₹0.00</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">+{exactMoney(totalSettling)}</strong>
                      </dd>
                    </div>
                    <div className="cf-change-row">
                      <dt>Outstanding Balance</dt>
                      <dd>
                        <span className="cf-change-prev">{exactMoney(updatedOutstanding)}</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">{exactMoney(review.resulting_outstanding)}</strong>
                      </dd>
                    </div>
                    <div className="cf-change-row">
                      <dt>Invoice Status</dt>
                      <dd>
                        <span className="cf-change-prev">PENDING</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">{review.resulting_status}</strong>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Review-Only Guard for Demo Mode */}
                {review.supported ? (
                  <p className="cf-drawer-message" role="status">
                    {review.message}
                  </p>
                ) : (
                  <p className="cf-drawer-message" role="status">
                    Review only: custom inputs have no verified scenario outcome. In demo mode, only pre-verified payment scenarios can be confirmed.
                  </p>
                )}

                <div className="cf-demo-actions">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setStep('step2-form')}
                  >
                    Back to Edit
                  </Button>
                  {review.supported && (
                    <Button
                      disabled={pending || !allowed}
                      onClick={() => void confirmReplacement()}
                    >
                      {pending ? 'Recording…' : 'Confirm Replacement Payment'}
                    </Button>
                  )}
                </div>
              </div>
            ) : step === 'result-success' ? (
              /* RESULT: SUCCESS */
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <CheckCircle2
                  size={48}
                  style={{ color: 'var(--primary)', margin: '0 auto 16px' }}
                />
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Administrative Correction Completed
                </h3>
                <p className="cf-muted" style={{ maxWidth: 440, margin: '0 auto 24px', fontSize: 14 }}>
                  Payment #{payment.id} was permanently deleted and replaced with a new payment record.
                  Invoice {payment.invoice_number} outstanding balance is now {exactMoney(currentInvoice.outstanding_balance)}.
                </p>
                <Button onClick={close}>
                  Return to workspace
                </Button>
              </div>
            ) : step === 'result-deleted-only' ? (
              /* RESULT: DELETED ONLY */
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <CheckCircle2
                  size={48}
                  style={{ color: 'var(--primary)', margin: '0 auto 16px' }}
                />
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Payment #{payment.id} Deleted
                </h3>
                <p className="cf-muted" style={{ maxWidth: 440, margin: '0 auto 24px', fontSize: 14 }}>
                  Payment #{payment.id} was permanently deleted. No replacement payment was created.
                  Invoice {payment.invoice_number} balance has re-opened to {exactMoney(currentInvoice.outstanding_balance)}.
                </p>
                <Button onClick={close}>
                  Return to workspace
                </Button>
              </div>
            ) : null}

            {error && (
              <p className="cf-field-error" role="alert">
                {error}
              </p>
            )}

            {discard && (
              <div className="cf-discard">
                <p>
                  {step1Completed
                    ? 'Step 1 deletion was already applied to the ledger. Discard replacement inputs and finish?'
                    : 'Discard unsaved payment correction inputs?'}
                </p>
                <Button variant="outline" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button onClick={close}>
                  {step1Completed ? 'Finish without replacement' : 'Discard inputs'}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
