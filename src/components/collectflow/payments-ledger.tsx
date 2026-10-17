import { useState, useEffect } from 'react';
import {
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  Wallet,
  CheckCircle2,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterChoice, EmptyState } from './controls';
import { money, type Invoice } from '@/data/collectflow';
import { dateLabel, canPay, type Role } from '@/data/records';
import { apiClient } from '@/lib/api-client';

export interface PaymentItem {
  id: number;
  invoice_id: number;
  parent_transaction_id?: number | null;
  is_superseded?: boolean;
  transaction_type?: 'PAYMENT' | 'REVERSAL' | 'ADJUSTMENT';
  payment_amount: number;
  cash_amount?: number;
  tds_amount: number;
  tds_section: string | null;
  payment_date: string;
  payment_mode: string;
  remittance_number: string | null;
  notes?: string | null;
  invoice: Invoice;
  invoice_number: string;
  invoice_lifecycle_status?: string | null;
  customer_name: string;
  net_settled: number;
}

export function PaymentsLedger({
  records,
  fy,
  role,
  empty = false,
  openInvoice,
  container: _container,
  unavailable,
  onCorrectPayment,
}: {
  records: Invoice[];
  fy: string;
  role: Role;
  empty?: boolean;
  openInvoice: (invoice: Invoice, kind: 'invoice') => void;
  container?: HTMLElement | null | undefined;
  unavailable?: (action: string) => void;
  onCorrectPayment?: (payment: PaymentItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('All modes');
  const [tdsFilter, setTdsFilter] = useState('All TDS sections');
  const [sort, setSort] = useState<'date' | 'remittance' | 'invoice' | 'customer' | 'cash' | 'tds' | 'net'>('date');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('10');
  const [menu, setMenu] = useState<number | null>(null);

  const isLive = apiClient.getMode() === 'live';
  const currentUser = apiClient.getCurrentUser();
  const effectiveRole = (isLive && currentUser?.role) ? currentUser.role : role;
  const canModify = canPay(effectiveRole);

  const [livePayments, setLivePayments] = useState<PaymentItem[]>([]);
  const [liveSummary, setLiveSummary] = useState<{ totalCash: number; totalTds: number; totalNet: number } | null>(null);
  const [liveLoaded, setLiveLoaded] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    let active = true;
    const fetchPayments = async () => {
      try {
        const fyFilter = (fy && fy !== 'ALL' && fy !== 'All') ? fy : undefined;
        const res = await apiClient.getPayments({ fy: fyFilter });
        if (!active) return;
        const items: PaymentItem[] = (res.data || []).map((p: any) => {
          const cashAmt = Number(p.cash_amount ?? p.payment_amount ?? 0);
          const tdsAmt = Number(p.tds_amount ?? 0);
          const netAmt = p.total_settled != null ? Number(p.total_settled) : (cashAmt + tdsAmt);
          return {
            id: p.id,
            invoice_id: p.invoice_id,
            parent_transaction_id: p.parent_transaction_id,
            is_superseded: p.is_superseded ?? false,
            transaction_type: p.transaction_type || 'PAYMENT',
            payment_amount: cashAmt,
            cash_amount: cashAmt,
            tds_amount: tdsAmt,
            tds_section: p.tds_section || null,
            payment_date: p.payment_date,
            payment_mode: p.payment_mode || 'NEFT',
            remittance_number: p.remittance_number || null,
            notes: p.notes || null,
            invoice: {
              id: p.invoice_id,
              invoice_number: p.invoice_number,
              po_number: p.invoice_number,
              customer_name: p.customer_name,
              computed_status: p.invoice_lifecycle_status || 'ISSUED',
              fy_code: p.fy_code,
              outstanding_balance: 0,
            } as any,
            invoice_number: p.invoice_number,
            invoice_lifecycle_status: p.invoice_lifecycle_status,
            customer_name: p.customer_name,
            net_settled: netAmt,
          };
        });
        setLivePayments(items);
        setLiveLoaded(true);
        if (res.summary) {
          setLiveSummary({
            totalCash: Number(res.summary.total_cash || 0),
            totalTds: Number(res.summary.total_tds || 0),
            totalNet: Number(res.summary.total_settled || 0),
          });
        }
      } catch (err) {
        console.error('Failed to fetch live payments:', err);
      }
    };
    void fetchPayments();
    return () => { active = false; };
  }, [isLive, fy, records]);

  // Derive flat payment list for the active FY from records (fallback for initial render or MOCK mode)
  const recordsPayments: PaymentItem[] = records
    .filter(inv => (fy === 'ALL' || fy === 'All' || !fy || inv.fy_code === fy) && (!isLive ? inv.computed_status !== 'CANCELLED' : true))
    .flatMap(inv =>
      (inv.payments || []).map((p: any) => {
        const cashAmt = Number(p.payment_amount ?? p.cash_amount ?? 0);
        const tdsAmt = Number(p.tds_amount ?? 0);
        const netAmt = p.total_settled != null ? Number(p.total_settled) : (cashAmt + tdsAmt);
        return {
          ...p,
          id: p.id ?? (inv.id * 1000),
          invoice_id: p.invoice_id ?? inv.id,
          parent_transaction_id: p.parent_transaction_id,
          is_superseded: p.is_superseded ?? false,
          transaction_type: p.transaction_type || 'PAYMENT',
          payment_amount: cashAmt,
          cash_amount: cashAmt,
          tds_amount: tdsAmt,
          invoice: inv,
          invoice_number: inv.invoice_number ?? inv.po_number,
          invoice_lifecycle_status: inv.computed_status,
          customer_name: inv.customer_name,
          net_settled: netAmt,
        };
      })
    );

  const allPayments: PaymentItem[] = (isLive && liveLoaded) ? livePayments : recordsPayments;

  // Aggregate totals (reversals are signed negative)
  const totalCash = (isLive && liveSummary)
    ? liveSummary.totalCash
    : allPayments.reduce((sum, p) => sum + (p.transaction_type === 'REVERSAL' && p.payment_amount > 0 ? -p.payment_amount : p.payment_amount), 0);
  const totalTds = (isLive && liveSummary)
    ? liveSummary.totalTds
    : allPayments.reduce((sum, p) => sum + (p.transaction_type === 'REVERSAL' && p.tds_amount > 0 ? -p.tds_amount : p.tds_amount), 0);
  const totalNet = (isLive && liveSummary)
    ? liveSummary.totalNet
    : (totalCash + totalTds);

  // Filter
  const filtered = empty
    ? []
    : allPayments
        .filter(p => {
          const matchesQuery = `${p.remittance_number ?? ''} ${p.invoice_number} ${p.customer_name} ${p.notes ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase());
          const matchesMode = modeFilter === 'All modes' || p.payment_mode === modeFilter;
          const matchesTds =
            tdsFilter === 'All TDS sections' ||
            (tdsFilter === 'No TDS' && (!p.tds_section || p.tds_amount === 0)) ||
            p.tds_section === tdsFilter;
          return matchesQuery && matchesMode && matchesTds;
        })
        .sort((a, b) => {
          const val = (item: PaymentItem) => {
            if (sort === 'date') return item.payment_date;
            if (sort === 'remittance') return item.remittance_number ?? '';
            if (sort === 'invoice') return item.invoice_number;
            if (sort === 'customer') return item.customer_name;
            if (sort === 'cash') return item.payment_amount;
            if (sort === 'tds') return item.tds_amount;
            return item.net_settled;
          };
          const av = val(a);
          const bv = val(b);
          return (
            (typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv))) * (asc ? 1 : -1)
          );
        });

  const count = Number(size);
  const pages = Math.max(1, Math.ceil(filtered.length / count));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * count, current * count);

  function reset() {
    setQuery('');
    setModeFilter('All modes');
    setTdsFilter('All TDS sections');
    setSort('date');
    setAsc(false);
    setPage(1);
  }

  function sortBy(key: typeof sort) {
    if (sort === key) setAsc(!asc);
    else {
      setSort(key);
      setAsc(false);
    }
  }

  return (
    <section className="cf-record-section" aria-label="Payments ledger">
      {/* Summary KPI cards */}
      <div className="cf-metrics cf-payments-metrics">
        <div className="cf-metric">
          <div>
            <Wallet size={16} />
            <span>Total Settled</span>
          </div>
          <strong>{money(totalNet)}</strong>
          <small>{allPayments.length} recorded payments in {fy}</small>
        </div>
        <div className="cf-metric">
          <div>
            <CheckCircle2 size={16} />
            <span>Cash Collected</span>
          </div>
          <strong>{money(totalCash)}</strong>
          <small>Direct bank / remittance inflows</small>
        </div>
        <div className="cf-metric">
          <div>
            <ShieldCheck size={16} />
            <span>TDS Recognized</span>
          </div>
          <strong>{money(totalTds)}</strong>
          <small>Withheld under Income Tax sections</small>
        </div>
        <div className="cf-metric">
          <div>
            <FileText size={16} />
            <span>Settlement Efficiency</span>
          </div>
          <strong>{allPayments.length > 0 ? `${Math.round((totalCash / (totalNet || 1)) * 100)}%` : '0%'}</strong>
          <small>Cash proportion of settlements</small>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="cf-table-tools">
        <div className="cf-table-search">
          <Search size={18} />
          <Input
            aria-label="Search payments"
            placeholder="Search remittance, invoice, customer"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterChoice
          label="Mode filter"
          value={modeFilter}
          options={['All modes', 'NEFT', 'RTGS', 'CHEQUE', 'UPI', 'CASH', 'WIRE', 'OTHER']}
          onChange={val => {
            setModeFilter(val);
            setPage(1);
          }}
        />
        <FilterChoice
          label="TDS filter"
          value={tdsFilter}
          options={['All TDS sections', '194J (2%)', '194J (10%)', '194C (2%)', '194C (1%)', '194Q (0.1%)', 'No TDS']}
          onChange={val => {
            setTdsFilter(val);
            setPage(1);
          }}
        />
        <Button variant="outline" size="icon" title="Reset filters" aria-label="Reset filters" onClick={reset}>
          <SlidersHorizontal />
        </Button>
      </div>

      {/* Mobile sort row */}
      <div className="cf-sort-mobile">
        <FilterChoice
          label="Sort payments"
          value={sort}
          options={['date', 'remittance', 'invoice', 'customer', 'cash', 'tds', 'net']}
          onChange={val => setSort(val as typeof sort)}
        />
        <Button variant="outline" size="icon" aria-label="Reverse sort direction" onClick={() => setAsc(!asc)}>
          <ArrowUpDown />
        </Button>
      </div>

      {rows.length ? (
        <>
          {/* Desktop & Tablet Table (>= 601px) */}
          <div className="cf-table-container">
            <table className="cf-table cf-payments-table">
              <thead>
                <tr>
                  <th aria-sort={sort === 'remittance' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('remittance')}>
                      Remittance # <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th aria-sort={sort === 'date' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('date')}>
                      Date <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th aria-sort={sort === 'invoice' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('invoice')}>
                      Invoice <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th aria-sort={sort === 'customer' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('customer')}>
                      Customer <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Mode</th>
                  <th className="cf-number" aria-sort={sort === 'cash' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('cash')}>
                      Cash <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number" aria-sort={sort === 'tds' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('tds')}>
                      TDS <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th className="cf-number" aria-sort={sort === 'net' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => sortBy('net')}>
                      Net Settled <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Notes</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isReversal = row.transaction_type === 'REVERSAL';
                  const isEligibleForCorrection = row.transaction_type === 'PAYMENT' && !row.is_superseded && row.invoice_lifecycle_status !== 'CANCELLED';
                  const displayCash = isReversal && row.payment_amount > 0 ? -row.payment_amount : row.payment_amount;
                  const displayTds = isReversal && row.tds_amount > 0 ? -row.tds_amount : row.tds_amount;
                  const displayNet = isReversal && row.net_settled > 0 ? -row.net_settled : row.net_settled;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>{row.remittance_number || `PAY-${row.id}`}</strong>
                            {isReversal ? (
                              <span
                                className="cf-badge cf-badge-reversal"
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.65rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  fontWeight: 600,
                                  color: '#dc2626',
                                  backgroundColor: '#fef2f2',
                                  border: '1px solid #fecaca',
                                }}
                              >
                                REVERSAL
                              </span>
                            ) : (
                              <span
                                className="cf-badge cf-badge-payment"
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.65rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  fontWeight: 600,
                                  color: '#15803d',
                                  backgroundColor: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                }}
                              >
                                PAYMENT
                              </span>
                            )}
                            {row.is_superseded && (
                              <span
                                className="cf-badge cf-badge-superseded"
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.65rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  fontWeight: 600,
                                  color: '#64748b',
                                  backgroundColor: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                }}
                              >
                                SUPERSEDED
                              </span>
                            )}
                          </div>
                          {row.parent_transaction_id && (
                            <small style={{ color: '#64748b' }}>
                              Reversal of #{row.parent_transaction_id}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>{dateLabel(row.payment_date)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Button variant="link" onClick={() => openInvoice(row.invoice, 'invoice')}>
                            {row.invoice_number}
                          </Button>
                          {row.invoice_lifecycle_status === 'CANCELLED' && (
                            <span
                              className="cf-badge cf-badge-cancelled"
                              style={{
                                display: 'inline-block',
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                                color: '#dc2626',
                                backgroundColor: '#fef2f2',
                                border: '1px solid #fecaca',
                              }}
                            >
                              Cancelled
                            </span>
                          )}
                        </div>
                      </td>
                      <td><strong>{row.customer_name}</strong></td>
                      <td><span className="cf-status partial">{row.payment_mode}</span></td>
                      <td className="cf-number">
                        <strong style={isReversal ? { color: '#dc2626' } : undefined}>{money(displayCash)}</strong>
                      </td>
                      <td className="cf-number">
                        <strong style={isReversal ? { color: '#dc2626' } : undefined}>{money(displayTds)}</strong>
                        {row.tds_section && <small>{row.tds_section}</small>}
                      </td>
                      <td className="cf-number cf-balance">
                        <strong style={isReversal ? { color: '#dc2626' } : undefined}>{money(displayNet)}</strong>
                      </td>
                      <td><small>{row.notes || '—'}</small></td>
                      <td className="cf-actions-cell">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View invoice ${row.invoice_number}`}
                          onClick={() => openInvoice(row.invoice, 'invoice')}
                        >
                          <ArrowUpRight size={18} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for payment ${row.remittance_number || row.id}`}
                          aria-expanded={menu === row.id}
                          onClick={() => setMenu(menu === row.id ? null : row.id)}
                        >
                          <MoreHorizontal size={18} />
                        </Button>
                        {menu === row.id && (
                          <div className="cf-row-menu">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                openInvoice(row.invoice, 'invoice');
                                setMenu(null);
                              }}
                            >
                              View Invoice Details
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                openInvoice(row.invoice, 'invoice');
                                setMenu(null);
                              }}
                            >
                              View Payment History
                            </Button>
                            {canModify && isEligibleForCorrection && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setMenu(null);
                                  if (onCorrectPayment) onCorrectPayment(row);
                                  else if (unavailable) unavailable('Administrative Payment Correction');
                                }}
                              >
                                Correct / Reverse Payment
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards Layout (<= 600px) */}
          <div className="cf-mobile-cards">
            {rows.map(row => {
              const isReversal = row.transaction_type === 'REVERSAL';
              const isEligibleForCorrection = row.transaction_type === 'PAYMENT' && !row.is_superseded && row.invoice_lifecycle_status !== 'CANCELLED';
              const displayCash = isReversal && row.payment_amount > 0 ? -row.payment_amount : row.payment_amount;
              const displayTds = isReversal && row.tds_amount > 0 ? -row.tds_amount : row.tds_amount;
              const displayNet = isReversal && row.net_settled > 0 ? -row.net_settled : row.net_settled;

              return (
                <article className="cf-record-card" key={row.id}>
                  <header>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong>{row.remittance_number || `PAY-${row.id}`}</strong>
                        {isReversal ? (
                          <span
                            className="cf-badge cf-badge-reversal"
                            style={{
                              display: 'inline-block',
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                              color: '#dc2626',
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fecaca',
                            }}
                          >
                            REVERSAL
                          </span>
                        ) : (
                          <span
                            className="cf-badge cf-badge-payment"
                            style={{
                              display: 'inline-block',
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                              color: '#15803d',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            PAYMENT
                          </span>
                        )}
                        {row.is_superseded && (
                          <span
                            className="cf-badge cf-badge-superseded"
                            style={{
                              display: 'inline-block',
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                              color: '#64748b',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            SUPERSEDED
                          </span>
                        )}
                      </div>
                      {row.parent_transaction_id && (
                        <small style={{ color: '#64748b' }}>
                          Reversal of #{row.parent_transaction_id}
                        </small>
                      )}
                    </div>
                    <span className="cf-status partial">{row.payment_mode}</span>
                  </header>
                  <h3>{row.customer_name}</h3>
                  <dl>
                    <div>
                      <dt>Invoice</dt>
                      <dd>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Button variant="link" onClick={() => openInvoice(row.invoice, 'invoice')}>
                            {row.invoice_number}
                          </Button>
                          {row.invoice_lifecycle_status === 'CANCELLED' && (
                            <span
                              className="cf-badge cf-badge-cancelled"
                              style={{
                                display: 'inline-block',
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                                color: '#dc2626',
                                backgroundColor: '#fef2f2',
                                border: '1px solid #fecaca',
                              }}
                            >
                              Cancelled
                            </span>
                          )}
                        </div>
                      </dd>
                    </div>
                    <div>
                      <dt>Payment Date</dt>
                      <dd>{dateLabel(row.payment_date)}</dd>
                    </div>
                    <div>
                      <dt>Cash Paid</dt>
                      <dd style={isReversal ? { color: '#dc2626' } : undefined}>{money(displayCash)}</dd>
                    </div>
                    <div>
                      <dt>TDS Deducted</dt>
                      <dd style={isReversal ? { color: '#dc2626' } : undefined}>{money(displayTds)}{row.tds_section ? ` (${row.tds_section})` : ''}</dd>
                    </div>
                    <div>
                      <dt>Net Settled</dt>
                      <dd className="cf-balance" style={isReversal ? { color: '#dc2626' } : undefined}><strong>{money(displayNet)}</strong></dd>
                    </div>
                    <div>
                      <dt>Notes</dt>
                      <dd>{row.notes || '—'}</dd>
                    </div>
                  </dl>
                  <footer>
                    <Button variant="ghost" onClick={() => openInvoice(row.invoice, 'invoice')}>
                      View Invoice <ArrowUpRight size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for payment ${row.remittance_number || row.id}`}
                      onClick={() => setMenu(menu === row.id ? null : row.id)}
                    >
                      <MoreHorizontal size={18} />
                    </Button>
                  </footer>
                  {menu === row.id && (
                    <div className="cf-row-menu">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          openInvoice(row.invoice, 'invoice');
                          setMenu(null);
                        }}
                      >
                        View Invoice Details
                      </Button>
                      {canModify && isEligibleForCorrection && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setMenu(null);
                            if (onCorrectPayment) onCorrectPayment(row);
                            else if (unavailable) unavailable('Administrative Payment Correction');
                          }}
                        >
                          Correct / Reverse Payment
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState onReset={reset} />
      )}

      {/* Pagination Footer */}
      <footer className="cf-table-footer">
        <span>
          {filtered.length
            ? `${(current - 1) * count + 1}–${Math.min(current * count, filtered.length)} of ${filtered.length}`
            : '0 records'}
        </span>
        <div>
          <FilterChoice
            label="Rows per page"
            value={size}
            options={['5', '10', '25']}
            onChange={val => {
              setSize(val);
              setPage(1);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span>{current} / {pages}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </footer>
    </section>
  );
}
