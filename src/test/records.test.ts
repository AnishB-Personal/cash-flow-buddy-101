import { describe, expect, it } from 'vitest';
import { data } from '@/data/collectflow';
import { snapshot, selectRecords, canPay, canWrite } from '@/data/records';
describe('selected workspace financial semantics',()=>{
 it('reconciles all supplied totals without treating unbilled orders as receivables',()=>{
 const k=snapshot('FY 2026-27','finance');const supplied=data.dashboard_summary.kpis;
 expect(k.invoiced).toBe(supplied.total_invoiced);expect(k.cash).toBe(supplied.total_cash_collected);expect(k.tds).toBe(supplied.total_tds_recognized);expect(k.settled).toBe(supplied.total_settled);expect(k.outstanding).toBe(supplied.total_outstanding);expect(k.rate).toBe(supplied.overall_collection_rate);expect(k.unbilled).toBe(295000);expect(k.overdue).toBe(0);expect(k.aging.reduce((sum,a)=>sum+a.amount,0)).toBe(k.outstanding);
 });
 it('excludes unissued records from invoice and aging lists',()=>{expect(selectRecords('Orders','FY 2026-27','finance')).toHaveLength(2);expect(selectRecords('Invoices','FY 2026-27','finance')).toHaveLength(1);expect(selectRecords('AR Aging','FY 2026-27','finance')).toHaveLength(1);expect(selectRecords('AR Aging','FY 2026-27','finance','','All statuses','All executives','1–30 days')).toHaveLength(0);});
 it('respects financial-year subsets and zero-balance snapshot states',()=>{expect(selectRecords('Orders','FY 2025-26','finance')).toHaveLength(0);expect(snapshot('FY 2025-26','finance').outstanding).toBe(0);});
 it('allows sales reads but not financial updates',()=>{expect(selectRecords('Orders','FY 2026-27','sales')).toHaveLength(2);expect(canPay('sales')).toBe(false);expect(canPay('finance')).toBe(true);expect(canWrite('viewer')).toBe(false);});
 it('applies screen-local search, status and executive filters',()=>{expect(selectRecords('Orders','FY 2026-27','finance','nexus')).toHaveLength(1);expect(selectRecords('Invoices','FY 2026-27','finance','','UNBILLED')).toHaveLength(0);expect(selectRecords('Orders','FY 2026-27','finance','','All statuses','Kavya Nair')[0]?.id).toBe(102);});
});
