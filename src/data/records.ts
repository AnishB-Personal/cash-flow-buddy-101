import { data, aging, type Invoice } from './collectflow';
export type Role = 'admin' | 'finance' | 'sales' | 'viewer';
export type Screen = 'Dashboard' | 'Orders' | 'Invoices' | 'AR Aging';
export const issued = (row: Invoice) => Boolean(row.invoice_number);
export const isReceivable = (row: Invoice) => issued(row) && row.computed_status !== 'CANCELLED' && row.outstanding_balance > 0;
// Membership is part of this static snapshot, not aging recalculated using today's date.
export const agingMembership: Record<number, string> = { 101: 'Current / Not Due' };
export const invoiceAging = (row: Invoice) => isReceivable(row) ? agingMembership[row.id] : undefined;
export const overdue = (row: Invoice) => Boolean(invoiceAging(row) && invoiceAging(row) !== 'Current / Not Due');
export const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';
export const labelStatus = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
export function selectRecords(screen: Screen, fy: string, _role: Role, query = '', status = 'All statuses', executive = 'All executives', bucket: string | null = null) {
 return data.invoices.filter(row => row.fy_code === fy && (screen !== 'Invoices' && screen !== 'AR Aging' || issued(row)) && (screen !== 'AR Aging' || isReceivable(row)) && (!bucket || invoiceAging(row) === bucket) && (status === 'All statuses' || row.computed_status === status) && (executive === 'All executives' || row.executive_name === executive) && `${row.customer_name} ${row.po_number} ${row.invoice_number ?? ''}`.toLowerCase().includes(query.toLowerCase()));
}
export function snapshot(fy: string, role: Role) {
 const rows = selectRecords('Orders', fy, role);
 // Aggregate supplied amounts only. Cash+TDS/outstanding originate in the supplied snapshot.
 const invoices = rows.filter(row => issued(row) && row.computed_status !== 'CANCELLED');
 const sum = (field: 'total_amount' | 'outstanding_balance' | 'total_cash_paid' | 'total_tds_deducted' | 'total_paid', list = invoices) => list.reduce((total, row) => total + row[field], 0);
 const invoiced = sum('total_amount'); const cash = sum('total_cash_paid'); const tds = sum('total_tds_deducted');
 return { invoiced, cash, tds, settled: sum('total_paid'), outstanding: sum('outstanding_balance'), rate: invoiced ? Math.round((cash + tds) / invoiced * 1000) / 10 : 0, overdue: sum('outstanding_balance', invoices.filter(overdue)), unbilled: sum('total_amount', rows.filter(row => !issued(row))), unbilledCount: rows.filter(row => !issued(row)).length, count: invoices.length, aging: aging.map(item => ({ bucket: item.bucket, amount: sum('outstanding_balance', invoices.filter(row => invoiceAging(row) === item.bucket)), count: invoices.filter(row => invoiceAging(row) === item.bucket).length })) };
}
export const canWrite = (role: Role) => role === 'admin' || role === 'finance' || role === 'sales';
export const canPay = (role: Role) => role === 'admin' || role === 'finance';
