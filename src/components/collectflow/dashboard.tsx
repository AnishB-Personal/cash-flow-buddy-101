import { useMemo } from 'react';
import {
  FileText,
  Wallet,
  Landmark,
  Receipt,
  Gauge,
  Clock,
  Layers,
  ArrowUpRight,
  Target,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { money, data, type Invoice } from '@/data/collectflow';
import { snapshot, agingAsOf, type Role } from '@/data/records';
import {
  getExecutivePerformanceList,
  readInitialTargets,
  type SalesTarget,
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

export function FinancialDashboard({
  fy,
  role,
  empty,
  selectAging,
  records = data.invoices,
  targets: targetsProp,
  onNavigateTargets,
}: {
  fy: string;
  role: Role;
  empty: boolean;
  selectAging: (bucket: string) => void;
  records?: Invoice[];
  targets?: SalesTarget[];
  onNavigateTargets?: () => void;
}) {
  const session = useOptionalSession();
  const dynamicTargets = targetsProp ?? session?.targets ?? readInitialTargets();

  const k = snapshot(empty ? '' : fy, role, undefined, records);
  const metrics = [
    {
      label: 'Total invoiced',
      value: money(k.invoiced),
      note: `${k.count} issued invoice${k.count === 1 ? '' : 's'}`,
      icon: FileText,
    },
    {
      label: 'Total outstanding',
      value: money(k.outstanding),
      note: 'Issued receivables only',
      icon: Wallet,
    },
    {
      label: 'Cash collected',
      value: money(k.cash),
      note: 'Cash settlement received',
      icon: Landmark,
    },
    {
      label: 'TDS recognized',
      value: money(k.tds),
      note: 'Statutory settlement credit',
      icon: Receipt,
    },
    {
      label: 'Settlement Rate',
      value: `${k.rate}%`,
      note: '(Cash + TDS) / invoiced',
      icon: Gauge,
    },
    {
      label: 'Overdue receivables',
      value: money(k.overdue),
      note: 'Issued invoices past due',
      icon: Clock,
    },
    {
      label: 'Unbilled orders',
      value: money(k.unbilled),
      note: `${k.unbilledCount} order${k.unbilledCount === 1 ? '' : 's'} · not receivables`,
      icon: Layers,
    },
  ];

  // Executive Performance List from targets data module
  const executiveList = useMemo(() => {
    const activeInvoices = empty ? [] : (records as InvoiceSummary[]);
    return getExecutivePerformanceList(dynamicTargets, activeInvoices, fy);
  }, [dynamicTargets, records, empty, fy]);

  return (
    <>
      <section className="cf-metrics" aria-label="Financial KPIs">
        {metrics.map((metric, index) => (
          <article
            key={metric.label}
            className={`cf-metric ${index === 1 ? 'cf-metric-primary' : ''}`}
          >
            <div>
              <span>{metric.label}</span>
              <metric.icon size={20} />
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <div className="cf-insights">
        <section className="cf-revenue">
          <header>
            <div>
              <span className="cf-kicker">FINANCIAL PERFORMANCE</span>
              <h2>Invoiced vs Settlements</h2>
            </div>
            <span className="cf-period">{fy}</span>
          </header>
          <div className="cf-legend">
            <span>
              <i className="cf-dot-invoice" />
              Invoiced
            </span>
            <span>
              <i className="cf-dot-cash" />
              Cash collected
            </span>
            <span>
              <i className="cf-dot-tds" />
              TDS recognized
            </span>
          </div>
          <div className="cf-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[{ name: fy, Invoiced: k.invoiced, Cash: k.cash, TDS: k.tds }]}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                  width={55}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `₹${Number(value) / 100000}L`}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: 'var(--muted)' }} />
                <Bar
                  dataKey="Invoiced"
                  fill="var(--chart-1)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={72}
                />
                <Bar
                  dataKey="Cash"
                  stackId="settled"
                  fill="var(--chart-2)"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={72}
                />
                <Bar
                  dataKey="TDS"
                  stackId="settled"
                  fill="var(--chart-3)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={72}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <footer>
            <span>Total settlement</span>
            <strong>{money(k.settled)}</strong>
            <span className="cf-muted">
              Cash {money(k.cash)} + TDS {money(k.tds)}
            </span>
          </footer>
        </section>

        <section className="cf-aging">
          <header>
            <span className="cf-kicker">ISSUED RECEIVABLES</span>
            <h2>Receivables aging</h2>
            <p className="cf-muted">{agingAsOf()}</p>
            <div className="cf-aging-total">
              <strong>{money(k.outstanding)}</strong>
              <span>Total outstanding</span>
            </div>
          </header>
          <div>
            {k.aging.map((item, index) => (
              <Button
                variant="ghost"
                className="cf-aging-row"
                key={item.bucket}
                onClick={() => selectAging(item.bucket)}
              >
                <i className={`cf-aging-dot-${index}`} />
                <span>
                  {item.bucket}
                  <small>
                    {item.count} invoice{item.count === 1 ? '' : 's'}
                  </small>
                </span>
                <strong>{money(item.amount)}</strong>
                <ArrowUpRight size={16} />
              </Button>
            ))}
          </div>
        </section>
      </div>

      {/* Executive Sales Performance & Attainment Section */}
      <section
        className="cf-dashboard-executives"
        aria-label="Executive Sales Performance"
        data-testid="dashboard-executives"
        style={{ marginTop: 32 }}
      >
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
            <span className="cf-kicker">SALES ATTAINMENT</span>
            <h2>Executive Performance & Quotas</h2>
            <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Tax-exclusive net turnover and quota attainment for active sales representatives.
            </p>
          </div>

          <div>
            {onNavigateTargets ? (
              <Button
                variant="outline"
                onClick={onNavigateTargets}
                data-testid="link-to-sales-targets"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  height: 34,
                }}
              >
                <Target size={14} />
                View Quotas & Analytics
                <ArrowUpRight size={14} />
              </Button>
            ) : (
              <a
                href="/sales-targets"
                data-testid="link-to-sales-targets"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--primary)',
                  textDecoration: 'none',
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                }}
              >
                <Target size={14} />
                View Quotas & Analytics
                <ArrowUpRight size={14} />
              </a>
            )}
          </div>
        </header>

        <div
          className="cf-exec-cards-grid"
          data-testid="dashboard-exec-cards"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {executiveList.map((exec) => (
            <article
              key={exec.user_id}
              className="cf-metric"
              data-testid={`exec-card-${exec.user_id}`}
              style={{ minHeight: 'auto', padding: 18 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="cf-avatar"
                    style={{
                      width: 28,
                      height: 28,
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
                  <strong style={{ fontSize: 14 }}>{exec.name}</strong>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 12,
                    backgroundColor:
                      exec.yearly_target === 0
                        ? 'var(--muted)'
                        : exec.achievement_pct >= 20
                        ? 'oklch(0.92 0.05 140)'
                        : 'var(--accent)',
                    color:
                      exec.yearly_target === 0
                        ? 'var(--muted-foreground)'
                        : exec.achievement_pct >= 20
                        ? 'oklch(0.35 0.1 140)'
                        : 'var(--primary)',
                  }}
                >
                  {exec.yearly_target === 0 ? 'No Quota' : `${exec.achievement_pct.toFixed(1)}%`}
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: 6,
                  backgroundColor: 'var(--muted)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  margin: '8px 0',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, exec.achievement_pct)}%`,
                    height: '100%',
                    backgroundColor:
                      exec.achievement_pct >= 100 ? 'oklch(0.5 0.15 140)' : 'var(--primary)',
                    borderRadius: 3,
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
                  marginTop: 4,
                }}
              >
                <div>
                  <span className="cf-muted" style={{ display: 'block', fontSize: 11 }}>
                    FY Sales (Excl.)
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {money(exec.fy_sales)}
                  </strong>
                </div>
                <div>
                  <span className="cf-muted" style={{ display: 'block', fontSize: 11 }}>
                    Annual Quota
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {exec.yearly_target > 0 ? money(exec.yearly_target) : '₹0'}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span>
                  {exec.fy_orders} order{exec.fy_orders === 1 ? '' : 's'}
                </span>
                <span>Outstanding: {money(exec.fy_outstanding)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
