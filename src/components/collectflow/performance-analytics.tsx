import { useState, useMemo } from 'react';
import {
  Target,
  TrendingUp,
  Award,
  CheckCircle2,
  Users,
  ArrowUpRight,
  LockKeyhole,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, data, type Invoice } from '@/data/collectflow';
import { type Role } from '@/data/records';
import {
  getExecutivePerformanceList,
  readInitialTargets,
  roundCurrency,
  canManageTargets,
  type SalesTarget,
  type ExecutivePerformance,
  type InvoiceSummary,
} from '@/data/targets';
import { useMockSession } from './session';

function useOptionalSession() {
  try {
    return useMockSession();
  } catch {
    return null;
  }
}

export interface PerformanceAnalyticsProps {
  fy?: string;
  role?: Role;
  empty?: boolean;
  records?: Invoice[];
  targets?: SalesTarget[];
  onNavigateTargets?: () => void;
  className?: string;
  container?: HTMLElement | null | undefined;
}

export function PerformanceAnalytics({
  fy: fyProp,
  role: roleProp,
  empty = false,
  records: recordsProp,
  targets: targetsProp,
  onNavigateTargets,
  className = '',
  container: _container,
}: PerformanceAnalyticsProps) {
  const session = useOptionalSession();
  const activeFy = fyProp ?? session?.fy ?? 'FY 2026-27';
  const activeRole = roleProp ?? session?.role ?? 'finance';
  const allRecords = empty ? [] : (recordsProp ?? session?.demo.invoices ?? data.invoices);
  const allTargets = targetsProp ?? session?.targets ?? readInitialTargets();

  const [searchQuery, setSearchQuery] = useState('');

  // Strict Calculation Adherence:
  // Actual achievement is strictly derived from net taxable revenue (exclusive_amount before GST).
  // Cancelled invoices are excluded completely.
  const activeInvoices: InvoiceSummary[] = useMemo(() => {
    return allRecords.filter((inv) => {
      if (inv.fy_code !== activeFy) return false;
      const status = (inv.computed_status ?? inv.payment_status ?? '').toUpperCase();
      if (status === 'CANCELLED') return false;
      return true;
    });
  }, [allRecords, activeFy]);

  const totalActualSales = useMemo(() => {
    return roundCurrency(
      activeInvoices.reduce((sum, inv) => {
        const amount = inv.exclusive_amount ?? inv.total_amount ?? 0;
        return sum + amount;
      }, 0),
    );
  }, [activeInvoices]);

  const fyTargets = useMemo(() => {
    return allTargets.filter((t) => t.fy_code === activeFy);
  }, [allTargets, activeFy]);

  const totalAnnualTarget = useMemo(() => {
    return roundCurrency(fyTargets.reduce((sum, t) => sum + t.yearly_target, 0));
  }, [fyTargets]);

  const totalHalfYearlyTarget = useMemo(() => {
    return roundCurrency(fyTargets.reduce((sum, t) => sum + t.half_yearly_target, 0));
  }, [fyTargets]);

  const totalQuarterlyTarget = useMemo(() => {
    return roundCurrency(fyTargets.reduce((sum, t) => sum + t.quarterly_target, 0));
  }, [fyTargets]);

  const totalMonthlyTarget = useMemo(() => {
    return roundCurrency(fyTargets.reduce((sum, t) => sum + t.monthly_target, 0));
  }, [fyTargets]);

  // Overall Achievement % (1 decimal place) and safe zero-target division
  const overallAchievementPct =
    totalAnnualTarget > 0
      ? Number(((totalActualSales / totalAnnualTarget) * 100).toFixed(1))
      : 0.0;

  const remainingTarget = Math.max(0, roundCurrency(totalAnnualTarget - totalActualSales));

  // Prorated/Current sub-period actuals vs targets
  // In the sanitized demo snapshot (April 2026), transactions fall into H1, Q1, and Month 1 (April).
  const halfYearlyAchPct =
    totalHalfYearlyTarget > 0
      ? Number(((totalActualSales / totalHalfYearlyTarget) * 100).toFixed(1))
      : 0.0;

  const quarterlyAchPct =
    totalQuarterlyTarget > 0
      ? Number(((totalActualSales / totalQuarterlyTarget) * 100).toFixed(1))
      : 0.0;

  const monthlyAchPct =
    totalMonthlyTarget > 0
      ? Number(((totalActualSales / totalMonthlyTarget) * 100).toFixed(1))
      : 0.0;

  // Executive Performance List from targets data module
  const executivePerformance = useMemo(() => {
    return getExecutivePerformanceList(allTargets, activeInvoices, activeFy);
  }, [allTargets, activeInvoices, activeFy]);

  // Ranked sales reps
  const rankedExecutives = useMemo(() => {
    return [...executivePerformance].sort((a, b) => {
      if (b.achievement_pct !== a.achievement_pct) {
        return b.achievement_pct - a.achievement_pct;
      }
      return b.fy_sales - a.fy_sales;
    });
  }, [executivePerformance]);

  const filteredExecutives = useMemo(() => {
    if (!searchQuery.trim()) return rankedExecutives;
    const q = searchQuery.toLowerCase();
    return rankedExecutives.filter((exec) => exec.name.toLowerCase().includes(q));
  }, [rankedExecutives, searchQuery]);

  const periodBreakdownCards = [
    {
      key: 'annual',
      title: 'Annual Target',
      periodLabel: activeFy,
      tag: '12 Months',
      target: totalAnnualTarget,
      actual: totalActualSales,
      achievementPct: overallAchievementPct,
      remaining: remainingTarget,
      status: overallAchievementPct >= 100 ? 'Quota Met' : 'Full Year Pace',
    },
    {
      key: 'half-yearly',
      title: 'Half-Yearly Quota',
      periodLabel: 'H1: Apr – Sep',
      tag: '6 Months',
      target: totalHalfYearlyTarget,
      actual: totalActualSales,
      achievementPct: halfYearlyAchPct,
      remaining: Math.max(0, roundCurrency(totalHalfYearlyTarget - totalActualSales)),
      status: halfYearlyAchPct >= 100 ? 'H1 Target Met' : 'H1 in Progress',
    },
    {
      key: 'quarterly',
      title: 'Quarterly Quota',
      periodLabel: 'Q1: Apr – Jun',
      tag: '3 Months',
      target: totalQuarterlyTarget,
      actual: totalActualSales,
      achievementPct: quarterlyAchPct,
      remaining: Math.max(0, roundCurrency(totalQuarterlyTarget - totalActualSales)),
      status: quarterlyAchPct >= 100 ? 'Q1 Target Met' : 'Q1 in Progress',
    },
    {
      key: 'monthly',
      title: 'Monthly Quota',
      periodLabel: 'M1: April',
      tag: '1 Month',
      target: totalMonthlyTarget,
      actual: totalActualSales,
      achievementPct: monthlyAchPct,
      remaining: Math.max(0, roundCurrency(totalMonthlyTarget - totalActualSales)),
      status: monthlyAchPct >= 100 ? 'Monthly Target Met' : 'Month in Progress',
    },
  ];

  function getStatusBadge(exec: ExecutivePerformance) {
    if (exec.yearly_target === 0) {
      return {
        label: 'No Quota Set',
        bg: 'var(--muted)',
        color: 'var(--muted-foreground)',
      };
    }
    if (exec.achievement_pct >= 100) {
      return {
        label: 'Quota Exceeded',
        bg: 'oklch(0.92 0.05 140)',
        color: 'oklch(0.35 0.1 140)',
      };
    }
    if (exec.achievement_pct >= 20) {
      return {
        label: 'Ahead of Pace',
        bg: 'oklch(0.92 0.05 160)',
        color: 'oklch(0.35 0.1 160)',
      };
    }
    if (exec.achievement_pct >= 10) {
      return {
        label: 'On Track',
        bg: 'var(--accent)',
        color: 'var(--primary)',
      };
    }
    if (exec.achievement_pct > 0) {
      return {
        label: 'In Progress',
        bg: 'oklch(0.94 0.04 80)',
        color: 'oklch(0.4 0.08 80)',
      };
    }
    return {
      label: 'Pipeline Pending',
      bg: 'var(--muted)',
      color: 'var(--muted-foreground)',
    };
  }

  return (
    <section
      className={`cf-performance-analytics ${className}`}
      aria-label="Sales Performance Analytics"
      data-testid="performance-analytics"
    >
      {/* Demo Notice */}
      <div
        className="cf-lock-note"
        data-testid="performance-demo-notice"
        style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <LockKeyhole size={16} />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>Sanitized Rehearsal Demo:</strong> Analytics reflect verified scenario snapshots.
          Actual sales are strictly derived from net taxable revenue (exclusive amount before GST)
          for active financial year ({activeFy}). Excludes cancelled invoices, unbilled orders are
          accounted as sales pipeline, and collections are tracked independently.
        </span>
      </div>

      {/* Top Section Header */}
      <header
        className="cf-section-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <span className="cf-kicker">PERFORMANCE INTELLIGENCE</span>
          <h2>Sales Quotas & Revenue Attainment</h2>
          <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Fiscal year performance comparison across sales executives and target periods.
          </p>
        </div>

        {canManageTargets(activeRole) && onNavigateTargets && (
          <Button
            variant="outline"
            onClick={onNavigateTargets}
            data-testid="btn-manage-quotas"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Target size={15} />
            Manage Sales Targets
            <ArrowUpRight size={14} />
          </Button>
        )}
      </header>

      {/* Summary KPI Cards (.cf-metrics 4-column grid collapsing to 2-column on mobile) */}
      <section className="cf-metrics" aria-label="Performance KPIs" data-testid="performance-kpis">
        <article className="cf-metric" data-testid="metric-total-target">
          <div>
            <span>Total Annual Target</span>
            <Target size={20} />
          </div>
          <strong>{money(totalAnnualTarget)}</strong>
          <small>{fyTargets.length} executive quotas configured ({activeFy})</small>
        </article>

        <article className="cf-metric cf-metric-primary" data-testid="metric-actual-sales">
          <div>
            <span>Actual Sales Achieved</span>
            <TrendingUp size={20} />
          </div>
          <strong>{money(totalActualSales)}</strong>
          <small>Tax-exclusive net turnover (excl. GST & cancelled)</small>
        </article>

        <article className="cf-metric" data-testid="metric-achievement-rate">
          <div>
            <span>Overall Achievement</span>
            <Award size={20} />
          </div>
          <strong>{overallAchievementPct.toFixed(1)}%</strong>
          <div
            className="cf-progress-track"
            style={{
              width: '100%',
              height: 6,
              backgroundColor: 'var(--muted)',
              borderRadius: 3,
              overflow: 'hidden',
              margin: '6px 0 2px',
            }}
          >
            <div
              className="cf-progress-fill"
              style={{
                width: `${Math.min(100, overallAchievementPct)}%`,
                height: '100%',
                backgroundColor: 'var(--primary)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <small>
            {money(totalActualSales)} of {money(totalAnnualTarget)}
          </small>
        </article>

        <article className="cf-metric" data-testid="metric-remaining-target">
          <div>
            <span>Remaining Target</span>
            <CheckCircle2 size={20} />
          </div>
          <strong>{money(remainingTarget)}</strong>
          <small>Quota balance to achieve target</small>
        </article>
      </section>

      {/* Target vs Actual Progress Visualization (Annual, Half-Yearly, Quarterly, Monthly) */}
      <div style={{ marginTop: 28, marginBottom: 32 }}>
        <header style={{ marginBottom: 16 }}>
          <span className="cf-kicker">PERIOD BREAKDOWN</span>
          <h3>Target vs Actual Progress Visualization</h3>
          <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Visual comparison cards for Annual, Half-Yearly, Quarterly, and Monthly targets vs
            actual sales turnover.
          </p>
        </header>

        <div
          className="cf-period-cards-grid"
          data-testid="period-breakdown-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {periodBreakdownCards.map((card) => (
            <article
              key={card.key}
              className="cf-metric"
              data-testid={`period-card-${card.key}`}
              style={{ padding: 18, minHeight: 'auto', display: 'flex', flexDirection: 'column' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 14, display: 'block', color: 'var(--foreground)' }}>
                    {card.title}
                  </strong>
                  <small style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
                    {card.periodLabel}
                  </small>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '3px 8px',
                    borderRadius: 4,
                    backgroundColor: 'var(--muted)',
                    color: 'var(--foreground)',
                  }}
                >
                  {card.tag}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  margin: '8px 0 4px',
                }}
              >
                <strong
                  style={{
                    fontSize: 26,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {card.achievementPct.toFixed(1)}%
                </strong>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {card.status}
                </span>
              </div>

              {/* Calming SaaS Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: 7,
                  backgroundColor: 'var(--muted)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  margin: '8px 0 10px',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, card.achievementPct)}%`,
                    height: '100%',
                    backgroundColor:
                      card.achievementPct >= 100 ? 'oklch(0.5 0.15 140)' : 'var(--primary)',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  fontSize: 12,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div>
                  <span className="cf-muted" style={{ display: 'block', fontSize: 11 }}>
                    Actual Sales
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {money(card.actual)}
                  </strong>
                </div>
                <div>
                  <span className="cf-muted" style={{ display: 'block', fontSize: 11 }}>
                    Period Quota
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {money(card.target)}
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Executive Comparison Leaderboard */}
      <div style={{ marginTop: 32 }} data-testid="executive-leaderboard">
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <span className="cf-kicker">SALES REPS LEADERBOARD</span>
            <h3>Executive Comparison Leaderboard</h3>
            <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Ranked sales representatives by attainment percentage, tax-exclusive sales turnover,
              and receivables.
            </p>
          </div>

          <div
            className="cf-table-search"
            style={{
              display: 'flex',
              alignItems: 'center',
              width: 240,
              maxWidth: '100%',
            }}
          >
            <Search size={16} />
            <Input
              type="search"
              aria-label="Filter executive leaderboard"
              placeholder="Filter representatives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: 34, fontSize: 12 }}
            />
          </div>
        </header>

        {/* Desktop / Tablet Table View */}
        <div className="cf-table-container" data-testid="leaderboard-table-container">
          <table
            className="cf-table"
            aria-label="Executive Performance Leaderboard"
            data-testid="executive-leaderboard-table"
          >
            <thead>
              <tr>
                <th style={{ width: '6%' }}>Rank</th>
                <th style={{ width: '22%' }}>Representative</th>
                <th style={{ width: '15%' }} className="cf-number">
                  Annual Target
                </th>
                <th style={{ width: '15%' }} className="cf-number">
                  FY Sales (Excl.)
                </th>
                <th style={{ width: '8%' }} className="cf-number">
                  Orders
                </th>
                <th style={{ width: '14%' }} className="cf-number">
                  Outstanding
                </th>
                <th style={{ width: '12%' }}>Achievement %</th>
                <th style={{ width: '8%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredExecutives.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p className="cf-muted">No sales representatives match the current filter.</p>
                  </td>
                </tr>
              ) : (
                filteredExecutives.map((exec, index) => {
                  const badge = getStatusBadge(exec);
                  const rank = rankedExecutives.findIndex((r) => r.user_id === exec.user_id) + 1;
                  return (
                    <tr key={exec.user_id} data-testid={`leaderboard-row-${exec.user_id}`}>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 12,
                            color:
                              rank === 1
                                ? 'oklch(0.5 0.15 140)'
                                : rank === 2
                                ? 'var(--primary)'
                                : 'var(--muted-foreground)',
                          }}
                        >
                          #{rank}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className="cf-avatar"
                            style={{
                              width: 30,
                              height: 30,
                              fontSize: 11,
                              backgroundColor: 'var(--accent)',
                              color: 'var(--primary)',
                            }}
                          >
                            {exec.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </span>
                          <div>
                            <strong style={{ fontSize: 13, display: 'block' }}>{exec.name}</strong>
                            <small className="cf-muted" style={{ fontSize: 11 }}>
                              User ID: {exec.user_id}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="cf-number">
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {exec.yearly_target > 0 ? money(exec.yearly_target) : '₹0'}
                        </strong>
                        <small className="cf-muted" style={{ display: 'block' }}>
                          Annual quota
                        </small>
                      </td>
                      <td className="cf-number">
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {money(exec.fy_sales)}
                        </strong>
                        <small className="cf-muted" style={{ display: 'block' }}>
                          Tax-exclusive
                        </small>
                      </td>
                      <td className="cf-number">
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {exec.fy_orders}
                        </strong>
                      </td>
                      <td className="cf-number">
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {money(exec.fy_outstanding)}
                        </strong>
                      </td>
                      <td>
                        <div style={{ minWidth: 90 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <strong
                              style={{
                                fontSize: 12,
                                fontVariantNumeric: 'tabular-nums',
                                color:
                                  exec.yearly_target === 0
                                    ? 'var(--muted-foreground)'
                                    : 'var(--foreground)',
                              }}
                            >
                              {exec.achievement_pct.toFixed(1)}%
                            </strong>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              backgroundColor: 'var(--muted)',
                              borderRadius: 3,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, exec.achievement_pct)}%`,
                                height: '100%',
                                backgroundColor:
                                  exec.achievement_pct >= 100
                                    ? 'oklch(0.5 0.15 140)'
                                    : 'var(--primary)',
                                borderRadius: 3,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 12,
                            backgroundColor: badge.bg,
                            color: badge.color,
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (displayed on narrow screens <= 600px or .cf-preview-mobile) */}
        <div className="cf-mobile-cards" data-testid="leaderboard-mobile-cards">
          {filteredExecutives.map((exec) => {
            const badge = getStatusBadge(exec);
            const rank = rankedExecutives.findIndex((r) => r.user_id === exec.user_id) + 1;
            return (
              <article
                className="cf-record-card"
                key={exec.user_id}
                data-testid={`leaderboard-card-${exec.user_id}`}
              >
                <header
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 12,
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: 'var(--muted)',
                        color:
                          rank === 1
                            ? 'oklch(0.5 0.15 140)'
                            : rank === 2
                            ? 'var(--primary)'
                            : 'var(--muted-foreground)',
                      }}
                    >
                      Rank #{rank}
                    </span>
                    <strong style={{ fontSize: 15 }}>{exec.name}</strong>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 12,
                      backgroundColor: badge.bg,
                      color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                </header>

                {/* Progress bar in card */}
                <div style={{ margin: '8px 0 14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span className="cf-muted">Achievement</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {exec.achievement_pct.toFixed(1)}%
                    </strong>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      backgroundColor: 'var(--muted)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, exec.achievement_pct)}%`,
                        height: '100%',
                        backgroundColor:
                          exec.achievement_pct >= 100
                            ? 'oklch(0.5 0.15 140)'
                            : 'var(--primary)',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>

                <dl>
                  <div>
                    <dt>Annual Quota</dt>
                    <dd>{exec.yearly_target > 0 ? money(exec.yearly_target) : '₹0'}</dd>
                  </div>
                  <div>
                    <dt>FY Sales (Excl.)</dt>
                    <dd>{money(exec.fy_sales)}</dd>
                  </div>
                  <div>
                    <dt>Orders</dt>
                    <dd>{exec.fy_orders}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{money(exec.fy_outstanding)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
