import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowUpDown,
  Search,
  SlidersHorizontal,
  Plus,
  LockKeyhole,
  Target,
  TrendingUp,
  Award,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, exactMoney } from '@/data/collectflow';
import { FilterChoice, EmptyState } from './controls';
import { useMockSession } from './session';
import { TargetDrawer } from './target-drawer';
import {
  type SalesTarget,
  canManageTargets,
  calculateExecutiveAchievement,
  deriveTargetBreakdown,
} from '@/data/targets';
import {
  apiClient,
  type SalesTargetDTO,
  type ExecutiveAttainmentReportDTO,
} from '@/lib/api-client';

export interface TargetsScreenProps {
  container?: HTMLElement | null | undefined;
  empty?: boolean;
}

export function TargetsScreen({ container, empty = false }: TargetsScreenProps) {
  const isLive = apiClient.getMode() === 'live';
  const { role, fy, setFy, targets, demo, references } = useMockSession();
  const currentRole = isLive ? (apiClient.getCurrentUser()?.role || role) : role;
  const canManage = canManageTargets(currentRole);

  const [liveTargets, setLiveTargets] = useState<SalesTargetDTO[]>([]);
  const [liveAttainment, setLiveAttainment] = useState<ExecutiveAttainmentReportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveTargets = useCallback(async () => {
    if (!isLive) return;
    if (empty) {
      setLiveTargets([]);
      setLiveAttainment(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [targetRes, attainRes] = await Promise.all([
        apiClient.getTargets({ fy }),
        apiClient.getExecutiveAttainment({ fy }),
      ]);
      setLiveTargets(targetRes.targets);
      setLiveAttainment(attainRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales targets');
    } finally {
      setLoading(false);
    }
  }, [isLive, empty, fy]);

  useEffect(() => {
    fetchLiveTargets();
  }, [fetchLiveTargets]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [sort, setSort] = useState<'name' | 'target' | 'sales' | 'achievement'>('name');
  const [asc, setAsc] = useState(true);

  // Drawer modal state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<SalesTarget | null>(null);
  const [initialZero, setInitialZero] = useState(false);

  // Filter targets for active FY
  const fyTargets: SalesTarget[] = useMemo(() => {
    if (empty) return [];
    if (isLive) {
      return (liveTargets || []).map((t) => {
        const yearly = Number(t.target_amount || t.yearly_target || 0);
        const breakdown = deriveTargetBreakdown(yearly);
        return {
          id: t.id ?? t.user_id,
          user_id: t.user_id,
          user_name: t.full_name || t.username || t.executive_name || `Rep ${t.user_id}`,
          fy_code: t.fy_code,
          yearly_target: yearly,
          half_yearly_target: breakdown.half_yearly_target,
          quarterly_target: breakdown.quarterly_target,
          monthly_target: breakdown.monthly_target,
          monthly_bottom_line: breakdown.monthly_bottom_line,
          yearly_bottom_line: breakdown.yearly_bottom_line,
        };
      });
    }
    return targets.filter((t) => t.fy_code === fy);
  }, [empty, isLive, liveTargets, targets, fy]);

  // Enrich with live achievement data
  const enriched = useMemo(() => {
    return fyTargets.map((target) => {
      let actualSales = 0;
      let achPct = 0;
      let orderCount = 0;
      let remainingTarget = target.yearly_target;
      let outstanding = 0;

      if (isLive) {
        const execList = liveAttainment?.executives || liveAttainment?.rows || [];
        const exec = execList.find((e) => e.user_id === target.user_id);
        if (exec) {
          actualSales = Number(exec.achieved_amount || exec.actual_sales || 0);
          achPct = exec.attainment_pct ?? exec.achievement_pct ?? 0;
          orderCount = exec.active_invoices_count ?? exec.order_count ?? 0;
          remainingTarget = Math.max(0, target.yearly_target - actualSales);
        }
      } else {
        const ach = calculateExecutiveAchievement(
          target.user_id,
          demo.invoices,
          target.yearly_target,
          target.fy_code,
        );
        actualSales = ach.actual_sales;
        achPct = ach.achievement_pct;
        orderCount = ach.order_count;
        remainingTarget = ach.remaining_target;
        outstanding = ach.outstanding;
      }

      let statusLabel = 'In Progress';
      let statusClass = 'partial';

      if (target.yearly_target === 0) {
        statusLabel = 'Zero Quota';
        statusClass = 'zero';
      } else if (achPct >= 100) {
        statusLabel = 'Exceeded';
        statusClass = 'paid';
      } else if (achPct >= 50) {
        statusLabel = 'On Track';
        statusClass = 'partial';
      } else if (actualSales === 0) {
        statusLabel = 'Behind';
        statusClass = 'overdue';
      }

      return {
        target,
        ach: {
          actual_sales: actualSales,
          achievement_pct: achPct,
          is_on_track: achPct >= 50,
          order_count: orderCount,
          remaining_target: remainingTarget,
          outstanding,
          subperiods: {
            h1_actual: 0,
            h2_actual: 0,
            q1_actual: 0,
            q2_actual: 0,
            q3_actual: 0,
            q4_actual: 0,
            m1_actual: 0,
            m2_actual: 0,
            m3_actual: 0,
            m4_actual: 0,
            m5_actual: 0,
            m6_actual: 0,
            m7_actual: 0,
            m8_actual: 0,
            m9_actual: 0,
            m10_actual: 0,
            m11_actual: 0,
            m12_actual: 0,
          },
        },
        statusLabel,
        statusClass,
      };
    });
  }, [fyTargets, isLive, liveAttainment, demo.invoices]);

  // Calculate summary metrics
  const totalTargetQuota = isLive && liveAttainment
    ? Number(liveAttainment.overall?.total_target ?? liveAttainment.summary?.total_target ?? 0)
    : enriched.reduce((sum, item) => sum + item.target.yearly_target, 0);
  const totalSalesAchieved = isLive && liveAttainment
    ? Number(liveAttainment.overall?.total_achieved ?? liveAttainment.summary?.total_actual_sales ?? 0)
    : enriched.reduce((sum, item) => sum + item.ach.actual_sales, 0);
  const overallAchievementPct =
    isLive && liveAttainment
      ? (liveAttainment.overall?.attainment_pct ?? liveAttainment.summary?.overall_achievement_pct ?? 0)
      : totalTargetQuota > 0
      ? Number(((totalSalesAchieved / totalTargetQuota) * 100).toFixed(1))
      : 0.0;
  const activeQuotasCount = enriched.filter(item => item.target.yearly_target > 0).length;

  // Filter by query and status
  const filtered = enriched.filter(item => {
    const matchesQuery =
      item.target.user_name.toLowerCase().includes(query.toLowerCase()) ||
      item.target.fy_code.toLowerCase().includes(query.toLowerCase());
    const matchesStatus =
      statusFilter === 'All statuses' || item.statusLabel === statusFilter;
    return matchesQuery && matchesStatus;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sort === 'name') {
      cmp = a.target.user_name.localeCompare(b.target.user_name);
    } else if (sort === 'target') {
      cmp = a.target.yearly_target - b.target.yearly_target;
    } else if (sort === 'sales') {
      cmp = a.ach.actual_sales - b.ach.actual_sales;
    } else if (sort === 'achievement') {
      cmp = a.ach.achievement_pct - b.ach.achievement_pct;
    }
    return asc ? cmp : -cmp;
  });

  function toggleSort(field: typeof sort) {
    if (sort === field) {
      setAsc(!asc);
    } else {
      setSort(field);
      setAsc(true);
    }
  }

  function resetFilters() {
    setQuery('');
    setStatusFilter('All statuses');
    setSort('name');
    setAsc(true);
  }

  function handleCreate() {
    setEditingTarget(null);
    setInitialZero(false);
    setDrawerOpen(true);
  }

  function handleEdit(target: SalesTarget) {
    setEditingTarget(target);
    setInitialZero(false);
    setDrawerOpen(true);
  }

  function handleZero(target: SalesTarget) {
    setEditingTarget(target);
    setInitialZero(true);
    setDrawerOpen(true);
  }

  return (
    <section className="cf-targets-section" data-testid="targets-screen">
      {loading && (
        <div className="cf-notice" role="status" style={{ marginBottom: 16 }}>
          <span>Loading sales targets and attainment…</span>
        </div>
      )}
      {error && (
        <div className="cf-field-error" role="alert" style={{ marginBottom: 16, padding: 12, borderRadius: 6, backgroundColor: 'oklch(0.95 0.05 25)' }}>
          <span>{error}</span>
        </div>
      )}
      {/* Header with Title & Set Target Button */}
      <header className="cf-section-header" style={{ marginBottom: 20 }}>
        <div>
          <h2>Sales Targets & Quotas</h2>
          <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Annual, half-yearly, quarterly and monthly sales targets and executive attainment for {fy}.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {canManage ? (
            <Button onClick={handleCreate} aria-label="Configure Sales Target">
              <Plus size={16} /> Configure Target
            </Button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="cf-status"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Viewing mode: only Admin and Finance can configure targets"
              >
                <LockKeyhole size={12} /> Viewing mode: only Admin and Finance can configure targets
              </span>
              <Button
                disabled
                title="Viewing mode: only Admin and Finance can configure targets"
                aria-label="Configure target (disabled in viewing mode)"
              >
                <Plus size={16} /> Configure Target
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* KPI Metrics Summary */}
      <div className="cf-metrics" style={{ marginBottom: 24 }}>
        <div className="cf-metric">
          <div>
            <span>Annual Target Quota</span>
            <Target size={16} />
          </div>
          <strong>{money(totalTargetQuota)}</strong>
          <small>{activeQuotasCount} active rep quotas in {fy}</small>
        </div>

        <div className="cf-metric">
          <div>
            <span>Sales Achieved</span>
            <TrendingUp size={16} />
          </div>
          <strong>{money(totalSalesAchieved)}</strong>
          <small>Invoiced exclusive turnover</small>
        </div>

        <div className="cf-metric">
          <div>
            <span>Overall Attainment</span>
            <Award size={16} />
          </div>
          <strong>{overallAchievementPct}%</strong>
          <small>Team performance vs FY quota</small>
        </div>

        <div className="cf-metric">
          <div>
            <span>Target Representatives</span>
            <Users size={16} />
          </div>
          <strong>{enriched.length}</strong>
          <small>{canManage ? 'Configured in demo session' : 'Viewing mode active'}</small>
        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="cf-table-tools">
        <div className="cf-table-search">
          <Search size={17} />
          <Input
            aria-label="Search targets by representative"
            placeholder="Search representative or FY…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <FilterChoice
          label="Financial year filter"
          value={fy}
          options={references?.years?.map(y => y.code) ?? ['FY 2026-27', 'FY 2025-26', 'FY 2024-25']}
          onChange={setFy}
        />

        <FilterChoice
          label="Status filter"
          value={statusFilter}
          options={['All statuses', 'On Track', 'In Progress', 'Exceeded', 'Behind', 'Zero Quota']}
          onChange={setStatusFilter}
        />

        <Button
          variant="outline"
          size="icon"
          title="Reset filters"
          aria-label="Reset filters"
          onClick={resetFilters}
        >
          <SlidersHorizontal size={16} />
        </Button>
      </div>

      {/* Mobile Sort Row */}
      <div className="cf-sort-mobile">
        <FilterChoice
          label="Sort targets"
          value={sort}
          options={['name', 'target', 'sales', 'achievement']}
          onChange={val => setSort(val as typeof sort)}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Reverse sort direction"
          onClick={() => setAsc(!asc)}
        >
          <ArrowUpDown size={15} />
        </Button>
      </div>

      {sorted.length > 0 ? (
        <>
          {/* Desktop & Tablet Table (> 600px) */}
          <div className="cf-table-container">
            <table className="cf-table cf-targets-table">
              <thead>
                <tr>
                  <th aria-sort={sort === 'name' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => toggleSort('name')}>
                      Representative <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>FY</th>
                  <th
                    className="cf-number"
                    aria-sort={sort === 'target' ? (asc ? 'ascending' : 'descending') : 'none'}
                  >
                    <Button variant="ghost" onClick={() => toggleSort('target')}>
                      Annual Target <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number">Half-Yearly</th>
                  <th className="cf-number">Quarterly</th>
                  <th className="cf-number">Monthly</th>
                  <th
                    className="cf-number"
                    aria-sort={sort === 'sales' ? (asc ? 'ascending' : 'descending') : 'none'}
                  >
                    <Button variant="ghost" onClick={() => toggleSort('sales')}>
                      Actual Sales <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th
                    aria-sort={sort === 'achievement' ? (asc ? 'ascending' : 'descending') : 'none'}
                  >
                    <Button variant="ghost" onClick={() => toggleSort('achievement')}>
                      Achievement % <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ target, ach, statusLabel, statusClass }) => (
                  <tr key={target.id}>
                    <td>
                      <strong>{target.user_name}</strong>
                      <small>Sales Executive</small>
                    </td>
                    <td>{target.fy_code}</td>
                    <td className="cf-number">
                      <strong>{money(target.yearly_target)}</strong>
                    </td>
                    <td className="cf-number">{money(target.half_yearly_target)}</td>
                    <td className="cf-number">{money(target.quarterly_target)}</td>
                    <td className="cf-number">{money(target.monthly_target)}</td>
                    <td className="cf-number">
                      <strong>{money(ach.actual_sales)}</strong>
                      <small>{ach.order_count} order{ach.order_count === 1 ? '' : 's'}</small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 42 }}>
                          {ach.achievement_pct}%
                        </span>
                        <div
                          style={{
                            width: 64,
                            height: 6,
                            background: 'var(--muted)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, ach.achievement_pct)}%`,
                              height: '100%',
                              background: ach.achievement_pct >= 100 ? 'var(--primary)' : 'var(--accent-foreground)',
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`cf-status ${statusClass}`}>{statusLabel}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage ? (
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit target for ${target.user_name}`}
                            onClick={() => handleEdit(target)}
                          >
                            Edit Target
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Zero target for ${target.user_name}`}
                            onClick={() => handleZero(target)}
                          >
                            Zero Target
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cf-muted"
                          style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title="Viewing mode: only Admin and Finance can configure targets"
                        >
                          <LockKeyhole size={12} /> View only
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards Layout (<= 600px) */}
          <div className="cf-mobile-cards">
            {sorted.map(({ target, ach, statusLabel, statusClass }) => (
              <article className="cf-record-card" key={target.id}>
                <header>
                  <div>
                    <strong>{target.user_name}</strong>
                    <small style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 11 }}>
                      Sales Executive · {target.fy_code}
                    </small>
                  </div>
                  <span className={`cf-status ${statusClass}`}>{statusLabel}</span>
                </header>

                <div style={{ margin: '14px 0 16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginBottom: 6,
                    }}
                  >
                    <span>Annual Quota</span>
                    <strong>{money(target.yearly_target)}</strong>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      background: 'var(--muted)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, ach.achievement_pct)}%`,
                        height: '100%',
                        background: 'var(--primary)',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--muted-foreground)',
                      marginTop: 4,
                    }}
                  >
                    <span>Attainment: {ach.achievement_pct}%</span>
                    <span>Actual: {money(ach.actual_sales)}</span>
                  </div>
                </div>

                <dl>
                  <div>
                    <dt>Half-Yearly</dt>
                    <dd>{money(target.half_yearly_target)}</dd>
                  </div>
                  <div>
                    <dt>Quarterly</dt>
                    <dd>{money(target.quarterly_target)}</dd>
                  </div>
                  <div>
                    <dt>Monthly</dt>
                    <dd>{money(target.monthly_target)}</dd>
                  </div>
                  <div>
                    <dt>Remaining Quota</dt>
                    <dd>{money(ach.remaining_target)}</dd>
                  </div>
                </dl>

                <footer>
                  {canManage ? (
                    <div style={{ display: 'flex', gap: 6, width: '100%', justifyContent: 'flex-end' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(target)}
                      >
                        Edit Target
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleZero(target)}
                      >
                        Zero Target
                      </Button>
                    </div>
                  ) : (
                    <span className="cf-muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <LockKeyhole size={12} /> Viewing mode: Admin/Finance required
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>

          <footer className="cf-table-footer">
            <span>
              Showing {sorted.length} of {fyTargets.length} sales targets in {fy}
            </span>
          </footer>
        </>
      ) : (
        <EmptyState type="empty" onReset={resetFilters} />
      )}

      {/* Target Drawer Modal Workflow */}
      {drawerOpen && (
        <TargetDrawer
          target={editingTarget}
          initialZero={initialZero}
          container={container}
          onSuccess={fetchLiveTargets}
          close={() => {
            setDrawerOpen(false);
            setEditingTarget(null);
            setInitialZero(false);
          }}
        />
      )}
    </section>
  );
}

export const SalesTargetsScreen = TargetsScreen;
export default TargetsScreen;
