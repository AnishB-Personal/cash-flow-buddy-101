import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancialDashboard } from '@/components/collectflow/dashboard';
import { RecordList } from '@/components/collectflow/record-list';
import { RecordDrawer } from '@/components/collectflow/record-drawer';
import { data, asOfDate } from '@/data/collectflow';
import { agingAsOf, overdueLabel } from '@/data/records';
import { classifyAging } from '@/data/reporting';

afterEach(cleanup);
const listProps = { fy: 'FY 2026-27', role: 'finance' as const, clearBucket: vi.fn(), open: vi.fn(), unavailable: vi.fn() };
describe('aging reporting context across approved views', () => {
 it('shows the same reporting date in dashboard and populated or empty aging results', () => {
  const dashboard = render(<FinancialDashboard fy="FY 2026-27" role="finance" empty={false} selectAging={vi.fn()}/>);
  expect(screen.getByText(agingAsOf())).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Current \/ Not Due 1 invoice/ })).toBeInTheDocument();
  dashboard.unmount();
  for (const bucket of ['Current / Not Due', '1–30 days']) {
   const view = render(<RecordList {...listProps} screen="AR Aging" bucket={bucket}/>);
   expect(screen.getByText(agingAsOf())).toBeInTheDocument();
   expect(screen.queryByText('PO-NEXUS-881')).not.toBeInTheDocument();
   if (bucket === '1–30 days') expect(screen.getByText('No matching records')).toBeInTheDocument();
   view.unmount();
  }
 });
 it('matches invoice table, mobile card and drawer indicators to the shared classification', () => {
  const invoice = data.invoices[0];
  if (!invoice) throw new Error('Missing supplied invoice');
  expect(classifyAging(invoice, asOfDate)).toMatchObject({ bucket: 'Current / Not Due', daysOverdue: 0, overdue: false });
  const view = render(<RecordList {...listProps} screen="Invoices" bucket={null}/>);
  expect(within(screen.getByRole('table')).getByText(overdueLabel(invoice))).toBeInTheDocument();
  const card = view.container.querySelector('.cf-mobile-cards');
  if (!card) throw new Error('Missing mobile cards');
  expect(within(card as HTMLElement).getByText(overdueLabel(invoice))).toBeInTheDocument();
  expect(screen.getByText(agingAsOf())).toBeInTheDocument();
  view.unmount();
  render(<RecordDrawer record={invoice} kind="invoice" role="finance" close={vi.fn()} unavailable={vi.fn()}/>);
  expect(screen.getByText(agingAsOf())).toBeInTheDocument();
  expect(screen.getByText(overdueLabel(invoice))).toBeInTheDocument();
  expect(screen.getByText('Partial')).toBeInTheDocument();
 });
});