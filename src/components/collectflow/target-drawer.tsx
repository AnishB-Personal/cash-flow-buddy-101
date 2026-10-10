import { useState, useRef, useEffect, useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, CheckCircle2, ShieldAlert, ArrowRight, ClipboardCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, exactMoney } from '@/data/collectflow';
import fixtures from '@/data/collectflow.json';
import { useMockSession } from './session';
import { FormSection, FieldError } from './demo-controls';
import {
  type SalesTarget,
  type TargetUpdateInput,
  type TargetReview,
  targetUpdateSchema,
  deriveTargetBreakdown,
  reviewTarget,
  calculateExecutiveAchievement,
  canManageTargets,
  roundCurrency,
} from '@/data/targets';

export interface TargetDrawerProps {
  target?: SalesTarget | null | undefined;
  initialZero?: boolean | undefined;
  defaultUserId?: number | undefined;
  container?: HTMLElement | null | undefined;
  close: () => void;
}

const PRESET_AMOUNTS = [
  { label: '₹40,00,000', amount: 4000000 },
  { label: '₹35,00,000', amount: 3500000 },
  { label: '₹50,00,000', amount: 5000000 },
  { label: 'Zero Target', amount: 0 },
];

export function TargetDrawer({
  target,
  initialZero = false,
  defaultUserId,
  container,
  close,
}: TargetDrawerProps) {
  const { role, fy, revision, confirmTarget, targets, demo, references } = useMockSession();
  const salesUsers = fixtures.users.filter(u => u.role === 'sales');
  const years = references?.years?.map(y => y.code) ?? ['FY 2026-27', 'FY 2025-26', 'FY 2024-25'];

  const initialUser =
    target?.user_id ??
    defaultUserId ??
    salesUsers[0]?.id ??
    3;
  const initialFy = target?.fy_code ?? fy;
  const initialYearly = initialZero ? 0 : (target?.yearly_target ?? 4000000);
  const initialBreakdown = deriveTargetBreakdown(initialYearly, target ?? undefined);

  const [input, setInput] = useState<TargetUpdateInput>({
    user_id: initialUser,
    fy_code: initialFy,
    yearly_target: initialYearly,
    half_yearly_target: initialBreakdown.half_yearly_target,
    quarterly_target: initialBreakdown.quarterly_target,
    monthly_target: initialBreakdown.monthly_target,
    monthly_bottom_line: initialBreakdown.monthly_bottom_line,
    yearly_bottom_line: initialBreakdown.yearly_bottom_line,
  });

  const [customOverride, setCustomOverride] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'confirm' | 'result'>('form');
  const [review, setReview] = useState<TargetReview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const origin = useRef({ revision, fy, role });
  const trigger = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement),
  );
  const allowed = canManageTargets(role);

  const selectedUser = salesUsers.find(u => u.id === input.user_id) ?? {
    id: input.user_id,
    full_name: target?.user_name ?? `User ${input.user_id}`,
    username: `user_${input.user_id}`,
  };
  const userName = selectedUser.full_name ?? selectedUser.username;

  // Existing target for this user and FY
  const existingTarget =
    target ??
    targets.find(t => t.user_id === input.user_id && t.fy_code === input.fy_code) ??
    null;

  function requestClose() {
    if (pending) return;
    if (dirty && step !== 'result') {
      setDiscard(true);
    } else {
      close();
    }
  }

  function handleYearlyChange(yearly: number) {
    const validYearly = isNaN(yearly) ? 0 : Math.max(0, yearly);
    if (!customOverride) {
      const breakdown = deriveTargetBreakdown(validYearly);
      setInput(prev => ({
        ...prev,
        yearly_target: validYearly,
        half_yearly_target: breakdown.half_yearly_target,
        quarterly_target: breakdown.quarterly_target,
        monthly_target: breakdown.monthly_target,
        monthly_bottom_line: breakdown.monthly_bottom_line,
        yearly_bottom_line: breakdown.yearly_bottom_line,
      }));
    } else {
      setInput(prev => ({
        ...prev,
        yearly_target: validYearly,
      }));
    }
    setDirty(true);
    if (errors['yearly_target']) {
      setErrors(prev => {
        const next = { ...prev };
        delete next['yearly_target'];
        return next;
      });
    }
  }

  function handleOverrideToggle(enabled: boolean) {
    setCustomOverride(enabled);
    setDirty(true);
    if (!enabled) {
      const breakdown = deriveTargetBreakdown(input.yearly_target);
      setInput(prev => ({
        ...prev,
        half_yearly_target: breakdown.half_yearly_target,
        quarterly_target: breakdown.quarterly_target,
        monthly_target: breakdown.monthly_target,
        monthly_bottom_line: breakdown.monthly_bottom_line,
        yearly_bottom_line: breakdown.yearly_bottom_line,
      }));
    }
  }

  function applyPreset(amount: number) {
    setCustomOverride(false);
    const breakdown = deriveTargetBreakdown(amount);
    setInput(prev => ({
      ...prev,
      yearly_target: amount,
      half_yearly_target: breakdown.half_yearly_target,
      quarterly_target: breakdown.quarterly_target,
      monthly_target: breakdown.monthly_target,
      monthly_bottom_line: breakdown.monthly_bottom_line,
      yearly_bottom_line: breakdown.yearly_bottom_line,
    }));
    setDirty(true);
    setErrors({});
    setError('');
  }

  function validate(): boolean {
    const payloadToValidate = customOverride
      ? input
      : {
          user_id: input.user_id,
          fy_code: input.fy_code,
          yearly_target: input.yearly_target,
        };

    const parsed = targetUpdateSchema.safeParse(payloadToValidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach(issue => {
        const path = issue.path[0]?.toString() ?? 'general';
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function prepareReview() {
    if (!validate()) return;
    try {
      const inputToReview: TargetUpdateInput = customOverride
        ? input
        : {
            user_id: input.user_id,
            fy_code: input.fy_code,
            yearly_target: input.yearly_target,
          };
      const rev = reviewTarget(inputToReview, existingTarget, demo.invoices);
      setReview(rev);
      setStep('review');
      setError('');
      origin.current = { revision, fy, role };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review calculation failed');
    }
  }

  async function executeConfirm() {
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
      await confirmTarget(review);
      setStep('result');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. No changes applied. Try again.');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  // Pre-calculate current baseline achievement for comparison
  const prevAch = existingTarget
    ? calculateExecutiveAchievement(
        existingTarget.user_id,
        demo.invoices,
        existingTarget.yearly_target,
        existingTarget.fy_code,
      )
    : null;

  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="cf-overlay" />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          aria-describedby="target-drawer-description"
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
              <span className="cf-kicker">SALES TARGET WORKFLOW</span>
              <Dialog.Title>
                {target ? `Edit Target · ${userName}` : 'Configure Sales Target'}
              </Dialog.Title>
              <Dialog.Description id="target-drawer-description">
                {userName} · {input.fy_code} · Annual quota and sub-period breakdown
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close target workflow"
              disabled={pending}
              onClick={requestClose}
            >
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body">
            {/* 4-step progress bar */}
            <div className="cf-demo-progress" aria-label="Target configuration workflow progress">
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
            ) : step === 'form' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  prepareReview();
                }}
              >
                {/* Verified Quota Presets */}
                <FormSection title="Verified quota presets">
                  <p className="cf-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                    Select an approved quota scenario or enter custom amounts:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PRESET_AMOUNTS.map(p => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyPreset(p.amount)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </FormSection>

                {/* Target Metadata & Representative */}
                <FormSection title="Target assignment">
                  <div className="cf-reference-fields">
                    <div>
                      <label htmlFor="target-rep">Sales Representative</label>
                      <select
                        id="target-rep"
                        value={input.user_id}
                        disabled={Boolean(target)}
                        onChange={e => {
                          const uid = Number(e.target.value);
                          setInput(prev => ({ ...prev, user_id: uid }));
                          setDirty(true);
                        }}
                      >
                        {salesUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.full_name ?? u.username} ({u.username})
                          </option>
                        ))}
                      </select>
                      <FieldError id="error-rep" message={errors['user_id']} />
                    </div>

                    <div>
                      <label htmlFor="target-fy">Financial Year</label>
                      <select
                        id="target-fy"
                        value={input.fy_code}
                        disabled={Boolean(target)}
                        onChange={e => {
                          setInput(prev => ({ ...prev, fy_code: e.target.value }));
                          setDirty(true);
                        }}
                      >
                        {years.map(y => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <FieldError id="error-fy" message={errors['fy_code']} />
                    </div>
                  </div>
                </FormSection>

                {/* Quota & Sub-periods */}
                <FormSection title="Annual target & sub-period arithmetic">
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="target-yearly">Annual Target (INR)</label>
                    <Input
                      id="target-yearly"
                      type="number"
                      step="0.01"
                      min="0"
                      value={input.yearly_target}
                      aria-invalid={Boolean(errors['yearly_target'])}
                      aria-describedby="error-target-yearly"
                      onChange={e => handleYearlyChange(Number(e.target.value))}
                    />
                    <FieldError id="error-target-yearly" message={errors['yearly_target']} />
                    <p className="cf-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      Formatted: {money(input.yearly_target)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                    <input
                      type="checkbox"
                      id="target-override-checkbox"
                      checked={customOverride}
                      onChange={e => handleOverrideToggle(e.target.checked)}
                    />
                    <label
                      htmlFor="target-override-checkbox"
                      style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                    >
                      Enable manual sub-period overrides (unverified custom input)
                    </label>
                  </div>

                  {!customOverride ? (
                    <div
                      style={{
                        background: 'var(--muted)',
                        padding: 12,
                        borderRadius: 6,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <span className="cf-muted">Half-Yearly (50%)</span>
                        <strong style={{ display: 'block', marginTop: 2 }}>
                          {money(input.half_yearly_target ?? roundCurrency(input.yearly_target / 2))}
                        </strong>
                      </div>
                      <div>
                        <span className="cf-muted">Quarterly (25%)</span>
                        <strong style={{ display: 'block', marginTop: 2 }}>
                          {money(input.quarterly_target ?? roundCurrency(input.yearly_target / 4))}
                        </strong>
                      </div>
                      <div>
                        <span className="cf-muted">Monthly (8.33%)</span>
                        <strong style={{ display: 'block', marginTop: 2 }}>
                          {money(input.monthly_target ?? roundCurrency(input.yearly_target / 12))}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="cf-reference-fields">
                      <div>
                        <label htmlFor="target-half">Half-Yearly Target (INR)</label>
                        <Input
                          id="target-half"
                          type="number"
                          step="0.01"
                          min="0"
                          value={input.half_yearly_target ?? ''}
                          onChange={e => {
                            setInput(prev => ({
                              ...prev,
                              half_yearly_target: Number(e.target.value),
                            }));
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div>
                        <label htmlFor="target-quarter">Quarterly Target (INR)</label>
                        <Input
                          id="target-quarter"
                          type="number"
                          step="0.01"
                          min="0"
                          value={input.quarterly_target ?? ''}
                          onChange={e => {
                            setInput(prev => ({
                              ...prev,
                              quarterly_target: Number(e.target.value),
                            }));
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div>
                        <label htmlFor="target-monthly">Monthly Target (INR)</label>
                        <Input
                          id="target-monthly"
                          type="number"
                          step="0.01"
                          min="0"
                          value={input.monthly_target ?? ''}
                          onChange={e => {
                            setInput(prev => ({
                              ...prev,
                              monthly_target: Number(e.target.value),
                            }));
                            setDirty(true);
                          }}
                        />
                      </div>
                      <div>
                        <label htmlFor="target-monthly-bl">Monthly Bottom Line (INR)</label>
                        <Input
                          id="target-monthly-bl"
                          type="number"
                          step="0.01"
                          min="0"
                          value={input.monthly_bottom_line ?? 0}
                          onChange={e => {
                            setInput(prev => ({
                              ...prev,
                              monthly_bottom_line: Number(e.target.value),
                            }));
                            setDirty(true);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </FormSection>

                {error && (
                  <p role="alert" className="cf-field-error">
                    {error}
                  </p>
                )}

                <div className="cf-drawer-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button variant="outline" type="button" onClick={requestClose}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      Review target changes <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              </form>
            ) : step === 'review' && review ? (
              <div>
                {/* Diff Comparison */}
                <FormSection title="Target quota comparison">
                  <table className="cf-table" style={{ marginTop: 8, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Previous Target</th>
                        <th>Proposed Target</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Annual Target</strong></td>
                        <td>{existingTarget ? money(review.diff.yearly_target.prev) : '— (New)'}</td>
                        <td><strong>{money(review.diff.yearly_target.curr)}</strong></td>
                        <td style={{ color: review.diff.yearly_target.curr >= review.diff.yearly_target.prev ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                          {existingTarget
                            ? `${review.diff.yearly_target.curr - review.diff.yearly_target.prev >= 0 ? '+' : ''}${money(review.diff.yearly_target.curr - review.diff.yearly_target.prev)}`
                            : '+New'}
                        </td>
                      </tr>
                      <tr>
                        <td>Half-Yearly</td>
                        <td>{existingTarget ? money(review.diff.half_yearly_target.prev) : '—'}</td>
                        <td>{money(review.diff.half_yearly_target.curr)}</td>
                        <td>
                          {existingTarget
                            ? `${review.diff.half_yearly_target.curr - review.diff.half_yearly_target.prev >= 0 ? '+' : ''}${money(review.diff.half_yearly_target.curr - review.diff.half_yearly_target.prev)}`
                            : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td>Quarterly</td>
                        <td>{existingTarget ? money(review.diff.quarterly_target.prev) : '—'}</td>
                        <td>{money(review.diff.quarterly_target.curr)}</td>
                        <td>
                          {existingTarget
                            ? `${review.diff.quarterly_target.curr - review.diff.quarterly_target.prev >= 0 ? '+' : ''}${money(review.diff.quarterly_target.curr - review.diff.quarterly_target.prev)}`
                            : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td>Monthly</td>
                        <td>{existingTarget ? money(review.diff.monthly_target.prev) : '—'}</td>
                        <td>{money(review.diff.monthly_target.curr)}</td>
                        <td>
                          {existingTarget
                            ? `${review.diff.monthly_target.curr - review.diff.monthly_target.prev >= 0 ? '+' : ''}${money(review.diff.monthly_target.curr - review.diff.monthly_target.prev)}`
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </FormSection>

                {/* Achievement Impact */}
                <FormSection title="Sales attainment impact">
                  <dl className="cf-review-values">
                    <div>
                      <dt>Previous achievement %</dt>
                      <dd>
                        {prevAch ? `${prevAch.achievement_pct}%` : '0.0%'}
                        <small>Based on current target</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Resulting achievement %</dt>
                      <dd>
                        <strong>{review.resultingAchievementPct.toFixed(1)}%</strong>
                        <small>Proposed attainment</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Actual sales turnover</dt>
                      <dd>
                        {money(prevAch?.actual_sales ?? 0)}
                        <small>Invoiced exclusive sales</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Remaining quota</dt>
                      <dd>
                        {money(
                          Math.max(
                            0,
                            roundCurrency(review.target.yearly_target - (prevAch?.actual_sales ?? 0)),
                          ),
                        )}
                        <small>Target to close in FY</small>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {/* Unverified Custom Input Guard */}
                {review.unverifiedCustomInput ? (
                  <p className="cf-drawer-message" role="status">
                    <ShieldAlert
                      size={16}
                      style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }}
                    />
                    Review only: custom inputs have no verified scenario outcome
                  </p>
                ) : (
                  <p className="cf-drawer-message" role="status">
                    Verified quota calculation ready for confirmation.
                  </p>
                )}

                {error && (
                  <p role="alert" className="cf-field-error">
                    {error}
                  </p>
                )}

                <div className="cf-drawer-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Button variant="outline" onClick={() => setStep('form')}>
                      Back to form
                    </Button>
                    <Button
                      disabled={review.unverifiedCustomInput}
                      title={
                        review.unverifiedCustomInput
                          ? 'Review only: custom inputs have no verified scenario outcome'
                          : 'Continue to confirmation'
                      }
                      onClick={() => setStep('confirm')}
                    >
                      Continue to confirmation <ClipboardCheck size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            ) : step === 'confirm' && review ? (
              <div>
                <FormSection title="Confirm target update">
                  <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                    Confirm target changes for <strong>{review.target.user_name}</strong> (
                    <strong>{review.target.fy_code}</strong>)?
                  </p>
                  <dl className="cf-review-values">
                    <div>
                      <dt>Annual Target</dt>
                      <dd>
                        <strong>{money(review.target.yearly_target)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>Monthly Quota</dt>
                      <dd>{money(review.target.monthly_target)}</dd>
                    </div>
                    <div>
                      <dt>Achievement %</dt>
                      <dd>
                        <strong>{review.resultingAchievementPct.toFixed(1)}%</strong>
                      </dd>
                    </div>
                  </dl>
                  <p className="cf-muted" style={{ marginTop: 16, fontSize: 12 }}>
                    This action updates the in-memory sales target store for the active demo session.
                    Existing invoice and payment ledgers remain unaltered.
                  </p>
                </FormSection>

                {error && (
                  <p role="alert" className="cf-field-error">
                    {error}
                  </p>
                )}

                <div className="cf-drawer-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Button variant="outline" disabled={pending} onClick={() => setStep('review')}>
                      Back to review
                    </Button>
                    <Button disabled={pending} onClick={executeConfirm}>
                      {pending ? 'Saving target…' : 'Confirm target changes'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : step === 'result' && review ? (
              <div>
                <div
                  className="cf-success-banner"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    background: 'var(--accent)',
                    borderRadius: 6,
                    marginBottom: 20,
                  }}
                >
                  <CheckCircle2 size={26} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: 16 }}>Sales target successfully configured</strong>
                    <p className="cf-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      Updated target and attainment metrics are now active in the demo session.
                    </p>
                  </div>
                </div>

                <FormSection title="Configured target details">
                  <dl className="cf-detail-grid">
                    <div>
                      <dt>Executive</dt>
                      <dd>{review.target.user_name}</dd>
                    </div>
                    <div>
                      <dt>Financial Year</dt>
                      <dd>{review.target.fy_code}</dd>
                    </div>
                    <div>
                      <dt>Annual Target</dt>
                      <dd>
                        <strong>{money(review.target.yearly_target)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>Half-Yearly Target</dt>
                      <dd>{money(review.target.half_yearly_target)}</dd>
                    </div>
                    <div>
                      <dt>Quarterly Target</dt>
                      <dd>{money(review.target.quarterly_target)}</dd>
                    </div>
                    <div>
                      <dt>Monthly Quota</dt>
                      <dd>{money(review.target.monthly_target)}</dd>
                    </div>
                    <div>
                      <dt>Resulting Attainment</dt>
                      <dd>
                        <strong>{review.resultingAchievementPct.toFixed(1)}%</strong>
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                <div className="cf-drawer-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
                  <Button style={{ width: '100%' }} onClick={close}>
                    Return to targets
                  </Button>
                </div>
              </div>
            ) : null}

            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved demo inputs?</p>
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
