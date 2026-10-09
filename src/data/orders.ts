import { z } from 'zod';
import { exactMoney, money, type Invoice } from './collectflow';
import { permits } from './demo-policy';
import { type Role, canPay, dateLabel } from './records';
import { type References } from './references';

export type LineItem = Invoice['line_items'][number];

export type OrderAction = 'order-create' | 'order-edit' | 'order-convert' | 'order-delete';
export type OrderInput = Record<string, string>;

export type OrderImpact = {
  invoicedDelta: number;
  outstandingDelta: number;
  unbilledDelta: number;
};

export type FieldChange = {
  field: string;
  label: string;
  previous: string;
  current: string;
};

export type OrderReview = {
  action: OrderAction;
  target: string;
  input: OrderInput;
  context: string;
  supported: boolean;
  message: string;
  before: Invoice[];
  after: Invoice[] | null;
  impact: OrderImpact;
  changes: FieldChange[];
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed');

const required = (max: number) => text(max).refine(value => value.length > 0, 'This field is required');

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

const optionalDate = text(10).refine(value => {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}, 'Use YYYY-MM-DD');

const positiveNumberStr = required(20).refine(
  v => !isNaN(Number(v)) && Number(v) > 0,
  'Must be a valid positive number'
);

const nonNegativeNumberStr = required(20).refine(
  v => !isNaN(Number(v)) && Number(v) >= 0,
  'Must be a valid number >= 0'
);

export const orderCreateSchema = z
  .object({
    customer_id: required(20),
    order_type: z.enum(['PO', 'RECURRING']),
    po_number: text(100),
    po_date: date,
    fy_code: required(40),
    executive_id: text(20),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED']),
    exchange_rate: positiveNumberStr,
    line_item_description: required(255),
    quantity: positiveNumberStr,
    unit_price: nonNegativeNumberStr,
    tax_rate: z.enum(['0', '0.05', '0.12', '0.18', '0.28']),
    remarks: text(500),
  })
  .strict();

export const orderConvertSchema = z
  .object({
    invoice_number: required(100),
    invoice_date: date,
    due_date: optionalDate,
  })
  .strict();

export const orderEditSchema = z
  .object({
    po_number: text(100).optional(),
    po_date: optionalDate.optional(),
    customer_id: z.union([text(20), z.number().transform(v => String(v))]).optional(),
    executive_id: z.union([text(20), z.number().transform(v => String(v))]).optional(),
    executive_name: text(100).optional(),
    executive: text(100).optional(),
    due_date: optionalDate.optional(),
    remarks: text(500).optional(),
    item_description: text(255).optional(),
    line_item_description: text(255).optional(),
  })
  .strict();

const emptySchema = z.object({}).strict();

export function orderSchema(action: OrderAction) {
  switch (action) {
    case 'order-create':
      return orderCreateSchema;
    case 'order-convert':
      return orderConvertSchema;
    case 'order-edit':
      return orderEditSchema;
    case 'order-delete':
      return emptySchema;
  }
}

export const orderCreateExample: OrderInput = {
  customer_id: '1',
  order_type: 'PO',
  po_number: 'PO-2026-DEMO-001',
  po_date: '2026-04-15',
  fy_code: 'FY 2026-27',
  executive_id: '3',
  currency: 'INR',
  exchange_rate: '1',
  line_item_description: 'Cloud Security Audit & Review',
  quantity: '1',
  unit_price: '100000',
  tax_rate: '0.18',
  remarks: 'Enterprise security milestone',
};

export const orderRecurringExample: OrderInput = {
  customer_id: '2',
  order_type: 'RECURRING',
  po_number: 'Recurring / Direct Invoice',
  po_date: '2026-04-16',
  fy_code: 'FY 2026-27',
  executive_id: '4',
  currency: 'INR',
  exchange_rate: '1',
  line_item_description: 'Monthly Managed Services retainer',
  quantity: '1',
  unit_price: '50000',
  tax_rate: '0.18',
  remarks: 'Monthly recurring retainer',
};

export const orderConvertExample: OrderInput = {
  invoice_number: 'INV-2026-045',
  invoice_date: '2026-04-20',
  due_date: '2026-05-20',
};

export function orderEditExample(order: Invoice): OrderInput {
  if (order.invoice_number) {
    return {
      po_number: order.po_number,
      po_date: order.po_date || '',
      customer_id: String(order.customer_id),
      executive_id: String(order.executive_id || ''),
      due_date: '2026-05-15',
      remarks: 'Cloud migration phase 1 milestone — demo review',
      item_description: order.line_items[0]?.description || '',
    };
  }
  return {
    po_number: 'PO-NEXUS-881',
    po_date: '2026-04-16',
    customer_id: String(order.customer_id),
    executive_id: String(order.executive_id || '4'),
    due_date: '2026-05-30',
    remarks: 'Pending project kickoff — revised milestones confirmed',
    item_description: 'DevOps Pipeline & CI/CD Implementation',
  };
}

export function orderForm(order?: Invoice, action: OrderAction = 'order-create', defaultFy = 'FY 2026-27'): OrderInput {
  if (action === 'order-create') {
    return {
      customer_id: '1',
      order_type: 'PO',
      po_number: '',
      po_date: '2026-04-15',
      fy_code: defaultFy,
      executive_id: '3',
      currency: 'INR',
      exchange_rate: '1',
      line_item_description: '',
      quantity: '1',
      unit_price: '0',
      tax_rate: '0.18',
      remarks: '',
    };
  }
  if (action === 'order-convert') {
    return {
      invoice_number: '',
      invoice_date: order?.po_date || '2026-04-20',
      due_date: '',
    };
  }
  if (action === 'order-edit' && order) {
    return {
      po_number: order.po_number || '',
      po_date: order.po_date || '',
      customer_id: String(order.customer_id || ''),
      executive_id: String(order.executive_id || ''),
      due_date: order.due_date || '',
      remarks: order.remarks || '',
      item_description: order.line_items[0]?.description || '',
    };
  }
  return {};
}

export function orderPermitted(role: Role, action: OrderAction): boolean {
  if (action === 'order-create') return permits(role, 'createOrder');
  if (action === 'order-convert') return permits(role, 'convert');
  if (action === 'order-edit') return permits(role, 'editDocument');
  return canPay(role); // order-delete requires finance or admin
}

export function isDateInFiscalYear(dateStr: string, startDate?: string | null, endDate?: string | null): boolean {
  if (!startDate || !endDate) return true;
  return dateStr >= startDate && dateStr <= endDate;
}

export function calculateNet30DueDate(invoiceDateStr: string): string {
  try {
    const d = new Date(`${invoiceDateStr.trim()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  } catch {
    return invoiceDateStr;
  }
}

const same = (a: OrderInput, b: OrderInput | null) =>
  b !== null &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every(key => a[key] === b[key]);

export function reviewOrder(
  action: OrderAction,
  target: string,
  raw: unknown,
  role: Role,
  invoices: Invoice[],
  references: References,
  _currentFy: string
): OrderReview {
  if (!orderPermitted(role, action)) {
    throw new Error('This role cannot perform this action.');
  }

  const parsedRaw = orderSchema(action).parse(raw);
  const input = parsedRaw as OrderInput;
  const before = structuredClone(invoices);
  const after = structuredClone(invoices);
  let supported = false;
  let message = 'Review only: custom inputs have no verified scenario outcome. Use the verified example to rehearse saving.';
  const impact: OrderImpact = { invoicedDelta: 0, outstandingDelta: 0, unbilledDelta: 0 };
  const changes: FieldChange[] = [];

  switch (action) {
    case 'order-create': {
      const custId = Number(input['customer_id'] ?? '0');
      const cust = references.customers.find(c => c.id === custId);
      if (!cust) throw new Error('Specified customer does not exist');

      const fyCode = input['fy_code'] ?? '';
      const fy = references.years.find(y => y.code === fyCode);
      if (!fy) throw new Error(`Financial year '${fyCode}' does not exist in master records`);

      const poDate = input['po_date'] ?? '';
      if (!isDateInFiscalYear(poDate, fy.start_date, fy.end_date)) {
        throw new Error(
          `Date '${poDate}' falls outside financial year '${fyCode}' (${fy.start_date ?? ''} to ${fy.end_date ?? ''})`
        );
      }

      let poNo = (input['po_number'] ?? '').trim();
      const orderType = input['order_type'] ?? 'PO';
      if (!poNo) {
        poNo = orderType === 'RECURRING' ? 'Recurring / Direct Invoice' : 'No PO';
      }

      const normPo = poNo.toLowerCase();
      if (normPo !== 'no po' && normPo !== 'recurring / direct invoice') {
        const dup = invoices.find(inv => inv.po_number.trim().toLowerCase() === normPo);
        if (dup) {
          throw new Error(`Purchase Order number '${poNo}' is already registered to order #${dup.id}`);
        }
      }

      const isMatchStandard = same(input, orderCreateExample);
      const isMatchRecurring = same(input, orderRecurringExample);
      supported = isMatchStandard || isMatchRecurring;

      if (supported) {
        const newId = Math.max(...invoices.map(i => i.id), 100) + 1;
        const qty = Number(input['quantity'] ?? '1');
        const price = Number(input['unit_price'] ?? '0');
        const rate = Number(input['tax_rate'] ?? '0.18');
        const excl = Math.round(qty * price * 100) / 100;
        const tax = Math.round(excl * rate * 100) / 100;
        const tot = Math.round((excl + tax) * 100) / 100;

        const execIdStr = input['executive_id'] ?? '';
        const execName =
          execIdStr === '3'
            ? 'Neha Rao'
            : execIdStr === '4'
            ? 'Kavya Nair'
            : execIdStr === '5'
            ? 'Arjun Mehta'
            : 'Unassigned';

        const lineItem: LineItem = {
          id: newId + 100,
          invoice_id: newId,
          description: input['line_item_description'] ?? 'Services',
          quantity: qty,
          unit_price: price,
          tax_rate: rate,
          tax_amount: tax,
          total_amount: tot,
        };

        const newOrder: Invoice = {
          id: newId,
          fy_code: fyCode,
          order_type: orderType,
          po_number: poNo,
          po_date: poDate,
          customer_id: cust.id,
          executive_id: Number(execIdStr || '3'),
          customer_name: cust.billing_name,
          customer_gstin: cust.gst_number || '',
          customer_address: cust.billing_address || '',
          customer_state: cust.state || '',
          currency: input['currency'] || 'INR',
          exchange_rate: Number(input['exchange_rate'] || '1'),
          original_amount: excl,
          exclusive_amount: excl,
          tax_rate: rate,
          tax_amount: tax,
          total_amount: tot,
          invoice_number: null,
          invoice_date: null,
          due_date: null,
          remarks: input['remarks'] || '',
          payment_status: 'PENDING',
          total_cash_paid: 0,
          total_tds_deducted: 0,
          total_paid: 0,
          outstanding_balance: tot,
          computed_status: 'UNBILLED',
          executive_name: execName,
          line_items: [lineItem],
          payments: [],
        };

        after.push(newOrder);
        impact.unbilledDelta = tot;
        changes.push(
          { field: 'po_number', label: 'PO number', previous: '—', current: poNo },
          { field: 'customer', label: 'Customer', previous: '—', current: cust.billing_name },
          { field: 'order_value', label: 'Order value', previous: '—', current: exactMoney(tot) },
          { field: 'due_date', label: 'Due date', previous: '—', current: dateLabel(input['due_date'] || null) || '—' },
          { field: 'status', label: 'Billing status', previous: '—', current: 'UNBILLED' }
        );
        message = `Verified order creation rehearsal. New unbilled order created (${poNo}). Issued receivables, settlements and reporting date remain unchanged.`;
      }
      break;
    }

    case 'order-edit': {
      const order = invoices.find(inv => String(inv.id) === target);
      if (!order) throw new Error('Order/Invoice not found');

      const isIssued = Boolean(order.invoice_number && order.invoice_number.trim());
      const editPo = input['po_number'];
      const editDate = input['po_date'];
      const editCust = input['customer_id'];

      if (isIssued) {
        if (editPo && editPo.trim() !== order.po_number.trim()) {
          throw new Error('Issued invoices are legally immutable. Commercial identifiers and customer cannot be changed.');
        }
        if (editDate && editDate !== (order.po_date || '')) {
          throw new Error('Issued invoices are legally immutable. Commercial identifiers and customer cannot be changed.');
        }
        if (editCust && editCust !== String(order.customer_id)) {
          throw new Error('Issued invoices are legally immutable. Commercial identifiers and customer cannot be changed.');
        }
      } else {
        if (editPo && editPo.trim().toLowerCase() !== order.po_number.trim().toLowerCase()) {
          const norm = editPo.trim().toLowerCase();
          if (norm !== 'no po' && norm !== 'recurring / direct invoice') {
            const dup = invoices.find(inv => String(inv.id) !== target && inv.po_number.trim().toLowerCase() === norm);
            if (dup) {
              throw new Error(`Purchase Order number '${editPo}' is already registered to order #${dup.id}`);
            }
          }
        }
      }
      if (!isIssued && editPo !== undefined && editPo.trim() !== order.po_number.trim()) {
        changes.push({
          field: 'po_number',
          label: 'PO number',
          previous: order.po_number || '—',
          current: editPo.trim() || '—',
        });
      }

      if (!isIssued && editDate !== undefined && (editDate || '') !== (order.po_date || '')) {
        changes.push({
          field: 'po_date',
          label: 'PO date',
          previous: dateLabel(order.po_date) || '—',
          current: dateLabel(editDate) || '—',
        });
      }

      const editDue = input['due_date'];
      if (editDue !== undefined && (editDue || '') !== (order.due_date || '')) {
        changes.push({
          field: 'due_date',
          label: 'Due date',
          previous: dateLabel(order.due_date) || '—',
          current: dateLabel(editDue) || '—',
        });
      }

      const editRem = input['remarks'];
      if (editRem !== undefined && (editRem || '') !== (order.remarks || '')) {
        changes.push({
          field: 'remarks',
          label: 'Remarks',
          previous: order.remarks || '—',
          current: editRem || '—',
        });
      }

      const rawExec = input['executive_id'] ?? input['executive_name'] ?? input['executive'];
      let nextExecId: number | undefined;
      let nextExecName: string | undefined;

      if (!isIssued && rawExec !== undefined && String(rawExec).trim() !== '') {
        const execStr = String(rawExec).trim();
        if (execStr === '3' || execStr === 'Neha Rao') {
          nextExecId = 3;
          nextExecName = 'Neha Rao';
        } else if (execStr === '4' || execStr === 'Kavya Nair') {
          nextExecId = 4;
          nextExecName = 'Kavya Nair';
        } else if (execStr === '5' || execStr === 'Arjun Mehta') {
          nextExecId = 5;
          nextExecName = 'Arjun Mehta';
        } else if (!isNaN(Number(execStr))) {
          nextExecId = Number(execStr);
          nextExecName = nextExecId === 3 ? 'Neha Rao' : nextExecId === 4 ? 'Kavya Nair' : nextExecId === 5 ? 'Arjun Mehta' : 'Unassigned';
        } else {
          nextExecId = 0;
          nextExecName = execStr;
        }

        const prevExecName = order.executive_name || (order.executive_id === 3 ? 'Neha Rao' : order.executive_id === 4 ? 'Kavya Nair' : order.executive_id === 5 ? 'Arjun Mehta' : 'Unassigned');
        if (nextExecName !== prevExecName || (nextExecId !== undefined && nextExecId !== order.executive_id)) {
          changes.push({
            field: 'executive_id',
            label: 'Account executive',
            previous: prevExecName,
            current: nextExecName,
          });
        }
      }

      const editDesc = input['item_description'] !== undefined ? input['item_description'] : input['line_item_description'];
      const prevDesc = order.line_items[0]?.description || '';
      if (editDesc !== undefined && editDesc !== prevDesc) {
        changes.push({
          field: 'item_description',
          label: 'Line-item description',
          previous: prevDesc || '—',
          current: editDesc || '—',
        });
      }

      supported = true;

      const orderIdx = after.findIndex(inv => String(inv.id) === target);
      const existingOrder = after[orderIdx];
      if (existingOrder) {
        const updated: Invoice = { ...existingOrder };
        if (editDue !== undefined) updated.due_date = editDue || null;
        if (editRem !== undefined) updated.remarks = editRem;

        if (!isIssued) {
          if (editPo !== undefined && editPo.trim()) updated.po_number = editPo.trim();
          if (editDate) updated.po_date = editDate;
          if (nextExecId !== undefined) updated.executive_id = nextExecId;
          if (nextExecName !== undefined) updated.executive_name = nextExecName;
        }

        if (editDesc !== undefined) {
          if (updated.line_items && updated.line_items.length > 0) {
            updated.line_items = updated.line_items.map((li, idx) =>
              idx === 0 ? { ...li, description: editDesc } : li
            );
          }
        }
        after[orderIdx] = updated;
      }

      message = isIssued
        ? 'Verified invoice metadata rehearsal. Commercial identifiers, payment history and financial amounts remain strictly unchanged.'
        : 'Verified unbilled order metadata rehearsal. Financial amounts, tax calculations and quantities remain unchanged.';
      break;
    }

    case 'order-convert': {
      const order = invoices.find(inv => String(inv.id) === target);
      if (!order) throw new Error('Order not found');

      if (order.computed_status === 'CANCELLED') {
        throw new Error('Cannot convert a cancelled order to an invoice');
      }

      if (order.invoice_number && order.invoice_number.trim()) {
        throw new Error(`Order #${order.id} has already been converted to Invoice #${order.invoice_number}`);
      }

      const invNo = (input['invoice_number'] ?? '').trim();
      if (!invNo) throw new Error('Invoice number is required');

      const normInv = invNo.toLowerCase();
      const dupInv = invoices.find(
        inv => String(inv.id) !== target && inv.invoice_number && inv.invoice_number.trim().toLowerCase() === normInv
      );
      if (dupInv) {
        throw new Error(`Invoice number '${invNo}' is already assigned to record #${dupInv.id}`);
      }

      const invDate = input['invoice_date'] ?? '';
      const fy = references.years.find(y => y.code === order.fy_code);
      if (fy && !isDateInFiscalYear(invDate, fy.start_date, fy.end_date)) {
        throw new Error(
          `Invoice date '${invDate}' does not fall within financial year '${order.fy_code}' (${fy.start_date ?? ''} to ${fy.end_date ?? ''})`
        );
      }

      supported = same(input, orderConvertExample) || (target === '102' && invNo === 'INV-2026-045');

      if (supported) {
        const orderIdx = after.findIndex(inv => String(inv.id) === target);
        const existingOrder = after[orderIdx];
        if (existingOrder) {
          const due = input['due_date'] || calculateNet30DueDate(invDate);
          const cust = references.customers.find(c => c.id === order.customer_id);

          const updated: Invoice = {
            ...existingOrder,
            invoice_number: invNo,
            invoice_date: invDate,
            due_date: due,
            computed_status: 'PENDING',
            payment_status: 'PENDING',
            outstanding_balance: order.total_amount,
            customer_name: cust?.billing_name || order.customer_name,
            customer_gstin: cust?.gst_number || order.customer_gstin,
            customer_address: cust?.billing_address || order.customer_address,
            customer_state: cust?.state || order.customer_state,
          };
          after[orderIdx] = updated;

          impact.invoicedDelta = order.total_amount;
          impact.outstandingDelta = order.total_amount;
          impact.unbilledDelta = -order.total_amount;

          changes.push(
            { field: 'invoice_number', label: 'Assigned Invoice #', previous: 'Unbilled', current: invNo },
            { field: 'invoice_date', label: 'Invoice date', previous: '—', current: dateLabel(invDate) || invDate },
            { field: 'due_date', label: 'Due date', previous: dateLabel(order.due_date) || '—', current: dateLabel(due) || due },
            { field: 'status', label: 'Billing status', previous: 'UNBILLED', current: 'ISSUED' }
          );

          message = `Verified conversion rehearsal. Order #${order.id} converted to Invoice ${invNo} with Net-30 terms. Total invoiced and receivables updated.`;
        }
      }
      break;
    }

    case 'order-delete': {
      const order = invoices.find(inv => String(inv.id) === target);
      if (!order) throw new Error('Order/Invoice not found');

      if (order.invoice_number && order.invoice_number.trim()) {
        throw new Error(
          'Issued commercial invoices cannot be permanently deleted. Use the cancellation workflow (POST /api/invoices/{id}/cancel) instead.'
        );
      }

      if (order.payments && order.payments.length > 0) {
        throw new Error(
          'Cannot delete invoice with existing payment records. Reversal/credit note required to preserve financial audit history.'
        );
      }

      supported = target === '102';

      if (supported) {
        const remaining = after.filter(inv => String(inv.id) !== target);
        after.length = 0;
        after.push(...remaining);

        impact.unbilledDelta = -order.total_amount;
        changes.push(
          { field: 'po_number', label: 'Deleted order', previous: order.po_number, current: 'DELETED' },
          { field: 'status', label: 'Record status', previous: 'UNBILLED', current: 'DELETED' }
        );
        message = `Verified order deletion rehearsal. Unbilled ${order.po_number} removed. Issued invoices, payments and receivables remain untouched.`;
      }
      break;
    }
  }

  return {
    action,
    target,
    input,
    context: JSON.stringify(invoices),
    supported,
    message,
    before,
    after: supported ? after : null,
    impact,
    changes,
  };
}

export function createOrderAdapter() {
  const consumed = new Set<string>();
  return {
    reset: () => consumed.clear(),
    async confirm(
      review: OrderReview,
      role: Role,
      invoices: Invoice[],
      references: References,
      currentFy: string
    ): Promise<Invoice[]> {
      if (!orderPermitted(role, review.action)) {
        throw new Error('Permission changed. No changes applied.');
      }
      const key = JSON.stringify([review.action, review.target, review.input, review.context]);
      if (consumed.has(key)) {
        throw new Error('This confirmation was already applied.');
      }
      if (JSON.stringify(invoices) !== review.context) {
        throw new Error('Demo context changed. Review again.');
      }
      const verified = reviewOrder(
        review.action,
        review.target,
        review.input,
        role,
        invoices,
        references,
        currentFy
      );
      if (!verified.supported || !verified.after) {
        throw new Error(verified.message);
      }
      consumed.add(key);
      return structuredClone(verified.after);
    },
  };
}
