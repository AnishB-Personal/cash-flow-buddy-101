import { describe, expect, it } from 'vitest';
import { data } from '@/data/collectflow';
import { snapshot } from '@/data/records';
import { readReferences } from '@/data/references';
import {
  orderCreateSchema,
  orderConvertSchema,
  orderEditSchema,
  orderCreateExample,
  orderRecurringExample,
  orderConvertExample,
  orderEditExample,
  orderPermitted,
  reviewOrder,
  createOrderAdapter,
  isDateInFiscalYear,
  calculateNet30DueDate,
} from '@/data/orders';

describe('Stage 2 Order & Invoice Lifecycle Contracts', () => {
  const refs = readReferences();
  const invoices = structuredClone(data.invoices);

  it('validates order creation schemas and requires positive values and date in FY', () => {
    expect(orderCreateSchema.safeParse(orderCreateExample).success).toBe(true);
    expect(orderCreateSchema.safeParse(orderRecurringExample).success).toBe(true);

    // Negative unit price
    expect(orderCreateSchema.safeParse({ ...orderCreateExample, unit_price: '-10' }).success).toBe(false);
    // Zero or negative quantity
    expect(orderCreateSchema.safeParse({ ...orderCreateExample, quantity: '0' }).success).toBe(false);
    // Invalid date format
    expect(orderCreateSchema.safeParse({ ...orderCreateExample, po_date: '2026-02-31' }).success).toBe(false);
  });

  it('validates date boundaries against Indian fiscal years', () => {
    const fy = refs.years.find(y => y.code === 'FY 2026-27')!;
    expect(isDateInFiscalYear('2026-04-10', fy.start_date, fy.end_date)).toBe(true);
    expect(isDateInFiscalYear('2027-03-31', fy.start_date, fy.end_date)).toBe(true);
    expect(isDateInFiscalYear('2026-03-31', fy.start_date, fy.end_date)).toBe(false);
    expect(isDateInFiscalYear('2027-04-01', fy.start_date, fy.end_date)).toBe(false);

    expect(() =>
      reviewOrder(
        'order-create',
        '',
        { ...orderCreateExample, po_date: '2025-05-10' },
        'finance',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/outside financial year/);
  });

  it('calculates Net-30 due date accurately', () => {
    expect(calculateNet30DueDate('2026-04-10')).toBe('2026-05-10');
    expect(calculateNet30DueDate('2026-04-20')).toBe('2026-05-20');
    expect(calculateNet30DueDate('2026-01-31')).toBe('2026-03-02');
  });

  it('enforces role-based permissions for order workflows', () => {
    // Sales can create orders, but cannot edit, convert, or delete
    expect(orderPermitted('sales', 'order-create')).toBe(true);
    expect(orderPermitted('sales', 'order-edit')).toBe(false);
    expect(orderPermitted('sales', 'order-convert')).toBe(false);
    expect(orderPermitted('sales', 'order-delete')).toBe(false);

    // Finance and Admin have full permissions
    expect(orderPermitted('finance', 'order-create')).toBe(true);
    expect(orderPermitted('finance', 'order-edit')).toBe(true);
    expect(orderPermitted('finance', 'order-convert')).toBe(true);
    expect(orderPermitted('finance', 'order-delete')).toBe(true);

    expect(orderPermitted('admin', 'order-create')).toBe(true);
    expect(orderPermitted('admin', 'order-edit')).toBe(true);
    expect(orderPermitted('admin', 'order-convert')).toBe(true);
    expect(orderPermitted('admin', 'order-delete')).toBe(true);

    // Viewer is completely read-only
    expect(orderPermitted('viewer', 'order-create')).toBe(false);
    expect(orderPermitted('viewer', 'order-edit')).toBe(false);
    expect(orderPermitted('viewer', 'order-convert')).toBe(false);
    expect(orderPermitted('viewer', 'order-delete')).toBe(false);
  });

  it('enforces PO number uniqueness except for placeholder names', () => {
    // Duplicate existing PO
    expect(() =>
      reviewOrder(
        'order-create',
        '',
        { ...orderCreateExample, po_number: 'PO-CORP-2026-099' },
        'sales',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/already registered/);

    // Case-insensitive duplicate check
    expect(() =>
      reviewOrder(
        'order-create',
        '',
        { ...orderCreateExample, po_number: 'po-nexus-881' },
        'sales',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/already registered/);
  });

  it('applies verified order creation rehearsal without impacting issued receivables', async () => {
    const adapter = createOrderAdapter();
    const rev = reviewOrder('order-create', '', orderCreateExample, 'sales', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(true);
    expect(rev.impact.unbilledDelta).toBe(118000);
    expect(rev.impact.invoicedDelta).toBe(0);
    expect(rev.impact.outstandingDelta).toBe(0);

    const updated = await adapter.confirm(rev, 'sales', invoices, refs, 'FY 2026-27');
    expect(updated).toHaveLength(invoices.length + 1);

    const created = updated.find(i => i.po_number === 'PO-2026-DEMO-001')!;
    expect(created).toBeDefined();
    expect(created.computed_status).toBe('UNBILLED');
    expect(created.total_amount).toBe(118000);
    expect(created.invoice_number).toBeNull();

    // Verify baseline snapshot comparison
    const baseSnap = snapshot('FY 2026-27', 'finance', undefined, invoices);
    const updatedSnap = snapshot('FY 2026-27', 'finance', undefined, updated);
    expect(updatedSnap.invoiced).toBe(baseSnap.invoiced); // Issued invoiced unchanged (531,000)
    expect(updatedSnap.outstanding).toBe(baseSnap.outstanding); // Outstanding unchanged (322,000)
    expect(updatedSnap.cash).toBe(baseSnap.cash); // Cash unchanged (200,000)
    expect(updatedSnap.unbilled).toBe(baseSnap.unbilled + 118000); // 295,000 + 118,000 = 413,000
    expect(updatedSnap.unbilledCount).toBe(baseSnap.unbilledCount + 1);
  });

  it('converts unbilled PO 102 to issued invoice INV-2026-045 and updates financial metrics', async () => {
    const adapter = createOrderAdapter();
    const rev = reviewOrder('order-convert', '102', orderConvertExample, 'finance', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(true);
    expect(rev.impact.invoicedDelta).toBe(295000);
    expect(rev.impact.outstandingDelta).toBe(295000);
    expect(rev.impact.unbilledDelta).toBe(-295000);

    const updated = await adapter.confirm(rev, 'finance', invoices, refs, 'FY 2026-27');
    const converted = updated.find(i => i.id === 102)!;
    expect(converted.invoice_number).toBe('INV-2026-045');
    expect(converted.invoice_date).toBe('2026-04-20');
    expect(converted.due_date).toBe('2026-05-20');
    expect(converted.computed_status).toBe('PENDING');

    const updatedSnap = snapshot('FY 2026-27', 'finance', undefined, updated);
    expect(updatedSnap.invoiced).toBe(531000 + 295000); // 826,000
    expect(updatedSnap.outstanding).toBe(322000 + 295000); // 617,000
    expect(updatedSnap.unbilled).toBe(0);
    expect(updatedSnap.unbilledCount).toBe(0);
    expect(updatedSnap.count).toBe(2);
  });

  it('guards against converting already issued invoices or duplicate invoice numbers', () => {
    // Attempting to convert invoice 101 (already issued)
    expect(() =>
      reviewOrder('order-convert', '101', orderConvertExample, 'finance', invoices, refs, 'FY 2026-27')
    ).toThrow(/already been converted/);

    // Duplicate invoice number
    expect(() =>
      reviewOrder(
        'order-convert',
        '102',
        { ...orderConvertExample, invoice_number: 'INV-2026-042' },
        'finance',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/already assigned/);
  });

  it('enforces immutability on issued invoices when editing metadata', async () => {
    const inv101 = invoices.find(i => i.id === 101)!;
    const example101 = orderEditExample(inv101);

    // Editing remarks & due_date is permitted
    const rev = reviewOrder('order-edit', '101', example101, 'finance', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(true);

    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(rev, 'finance', invoices, refs, 'FY 2026-27');
    const updated101 = updated.find(i => i.id === 101)!;
    expect(updated101.due_date).toBe('2026-05-15');
    expect(updated101.remarks).toBe(example101['remarks']);
    // Totals remain unchanged
    expect(updated101.total_amount).toBe(inv101.total_amount);

    // Attempting to modify PO number on issued invoice fails with immutability error
    expect(() =>
      reviewOrder(
        'order-edit',
        '101',
        { ...example101, po_number: 'PO-MODIFIED' },
        'finance',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/legally immutable/);

    // Attempting to modify customer ID on issued invoice fails
    expect(() =>
      reviewOrder(
        'order-edit',
        '101',
        { ...example101, customer_id: '2' },
        'finance',
        invoices,
        refs,
        'FY 2026-27'
      )
    ).toThrow(/legally immutable/);
  });

  it('allows unbilled PO metadata editing before invoicing', async () => {
    const ord102 = invoices.find(i => i.id === 102)!;
    const example102 = orderEditExample(ord102);

    const rev = reviewOrder('order-edit', '102', example102, 'finance', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(true);

    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(rev, 'finance', invoices, refs, 'FY 2026-27');
    const updated102 = updated.find(i => i.id === 102)!;
    expect(updated102.po_date).toBe('2026-04-16');
    expect(updated102.due_date).toBe('2026-05-30');
    expect(updated102.line_items[0]?.description).toBe('DevOps Pipeline & CI/CD Implementation');
    expect(updated102.total_amount).toBe(ord102.total_amount); // Financials remain unchanged
  });

  it('allows deleting unbilled order 102 and blocks deleting issued invoice 101', async () => {
    // Attempting to delete issued invoice 101 is strictly blocked
    expect(() =>
      reviewOrder('order-delete', '101', {}, 'finance', invoices, refs, 'FY 2026-27')
    ).toThrow(/Issued commercial invoices cannot be permanently deleted/);

    // Deleting unbilled order 102 is permitted
    const rev = reviewOrder('order-delete', '102', {}, 'finance', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(true);
    expect(rev.impact.unbilledDelta).toBe(-295000);

    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(rev, 'finance', invoices, refs, 'FY 2026-27');
    expect(updated.find(i => i.id === 102)).toBeUndefined();
    expect(updated).toHaveLength(invoices.length - 1);

    const updatedSnap = snapshot('FY 2026-27', 'finance', undefined, updated);
    expect(updatedSnap.unbilled).toBe(0);
    expect(updatedSnap.unbilledCount).toBe(0);
    expect(updatedSnap.invoiced).toBe(531000); // Invoice 101 intact
    expect(updatedSnap.outstanding).toBe(322000);
  });

  it('marks arbitrary custom inputs as review-only without mutating state', async () => {
    const custom = { ...orderCreateExample, line_item_description: 'Arbitrary custom services' };
    const rev = reviewOrder('order-create', '', custom, 'sales', invoices, refs, 'FY 2026-27');
    expect(rev.supported).toBe(false);
    expect(rev.message).toContain('Review only');
    expect(rev.after).toBeNull();

    const adapter = createOrderAdapter();
    await expect(adapter.confirm(rev, 'sales', invoices, refs, 'FY 2026-27')).rejects.toThrow(
      /Review only/
    );
  });

  it('enforces adapter idempotency and context integrity', async () => {
    const adapter = createOrderAdapter();
    const rev = reviewOrder('order-create', '', orderCreateExample, 'sales', invoices, refs, 'FY 2026-27');

    const first = await adapter.confirm(rev, 'sales', invoices, refs, 'FY 2026-27');
    expect(first).toHaveLength(invoices.length + 1);

    // Second confirmation throws duplicate
    await expect(adapter.confirm(rev, 'sales', invoices, refs, 'FY 2026-27')).rejects.toThrow(
      /already applied/
    );

    // Resetting clears cache
    adapter.reset();
    const second = await adapter.confirm(rev, 'sales', invoices, refs, 'FY 2026-27');
    expect(second).toHaveLength(invoices.length + 1);
  });
});
