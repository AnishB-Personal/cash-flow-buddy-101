import { describe, expect, it } from 'vitest';
import { data, aging, money } from '@/data/collectflow';
describe('CollectFlow shared financial fixtures', () => {
 it('preserves cash and TDS reconciliation', () => {
  const k = data.dashboard_summary.kpis;
  expect(k.total_cash_collected + k.total_tds_recognized).toBe(k.total_settled);
  expect(k.total_invoiced - k.total_settled).toBe(k.total_outstanding);
 });
 it('retains supplied aging amounts in the original six-bucket taxonomy', () => {
  expect(aging).toHaveLength(6);
  expect(aging.reduce((sum,row)=>sum+row.amount,0)).toBe(data.dashboard_summary.kpis.total_outstanding);
 });
 it('formats Indian currency without changing fixture amounts', () => {
  expect(money(531000)).toBe('₹5,31,000');
  expect(data.invoices).toHaveLength(2);
 });
});
