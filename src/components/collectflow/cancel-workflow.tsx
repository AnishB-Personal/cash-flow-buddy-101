import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, CheckCircle2, ShieldAlert, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exactMoney, money, type Invoice } from '@/data/collectflow';
import { invoiceAging, dateLabel, canPay } from '@/data/records';
import { useMockSession } from './session';
import { FormSection } from './demo-controls';
import { invoiceCancelSchema } from '@/data/payments';

export const CANCELLATION_REASON_PRESETS = [
  'Client rescinded contract / project scope cancelled',
  'Duplicate invoice issued in error',
  'Incorrect billing entity or GSTIN',
  'Re-issuance required with updated commercial terms',
] as const;

export function CancelInvoiceDrawer({
  invoice,
  container,
  close,
}: {
  invoice: Invoice;
  container?: HTMLElement | null | undefined;
  close: () => void;
}) {
  const { role, revision, cancelInvoice } = useMockSession();
  const [reason, setReason] = useState<string>('');
  const [step, setStep] = useState<'form' | 'review' | 'confirm' | 'result'>('form');
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const origin = useRef({ revision, role });
  const trigger = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement)
  );

  const allowed = canPay(role);
  const hasPayments = invoice.payments && invoice.payments.length > 0;
  const isCancelled = invoice.computed_status === 'CANCELLED' || invoice.payment_status === 'CANCELLED';

  function requestClose() {
    if (pending) return;
    if (dirty && step !== 'result') setDiscard(true);
    else close();
  }

  function handleReview() {
    const result = invoiceCancelSchema.safeParse({ invoice_id: invoice.id, reason });
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Reason is mandatory for cancellation');
      return;
    }
    setError('');
    setStep('review');
  }

  async function handleConfirm() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      if (origin.current.revision !== revision || origin.current.role !== role) {
        throw new Error('Context changed. Return to the form and review again.');
      }
      await cancelInvoice({ invoice_id: invoice.id, reason: reason.trim() });
      setStep('result');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancellation failed. Try again.');
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
          aria-describedby="cancel-invoice-description"
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
              <span className="cf-kicker">INVOICE CANCELLATION</span>
              <Dialog.Title>Cancel Invoice · {invoice.invoice_number || invoice.po_number}</Dialog.Title>
              <Dialog.Description id="cancel-invoice-description">
                {invoice.customer_name} · Outstanding: {exactMoney(invoice.outstanding_balance)}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close cancellation workflow"
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
            ) : isCancelled ? (
              <p role="alert" className="cf-field-error">
                Invoice is already cancelled.
              </p>
            ) : hasPayments ? (
              /* Strict Payment Cancellation Guard (FastAPI Parity) */
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 16,
                    backgroundColor: 'var(--accent)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}
                >
                  <ShieldAlert size={22} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14, color: 'var(--foreground)', marginBottom: 4 }}>
                      Cancellation Blocked: Active Payments Recorded
                    </strong>
                    <p role="alert" className="cf-field-error" style={{ margin: 0, fontWeight: 500 }}>
                      Cannot cancel invoice with existing payments. All payments must be deleted/reversed first.
                    </p>
                  </div>
                </div>

                <FormSection title={`Recorded payments on this invoice (${invoice.payments.length})`}>
                  <p className="cf-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                    To uphold financial integrity and legal immutability, all recorded cash and TDS transactions must be physically deleted before this invoice can be cancelled.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {invoice.payments.map(payment => (
                      <div
                        key={payment.id}
                        className="cf-detail-line"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: 12,
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'var(--card)',
                        }}
                      >
                        <div>
                          <strong>
                            {payment.payment_mode} · {dateLabel(payment.payment_date)}
                          </strong>
                          <small style={{ display: 'block', color: 'var(--muted-foreground)', marginTop: 2 }}>
                            {payment.remittance_number || `Payment #${payment.id}`}
                          </small>
                          {payment.tds_amount > 0 && (
                            <small style={{ display: 'block', color: 'var(--muted-foreground)' }}>
                              TDS {payment.tds_section || ''}: {money(payment.tds_amount)}
                            </small>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ display: 'block' }}>{money(payment.payment_amount)}</strong>
                          <small style={{ color: 'var(--muted-foreground)' }}>
                            Settled: {money(payment.payment_amount + (payment.tds_amount || 0))}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </FormSection>

                <div className="cf-contract-item" style={{ marginTop: 16 }}>
                  <p className="cf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <strong>Next Steps:</strong> Navigate to the <strong>Payments Ledger</strong> and select <em>Correct / Reverse Payment</em> on each payment record associated with {invoice.invoice_number}. Once the payments are removed and the balance is re-opened, you can return here to cancel the invoice.
                  </p>
                </div>

                <div className="cf-demo-actions">
                  <Button variant="outline" onClick={requestClose}>
                    Close
                  </Button>
                </div>
              </div>
            ) : step === 'form' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleReview();
                }}
              >
                {/* Document Information Snapshot */}
                <FormSection title="Commercial invoice details">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Invoice number</dt>
                      <dd>{invoice.invoice_number || invoice.po_number}</dd>
                    </div>
                    <div>
                      <dt>Customer name</dt>
                      <dd>{invoice.customer_name}</dd>
                    </div>
                    <div>
                      <dt>Total invoiced amount</dt>
                      <dd>{exactMoney(invoice.total_amount)}</dd>
                    </div>
                    <div>
                      <dt>Current outstanding balance</dt>
                      <dd>{exactMoney(invoice.outstanding_balance)}</dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Verified Reason Presets */}
                <FormSection title="Verified cancellation presets">
                  <p className="cf-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                    Select an auditable business reason or provide detailed notes below:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CANCELLATION_REASON_PRESETS.map(preset => (
                      <Button
                        key={preset}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReason(preset);
                          setDirty(true);
                          setError('');
                        }}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </FormSection>

                {/* Mandatory Cancellation Reason */}
                <FormSection title="Mandatory cancellation reason">
                  <div>
                    <label
                      htmlFor="cancel-reason"
                      style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}
                    >
                      Audit reason (required)
                    </label>
                    <Textarea
                      id="cancel-reason"
                      rows={4}
                      maxLength={500}
                      placeholder="Enter legal/commercial justification for cancellation..."
                      value={reason}
                      aria-invalid={Boolean(error)}
                      aria-describedby="cancel-reason-help"
                      onChange={e => {
                        setReason(e.target.value);
                        setDirty(true);
                        setError('');
                      }}
                    />
                    <div
                      id="cancel-reason-help"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 4,
                        fontSize: 12,
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      <span>Reason will be recorded in backend audit logs and appended to remarks.</span>
                      <span>{reason.length} / 500 characters</span>
                    </div>
                  </div>
                </FormSection>

                {error && (
                  <p className="cf-field-error" role="alert">
                    {error}
                  </p>
                )}

                <div className="cf-demo-actions">
                  <Button type="button" variant="outline" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!reason.trim()}
                  >
                    Review cancellation
                  </Button>
                </div>
              </form>
            ) : step === 'result' ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <CheckCircle2
                  size={48}
                  style={{ color: 'var(--primary)', margin: '0 auto 16px' }}
                />
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Invoice Successfully Cancelled
                </h3>
                <p className="cf-muted" style={{ maxWidth: 420, margin: '0 auto 24px', fontSize: 14 }}>
                  Invoice #{invoice.invoice_number || invoice.po_number} has transitioned to CANCELLED status.
                  Outstanding balance has been reduced to ₹0.00 and excluded from AR aging buckets.
                </p>
                <Button onClick={close}>
                  Return to workspace
                </Button>
              </div>
            ) : (
              /* Review & Confirm Steps */
              <div>
                <FormSection title="Document & reason snapshot">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Invoice</dt>
                      <dd>{invoice.invoice_number || invoice.po_number}</dd>
                    </div>
                    <div>
                      <dt>Customer</dt>
                      <dd>{invoice.customer_name}</dd>
                    </div>
                    <div>
                      <dt>Audit Reason</dt>
                      <dd style={{ maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word' }}>
                        {reason.trim()}
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Diff View */}
                <FormSection
                  title={step === 'confirm' ? 'Confirmed lifecycle changes' : 'Planned lifecycle changes'}
                >
                  <dl className="cf-change-list">
                    <div className="cf-change-row">
                      <dt>Payment Status</dt>
                      <dd>
                        <span className="cf-change-prev">{invoice.computed_status}</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">CANCELLED</strong>
                      </dd>
                    </div>
                    <div className="cf-change-row">
                      <dt>Outstanding Balance</dt>
                      <dd>
                        <span className="cf-change-prev">{exactMoney(invoice.outstanding_balance)}</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">₹0.00</strong>
                      </dd>
                    </div>
                    <div className="cf-change-row">
                      <dt>AR Aging Bucket</dt>
                      <dd>
                        <span className="cf-change-prev">{invoiceAging(invoice) || 'Current / Not Due'}</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">Excluded</strong>
                      </dd>
                    </div>
                    <div className="cf-change-row">
                      <dt>Document Remarks</dt>
                      <dd>
                        <span className="cf-change-prev">{invoice.remarks || '—'}</span>
                        <span className="cf-change-arrow" aria-hidden="true">→</span>
                        <strong className="cf-change-curr">[CANCELLED: {reason.trim()}]</strong>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Financial Review & Impact */}
                <FormSection title="Financial review & impact">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Receivables reduction</dt>
                      <dd>
                        -{exactMoney(invoice.outstanding_balance)}
                        <small>Removed from active company receivables</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Historical commercial amount</dt>
                      <dd>
                        {exactMoney(invoice.total_amount)}
                        <small>Preserved for audit trail integrity</small>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {step === 'confirm' && (
                  <div
                    style={{
                      padding: 14,
                      background: 'var(--accent)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      margin: '16px 0',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--foreground)' }}>
                      <strong>Irreversible Action:</strong> Confirming cancellation of commercial invoice{' '}
                      <strong>{invoice.invoice_number || invoice.po_number}</strong> will permanently zero its balance and exclude it from collections reporting. This cannot be undone.
                    </p>
                  </div>
                )}

                <div className="cf-demo-actions">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (step === 'confirm') setStep('review');
                      else setStep('form');
                      setError('');
                    }}
                  >
                    {step === 'confirm' ? 'Back to review' : 'Back to form'}
                  </Button>
                  <Button
                    variant={step === 'confirm' ? 'destructive' : 'default'}
                    disabled={pending || !allowed}
                    onClick={() => {
                      if (step === 'review') setStep('confirm');
                      else void handleConfirm();
                    }}
                  >
                    {pending
                      ? 'Cancelling…'
                      : step === 'review'
                      ? 'Continue to confirmation'
                      : 'Confirm Cancellation'}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <p className="cf-field-error" role="alert">
                {error}
              </p>
            )}

            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved cancellation inputs?</p>
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
