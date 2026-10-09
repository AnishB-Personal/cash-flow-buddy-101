import { describe, expect, it } from 'vitest';
import { data, asOfDate, aging } from '@/data/collectflow';
import { agingBuckets, classifyAging, summarizeAging, agingDateLabel, type AgingRecord } from '@/data/reporting';
import { snapshot, selectRecords, overdueLabel, invoiceAging } from '@/data/records';

const row: AgingRecord = { invoice_number: 'TEST-ONLY', due_date: '2026-04-30', computed_status: 'PARTIAL', outstanding_balance: 322000 };
const dueAtOffset = (days: number) => new Date(Date.parse(`${asOfDate}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
describe('explicit reporting-date aging', () => {
 it('pins the chosen month-end date after supplied activity and before the invoice due date', () => {
  expect(asOfDate).toBe('2026-04-30');
  expect(agingDateLabel(asOfDate)).toBe('Aging as of 30 Apr 2026');
  for (const invoice of data.invoices) {
   expect(invoice.po_date <= asOfDate).toBe(true);
   for (const payment of invoice.payments) expect(payment.payment_date <= asOfDate).toBe(true);
  }
 });
 it.each([[-1, 0], [0, 0], [1, 1], [30, 1], [31, 2], [60, 2], [61, 3], [90, 3], [91, 4], [180, 4], [181, 5]])('classifies %i days past due in bucket %i', (days, index) => {
  expect(classifyAging({ ...row, due_date: dueAtOffset(days) }, asOfDate)).toEqual({ daysOverdue: Math.max(0, days), overdue: days > 0, bucket: agingBuckets[index] });
 });
 it('uses calendar days regardless of local timezone or DST', () => {
  const prior = process.env.TZ;
  try {
   for (const timezone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    process.env.TZ = timezone;
    expect(classifyAging({ ...row, due_date: '2026-03-08' }, '2026-03-09').daysOverdue).toBe(1);
   }
  } finally {
   if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior;
  }
 });
 it('rejects invalid dates instead of silently treating them as current', () => {
  expect(() => classifyAging(row, '2026-02-30')).toThrow('Invalid reporting calendar date');
  expect(() => classifyAging({ ...row, due_date: 'bad' }, asOfDate)).toThrow();
 });
 it('handles missing due dates without inventing them', () => {
  expect(classifyAging({ ...row, due_date: null }, asOfDate)).toEqual({ daysOverdue: 0, overdue: false, bucket: 'Current / Not Due' });
 });
 it.each([
  { ...row, invoice_number: null }, { ...row, invoice_number: ' ' },
  { ...row, computed_status: 'CANCELLED' }, { ...row, computed_status: 'PAID', outstanding_balance: 0 },
  { ...row, outstanding_balance: -1 },
 ])('excludes non-receivables %#', invoice => {
  expect(classifyAging(invoice, asOfDate)).toEqual({ daysOverdue: 0, overdue: false, bucket: undefined });
  expect(summarizeAging([invoice], asOfDate).every(bucket => bucket.count === 0 && bucket.amount === 0)).toBe(true);
 });
 it('keeps a partial payment status separate from overdue status', () => {
  const invoice = data.invoices[0];
  if (!invoice) throw new Error('Missing supplied invoice');
  expect(overdueLabel(invoice, '2026-05-13')).toBe('Overdue · 1 day overdue');
  expect(invoiceAging(invoice, '2026-05-13')).toBe('1–30 days');
  expect(invoice.computed_status).toBe('PARTIAL');
 });
 it('reconciles every bucket and drill-down at the snapshot date and later boundary dates', () => {
  for (const reference of [asOfDate, '2026-05-13', '2026-06-12', '2026-07-12', '2026-08-11', '2026-11-09']) {
   const k = snapshot('FY 2026-27', 'finance', reference);
   for (const bucket of k.aging) {
    const members = selectRecords('AR Aging', 'FY 2026-27', 'finance', '', 'All statuses', 'All executives', bucket.bucket, reference);
    expect(members).toHaveLength(bucket.count);
    expect(members.reduce((sum, invoice) => sum + invoice.outstanding_balance, 0)).toBe(bucket.amount);
    expect(members.every(invoice => invoice.invoice_number && invoiceAging(invoice, reference) === bucket.bucket)).toBe(true);
   }
   expect(k.aging.reduce((sum, bucket) => sum + bucket.amount, 0)).toBe(322000);
  }
 });
 it('preserves all financial amounts and normalizes the six supplied categories', () => {
  const k = snapshot('FY 2026-27', 'finance');
  expect(k).toMatchObject({ invoiced: 531000, cash: 200000, tds: 9000, settled: 209000, outstanding: 322000, unbilled: 295000, overdue: 0, rate: 39.4 });
  expect(data.invoices).toHaveLength(2);
  expect(aging.map(({ bucket, amount }) => ({ bucket, amount }))).toEqual(data.dashboard_summary.aging);
  expect(aging.map(bucket => bucket.count)).toEqual([1, 0, 0, 0, 0, 0]);
 });
});