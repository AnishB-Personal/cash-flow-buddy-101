import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { exactMoney, money, type Invoice } from '@/data/collectflow';
import { agingAsOf, dateLabel } from '@/data/records';
import {
  orderSchema,
  orderPermitted,
  reviewOrder,
  type OrderAction,
  type OrderInput,
  type OrderReview,
} from '@/data/orders';
import { useMockSession } from './session';
import { FormSection, FieldError } from './demo-controls';

export type OrderOperation = {
  action: OrderAction;
  target: string;
  label: string;
  values: OrderInput;
  example: OrderInput;
  record?: Invoice | null;
};

export function OrderWorkflowModal({
  operation,
  container,
  close,
}: {
  operation: OrderOperation;
  container?: HTMLElement | null | undefined;
  close: () => void;
}) {
  const { role, fy, references, demo, confirmOrder, revision } = useMockSession();
  const [input, setInput] = useState<OrderInput>(operation.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'confirm' | 'result'>('form');
  const [review, setReview] = useState<OrderReview | null>(null);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const origin = useRef({ revision, fy, role });
  const trigger = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement));
  const allowed = orderPermitted(role, operation.action);

  function requestClose() {
    if (pending) return;
    if (dirty && step !== 'result') setDiscard(true);
    else close();
  }

  function prepare() {
    const parsed = orderSchema(operation.action).safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    try {
      const rev = reviewOrder(operation.action, operation.target, parsed.data, role, demo.invoices, references, fy);
      setReview(rev);
      setStep('review');
      setError('');
      origin.current = { revision, fy, role };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed. Try again.');
    }
  }

  async function confirm() {
    if (!review || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      if (origin.current.revision !== revision || origin.current.fy !== fy || origin.current.role !== role) {
        throw new Error('Context changed. Return to the form and review again.');
      }
      await confirmOrder(review);
      setStep('result');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. No changes applied. Try again.');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  const rec = operation.record || demo.invoices.find(inv => String(inv.id) === operation.target);
  const isIssued = Boolean(rec?.invoice_number && rec?.invoice_number.trim());

  // Calculated preview values for order create
  const qty = Number(input['quantity'] ?? '0');
  const price = Number(input['unit_price'] ?? '0');
  const taxRate = Number(input['tax_rate'] ?? '0.18');
  const previewTaxable = isNaN(qty) || isNaN(price) ? 0 : qty * price;
  const previewTax = previewTaxable * taxRate;
  const previewTotal = previewTaxable + previewTax;

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="cf-overlay" />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}
          onInteractOutside={event => event.preventDefault()}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
        >
          <header className="cf-drawer-header">
            <div>
              <Dialog.Title>{operation.label}</Dialog.Title>
              <Dialog.Description>Order-to-cash lifecycle · {agingAsOf()}</Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close order workflow" disabled={pending} onClick={requestClose}>
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body">
            <div className="cf-demo-progress">
              {['Form', 'Review', 'Confirm', 'Result'].map(label => (
                <span key={label} aria-current={label.toLowerCase() === step ? 'step' : undefined}>
                  {label}
                </span>
              ))}
            </div>

            {!allowed ? (
              <p role="alert" className="cf-field-error">
                This role cannot perform this action. Permissions require {operation.action === 'order-create' ? 'finance, admin, or sales' : 'finance or admin'}.
              </p>
            ) : step === 'form' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  prepare();
                }}
              >
                {operation.action === 'order-create' && (
                  <>
                    <FormSection title="Order classification & customer">
                      <div className="cf-reference-fields">
                        <div>
                          <label htmlFor="ord-customer">Customer</label>
                          <select
                            id="ord-customer"
                            value={input['customer_id'] ?? '1'}
                            onChange={e => {
                              setInput({ ...input, customer_id: e.target.value });
                              setDirty(true);
                            }}
                          >
                            {references.customers.map(c => (
                              <option key={c.id} value={String(c.id)}>
                                {c.billing_name}
                              </option>
                            ))}
                          </select>
                          <FieldError id="error-customer_id" message={errors['customer_id']} />
                        </div>

                        <div>
                          <label htmlFor="ord-type">Order type</label>
                          <select
                            id="ord-type"
                            value={input['order_type'] ?? 'PO'}
                            onChange={e => {
                              const val = e.target.value;
                              setInput({
                                ...input,
                                order_type: val,
                                po_number: val === 'RECURRING' && !input['po_number'] ? 'Recurring / Direct Invoice' : (input['po_number'] ?? ''),
                              });
                              setDirty(true);
                            }}
                          >
                            <option value="PO">Purchase Order (PO)</option>
                            <option value="RECURRING">Recurring / Retainer</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="ord-po_number">PO number</label>
                          <Input
                            id="ord-po_number"
                            placeholder={input['order_type'] === 'RECURRING' ? 'Recurring / Direct Invoice' : 'PO-2026-001'}
                            value={input['po_number'] ?? ''}
                            aria-invalid={Boolean(errors['po_number'])}
                            aria-describedby="error-po_number"
                            onChange={e => {
                              setInput({ ...input, po_number: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-po_number" message={errors['po_number']} />
                        </div>

                        <div>
                          <label htmlFor="ord-po_date">Order / PO date</label>
                          <Input
                            id="ord-po_date"
                            type="date"
                            value={input['po_date'] ?? ''}
                            aria-invalid={Boolean(errors['po_date'])}
                            aria-describedby="error-po_date"
                            onChange={e => {
                              setInput({ ...input, po_date: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-po_date" message={errors['po_date']} />
                        </div>

                        <div>
                          <label htmlFor="ord-fy_code">Financial year</label>
                          <select
                            id="ord-fy_code"
                            value={input['fy_code'] ?? fy}
                            onChange={e => {
                              setInput({ ...input, fy_code: e.target.value });
                              setDirty(true);
                            }}
                          >
                            {references.years.map(y => (
                              <option key={y.code} value={y.code}>
                                {y.code}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="ord-executive">Sales executive</label>
                          <select
                            id="ord-executive"
                            value={input['executive_id'] ?? '3'}
                            onChange={e => {
                              setInput({ ...input, executive_id: e.target.value });
                              setDirty(true);
                            }}
                          >
                            <option value="3">Neha Rao</option>
                            <option value="4">Kavya Nair</option>
                            <option value="5">Arjun Mehta</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="ord-currency">Currency</label>
                          <select
                            id="ord-currency"
                            value={input['currency'] ?? 'INR'}
                            onChange={e => {
                              const curr = e.target.value;
                              setInput({ ...input, currency: curr, exchange_rate: curr === 'INR' ? '1' : (input['exchange_rate'] ?? '1') });
                              setDirty(true);
                            }}
                          >
                            <option value="INR">INR (₹)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="AED">AED (AED)</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="ord-rate">Exchange rate</label>
                          <Input
                            id="ord-rate"
                            type="number"
                            step="any"
                            disabled={input['currency'] === 'INR'}
                            value={input['exchange_rate'] ?? '1'}
                            aria-invalid={Boolean(errors['exchange_rate'])}
                            onChange={e => {
                              setInput({ ...input, exchange_rate: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-exchange_rate" message={errors['exchange_rate']} />
                        </div>
                      </div>
                    </FormSection>

                    <FormSection title="Line item & commercials">
                      <div className="cf-reference-fields">
                        <div>
                          <label htmlFor="ord-desc">Description</label>
                          <Input
                            id="ord-desc"
                            value={input['line_item_description'] ?? ''}
                            placeholder="Services or deliverables"
                            aria-invalid={Boolean(errors['line_item_description'])}
                            aria-describedby="error-desc"
                            onChange={e => {
                              setInput({ ...input, line_item_description: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-desc" message={errors['line_item_description']} />
                        </div>

                        <div>
                          <label htmlFor="ord-qty">Quantity</label>
                          <Input
                            id="ord-qty"
                            type="number"
                            step="any"
                            value={input['quantity'] ?? '1'}
                            aria-invalid={Boolean(errors['quantity'])}
                            onChange={e => {
                              setInput({ ...input, quantity: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-quantity" message={errors['quantity']} />
                        </div>

                        <div>
                          <label htmlFor="ord-price">Unit price (₹)</label>
                          <Input
                            id="ord-price"
                            type="number"
                            step="any"
                            value={input['unit_price'] ?? '0'}
                            aria-invalid={Boolean(errors['unit_price'])}
                            onChange={e => {
                              setInput({ ...input, unit_price: e.target.value });
                              setDirty(true);
                            }}
                          />
                          <FieldError id="error-unit_price" message={errors['unit_price']} />
                        </div>

                        <div>
                          <label htmlFor="ord-tax">GST tax rate</label>
                          <select
                            id="ord-tax"
                            value={input['tax_rate'] ?? '0.18'}
                            onChange={e => {
                              setInput({ ...input, tax_rate: e.target.value });
                              setDirty(true);
                            }}
                          >
                            <option value="0.18">GST 18% (Standard IT & Services)</option>
                            <option value="0.28">GST 28% (Hardware)</option>
                            <option value="0.12">GST 12% (IT Goods)</option>
                            <option value="0.05">GST 5% (Basic Goods)</option>
                            <option value="0">0% (SEZ / Export / Exempt)</option>
                          </select>
                        </div>
                      </div>

                      <div className="cf-detail-line" style={{ marginTop: 12 }}>
                        <div>
                          <strong>Computed order value:</strong>
                          <small>
                            Taxable: {exactMoney(previewTaxable)} + GST: {exactMoney(previewTax)}
                          </small>
                        </div>
                        <strong>{exactMoney(previewTotal)}</strong>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label htmlFor="ord-remarks">Remarks (optional)</label>
                        <Textarea
                          id="ord-remarks"
                          value={input['remarks'] ?? ''}
                          placeholder="Internal remarks"
                          onChange={e => {
                            setInput({ ...input, remarks: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </div>
                    </FormSection>
                  </>
                )}

                {operation.action === 'order-convert' && rec && (
                  <FormSection title="Conversion to commercial invoice">
                    <dl className="cf-detail-grid">
                      <div>
                        <dt>PO Number</dt>
                        <dd>{rec.po_number}</dd>
                      </div>
                      <div>
                        <dt>Customer</dt>
                        <dd>{rec.customer_name}</dd>
                      </div>
                      <div>
                        <dt>Order Value</dt>
                        <dd>{exactMoney(rec.total_amount)}</dd>
                      </div>
                      <div>
                        <dt>Financial Year</dt>
                        <dd>{rec.fy_code}</dd>
                      </div>
                    </dl>

                    <div className="cf-reference-fields" style={{ marginTop: 16 }}>
                      <div>
                        <label htmlFor="conv-inv-num">Invoice number</label>
                        <Input
                          id="conv-inv-num"
                          placeholder="INV-2026-045"
                          value={input['invoice_number'] ?? ''}
                          aria-invalid={Boolean(errors['invoice_number'])}
                          aria-describedby="error-inv-num"
                          onChange={e => {
                            setInput({ ...input, invoice_number: e.target.value });
                            setDirty(true);
                          }}
                        />
                        <FieldError id="error-inv-num" message={errors['invoice_number']} />
                      </div>

                      <div>
                        <label htmlFor="conv-inv-date">Invoice date</label>
                        <Input
                          id="conv-inv-date"
                          type="date"
                          value={input['invoice_date'] ?? ''}
                          aria-invalid={Boolean(errors['invoice_date'])}
                          aria-describedby="error-inv-date"
                          onChange={e => {
                            setInput({ ...input, invoice_date: e.target.value });
                            setDirty(true);
                          }}
                        />
                        <FieldError id="error-inv-date" message={errors['invoice_date']} />
                      </div>

                      <div>
                        <label htmlFor="conv-due-date">Due date (Net-30 default)</label>
                        <Input
                          id="conv-due-date"
                          type="date"
                          value={input['due_date'] ?? ''}
                          placeholder="Defaults to Net-30"
                          aria-invalid={Boolean(errors['due_date'])}
                          onChange={e => {
                            setInput({ ...input, due_date: e.target.value });
                            setDirty(true);
                          }}
                        />
                        <FieldError id="error-due-date" message={errors['due_date']} />
                      </div>
                    </div>
                  </FormSection>
                )}

                {operation.action === 'order-edit' && rec && (
                  <FormSection title={isIssued ? 'Invoice metadata' : 'Order metadata'}>
                    <div className="cf-lock-note">
                      <ShieldCheck size={18} />
                      <span>
                        {isIssued
                          ? 'Issued invoice · Commercial identifiers, PO number, customer and financial totals are legally locked.'
                          : 'Unbilled order · Metadata and line item descriptions can be updated before invoicing.'}
                      </span>
                    </div>

                    <div className="cf-reference-fields" style={{ marginTop: 14 }}>
                      {!isIssued && (
                        <>
                          <div>
                            <label htmlFor="edit-po_number">PO number</label>
                            <Input
                              id="edit-po_number"
                              value={input['po_number'] ?? ''}
                              onChange={e => {
                                setInput({ ...input, po_number: e.target.value });
                                setDirty(true);
                              }}
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-po_date">PO date</label>
                            <Input
                              id="edit-po_date"
                              type="date"
                              value={input['po_date'] ?? ''}
                              onChange={e => {
                                setInput({ ...input, po_date: e.target.value });
                                setDirty(true);
                              }}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label htmlFor="edit-due_date">Due date</label>
                        <Input
                          id="edit-due_date"
                          type="date"
                          value={input['due_date'] ?? ''}
                          onChange={e => {
                            setInput({ ...input, due_date: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </div>

                      <div>
                        <label htmlFor="edit-item-desc">Line item description</label>
                        <Input
                          id="edit-item-desc"
                          value={input['item_description'] ?? ''}
                          onChange={e => {
                            setInput({ ...input, item_description: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label htmlFor="edit-remarks">Remarks</label>
                      <Textarea
                        id="edit-remarks"
                        value={input['remarks'] ?? ''}
                        onChange={e => {
                          setInput({ ...input, remarks: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </div>
                  </FormSection>
                )}

                {operation.action === 'order-delete' && rec && (
                  <FormSection title="Delete unbilled order">
                    <p>
                      Permanently delete unbilled order <strong>{rec.po_number}</strong> ({rec.customer_name}, value {exactMoney(rec.total_amount)})?
                    </p>
                    <p className="cf-muted">
                      Issued invoices and orders with recorded payments cannot be deleted.
                    </p>
                  </FormSection>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setInput(operation.example);
                      setDirty(true);
                      setErrors({});
                      setError('');
                    }}
                  >
                    Use verified example
                  </Button>
                </div>

                <div className="cf-demo-actions">
                  <Button type="submit">
                    Review changes <ArrowUpRight size={16} />
                  </Button>
                </div>
              </form>
            ) : step === 'result' ? (
              <FormSection title="Demo result">
                <p role="status">
                  Verified demo change applied. Live records and dashboard KPIs have been updated.
                </p>
                <Button variant="outline" onClick={close}>
                  Return to workspace
                </Button>
              </FormSection>
            ) : review ? (
              <>
                <FormSection title="Intended document change">
                  <dl className="cf-detail-grid">
                    <div>
                      <dt>Action</dt>
                      <dd>{operation.label}</dd>
                    </div>
                    <div>
                      <dt>Record</dt>
                      <dd>{rec ? rec.invoice_number || rec.po_number : (input['po_number'] || 'New Order')}</dd>
                    </div>
                    {operation.action === 'order-create' && (
                      <>
                        <div>
                          <dt>Customer</dt>
                          <dd>{references.customers.find(c => String(c.id) === input['customer_id'])?.billing_name || 'Acme'}</dd>
                        </div>
                        <div>
                          <dt>Order Value</dt>
                          <dd>{exactMoney(previewTotal)}</dd>
                        </div>
                      </>
                    )}
                    {operation.action === 'order-convert' && (
                      <>
                        <div>
                          <dt>Assigned Invoice #</dt>
                          <dd>{input['invoice_number']}</dd>
                        </div>
                        <div>
                          <dt>Invoice Date</dt>
                          <dd>{dateLabel(input['invoice_date'] ?? null)}</dd>
                        </div>
                        <div>
                          <dt>Due Date</dt>
                          <dd>{dateLabel(input['due_date'] || input['invoice_date'] || null)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </FormSection>

                <FormSection title={step === 'confirm' ? 'Confirmed field change set' : 'Planned field changes'}>
                  {review.changes.length > 0 ? (
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
                  ) : (
                    <p className="cf-muted">No field modifications detected.</p>
                  )}
                </FormSection>

                <p className="cf-drawer-message" role="status">
                  {review.message}
                </p>

                <FormSection title="Financial review & impact">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Invoiced total impact</dt>
                      <dd>
                        {review.impact.invoicedDelta > 0 ? `+${money(review.impact.invoicedDelta)}` : 'Unchanged'}
                        <small>{review.impact.invoicedDelta > 0 ? 'Converts to issued receivable' : 'Unbilled orders are not receivables'}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Issued receivables impact</dt>
                      <dd>
                        {review.impact.outstandingDelta > 0 ? `+${money(review.impact.outstandingDelta)}` : 'Unchanged'}
                        <small>Past settlements and cash collected remain intact</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Unbilled orders impact</dt>
                      <dd>
                        {review.impact.unbilledDelta !== 0
                          ? `${review.impact.unbilledDelta > 0 ? '+' : ''}${money(review.impact.unbilledDelta)}`
                          : 'Unchanged'}
                        <small>Billing pipeline</small>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {step === 'confirm' && (
                  <p className="cf-drawer-message">
                    Confirm {operation.label.toLowerCase()} in this isolated demo?
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
                        : `Confirm ${operation.label.toLowerCase()}`}
                    </Button>
                  )}
                </div>
              </>
            ) : null}

            {error && <p className="cf-field-error" role="alert">{error}</p>}
            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved order inputs?</p>
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
