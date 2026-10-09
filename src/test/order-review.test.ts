import { beforeEach, describe, expect, it } from 'vitest';
import { readReferences, type References } from '@/data/references';
import { data, type Invoice } from '@/data/collectflow';
import { reviewOrder, createOrderAdapter, type FieldChange } from '@/data/orders';

describe('Edit Order Review and Confirmation Change Set (Data Layer)', () => {
  let invoices: Invoice[];
  let refs: References;

  beforeEach(() => {
    invoices = structuredClone(data.invoices);
    refs = readReferences();
  });

  it('computes changes with previous and current values for PO date, due date, remarks, executive, item description', async () => {
    const ord102 = invoices.find(i => i.id === 102)!;
    expect(ord102.po_date).toBe('2026-04-14');
    expect(ord102.due_date).toBeNull();
    expect(ord102.remarks).toBe('Pending project kickoff');
    expect(ord102.executive_id).toBe(4);
    expect(ord102.executive_name).toBe('Kavya Nair');
    expect(ord102.line_items[0]?.description).toBe('DevOps Pipeline Implementation');

    const editInput = {
      po_date: '2026-04-18',
      due_date: '2026-05-30',
      remarks: 'Revised project kickoff milestones confirmed',
      executive_id: '3',
      item_description: 'Custom Cloud Architecture & DevOps Implementation',
    };

    const review = reviewOrder('order-edit', '102', editInput, 'finance', invoices, refs, 'FY 2026-27');
    expect(review.supported).toBe(true);
    expect(review.changes).toHaveLength(5);

    const changeMap = new Map<string, FieldChange>(review.changes.map(c => [c.field, c]));

    // PO date
    expect(changeMap.has('po_date')).toBe(true);
    const poDateChg = changeMap.get('po_date')!;
    expect(poDateChg.label).toBe('PO date');
    expect(poDateChg.previous).toBe('14 Apr 2026');
    expect(poDateChg.current).toBe('18 Apr 2026');

    // Due date
    expect(changeMap.has('due_date')).toBe(true);
    const dueDateChg = changeMap.get('due_date')!;
    expect(dueDateChg.label).toBe('Due date');
    expect(dueDateChg.previous).toBe('—');
    expect(dueDateChg.current).toBe('30 May 2026');

    // Remarks
    expect(changeMap.has('remarks')).toBe(true);
    const remarksChg = changeMap.get('remarks')!;
    expect(remarksChg.label).toBe('Remarks');
    expect(remarksChg.previous).toBe('Pending project kickoff');
    expect(remarksChg.current).toBe('Revised project kickoff milestones confirmed');

    // Account executive
    expect(changeMap.has('executive_id')).toBe(true);
    const execChg = changeMap.get('executive_id')!;
    expect(execChg.label).toBe('Account executive');
    expect(execChg.previous).toBe('Kavya Nair');
    expect(execChg.current).toBe('Neha Rao');

    // Line-item description
    expect(changeMap.has('item_description')).toBe(true);
    const descChg = changeMap.get('item_description')!;
    expect(descChg.label).toBe('Line-item description');
    expect(descChg.previous).toBe('DevOps Pipeline Implementation');
    expect(descChg.current).toBe('Custom Cloud Architecture & DevOps Implementation');

    // Confirmation step applies all reviewed changes without dropping any modified field
    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(review, 'finance', invoices, refs, 'FY 2026-27');
    const updated102 = updated.find(i => i.id === 102)!;

    expect(updated102.po_date).toBe('2026-04-18');
    expect(updated102.due_date).toBe('2026-05-30');
    expect(updated102.remarks).toBe('Revised project kickoff milestones confirmed');
    expect(updated102.executive_id).toBe(3);
    expect(updated102.executive_name).toBe('Neha Rao');
    expect(updated102.line_items[0]?.description).toBe('Custom Cloud Architecture & DevOps Implementation');

    // Unmodified financial amounts and customer identifiers remain untouched
    expect(updated102.po_number).toBe(ord102.po_number);
    expect(updated102.customer_id).toBe(ord102.customer_id);
    expect(updated102.total_amount).toBe(ord102.total_amount);
    expect(updated102.tax_amount).toBe(ord102.tax_amount);
  });

  it('computes changes for PO number when modified on unbilled order and updates on confirmation', async () => {
    const review = reviewOrder(
      'order-edit',
      '102',
      { po_number: 'PO-NEXUS-REVISED-999' },
      'finance',
      invoices,
      refs,
      'FY 2026-27'
    );
    expect(review.supported).toBe(true);
    const poChg = review.changes.find(c => c.field === 'po_number');
    expect(poChg).toBeDefined();
    expect(poChg?.label).toBe('PO number');
    expect(poChg?.previous).toBe('PO-NEXUS-881');
    expect(poChg?.current).toBe('PO-NEXUS-REVISED-999');

    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(review, 'finance', invoices, refs, 'FY 2026-27');
    expect(updated.find(i => i.id === 102)!.po_number).toBe('PO-NEXUS-REVISED-999');
  });

  it('resolves executive by name as well as ID', async () => {
    const review = reviewOrder(
      'order-edit',
      '102',
      { executive_name: 'Arjun Mehta' },
      'finance',
      invoices,
      refs,
      'FY 2026-27'
    );
    expect(review.supported).toBe(true);
    const execChg = review.changes.find(c => c.field === 'executive_id');
    expect(execChg).toBeDefined();
    expect(execChg?.label).toBe('Account executive');
    expect(execChg?.previous).toBe('Kavya Nair');
    expect(execChg?.current).toBe('Arjun Mehta');

    const adapter = createOrderAdapter();
    const updated = await adapter.confirm(review, 'finance', invoices, refs, 'FY 2026-27');
    const updated102 = updated.find(i => i.id === 102)!;
    expect(updated102.executive_id).toBe(5);
    expect(updated102.executive_name).toBe('Arjun Mehta');
  });

  it('returns empty changes when submitted values match existing record', () => {
    const ord102 = invoices.find(i => i.id === 102)!;
    const review = reviewOrder(
      'order-edit',
      '102',
      {
        po_number: ord102.po_number,
        po_date: ord102.po_date,
        executive_id: String(ord102.executive_id),
        due_date: '',
        remarks: ord102.remarks,
        item_description: ord102.line_items[0]?.description,
      },
      'finance',
      invoices,
      refs,
      'FY 2026-27'
    );
    expect(review.changes).toHaveLength(0);
  });

  it('strictly preserves issued invoice immutability constraints', () => {
    const inv101 = invoices.find(i => i.id === 101)!;
    expect(inv101.invoice_number).toBeTruthy();

    // PO number change on issued invoice is rejected
    expect(() =>
      reviewOrder('order-edit', '101', { po_number: 'PO-ALTERED' }, 'finance', invoices, refs, 'FY 2026-27')
    ).toThrow(/Issued invoices are legally immutable/);

    // PO date change on issued invoice is rejected
    expect(() =>
      reviewOrder('order-edit', '101', { po_date: '2026-04-20' }, 'finance', invoices, refs, 'FY 2026-27')
    ).toThrow(/Issued invoices are legally immutable/);

    // Customer change on issued invoice is rejected
    expect(() =>
      reviewOrder('order-edit', '101', { customer_id: '2' }, 'finance', invoices, refs, 'FY 2026-27')
    ).toThrow(/Issued invoices are legally immutable/);

    // Permitted metadata (due_date and remarks) succeeds without altering immutable fields
    const review = reviewOrder(
      'order-edit',
      '101',
      { due_date: '2026-05-25', remarks: 'Updated invoice follow-up memo' },
      'finance',
      invoices,
      refs,
      'FY 2026-27'
    );
    expect(review.supported).toBe(true);
    expect(review.changes.some(c => c.field === 'due_date')).toBe(true);
    expect(review.changes.some(c => c.field === 'remarks')).toBe(true);
    expect(review.changes.some(c => c.field === 'po_number')).toBe(false);
    expect(review.changes.some(c => c.field === 'po_date')).toBe(false);
  });
});
