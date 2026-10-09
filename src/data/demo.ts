import { z } from 'zod';
import fixtures from './collectflow.json';
import { permits, type DemoAction } from './demo-policy';
import type { Role } from './records';
import type { MetadataUpdatePayload } from './api-contracts';

export type DemoSnapshot = typeof fixtures;
export type ScenarioId = 'baseline' | 'order-note' | 'invoice-note' | 'blocked-cancel' | 'review-only';
export type Scenario = { id: ScenarioId; label: string; action: DemoAction; documentId: number; remarks: string; result: 'verified' | 'blocked' | 'unsupported' };
export const scenarios: Scenario[] = [
 { id: 'baseline', label: 'Approved baseline', action: 'read', documentId: 101, remarks: 'Cloud migration phase 1 milestone', result: 'unsupported' },
 { id: 'order-note', label: 'Order metadata rehearsal', action: 'editDocument', documentId: 102, remarks: 'Pending project kickoff — demo review', result: 'verified' },
 { id: 'invoice-note', label: 'Invoice metadata rehearsal', action: 'editDocument', documentId: 101, remarks: 'Cloud migration phase 1 milestone — demo review', result: 'verified' },
 { id: 'blocked-cancel', label: 'Cancellation guard rehearsal', action: 'cancel', documentId: 101, remarks: 'Cancellation requested for demo review', result: 'blocked' },
 { id: 'review-only', label: 'Unsupported input review', action: 'editDocument', documentId: 102, remarks: 'Custom review-only note', result: 'unsupported' },
];
function freeze<T>(value: T): T {
 if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
 return value;
}
export const baselineSnapshot = freeze(structuredClone(fixtures));
// Whole snapshots contain unchanged literal financial fields, not recomputed outcomes.
// Metadata-only rehearsals are the verified nonfinancial update contract; later stages supply financial snapshots.
const orderSnapshot = structuredClone(fixtures);
const order = orderSnapshot.invoices.find(row => row.id === 102);
if (order) order.remarks = 'Pending project kickoff — demo review';
const invoiceSnapshot = structuredClone(fixtures);
const invoice = invoiceSnapshot.invoices.find(row => row.id === 101);
if (invoice) invoice.remarks = 'Cloud migration phase 1 milestone — demo review';
const verifiedSnapshots = freeze({ 'order-note': orderSnapshot, 'invoice-note': invoiceSnapshot });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date').refine(value => { const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, 'Invalid calendar date');
export const moneyInputSchema = z.number().finite().nonnegative().refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places');
const paymentSnapshotSchema = z.object({id:z.number().int().positive(),invoice_id:z.number().int().positive(),payment_amount:moneyInputSchema,tds_amount:moneyInputSchema,payment_date:calendarDate}).passthrough();
const invoiceSnapshotSchema = z.object({id:z.number().int().positive(),fy_code:z.string().min(1),customer_id:z.number().int().positive(),invoice_number:z.string().nullable(),due_date:calendarDate.nullable(),total_amount:moneyInputSchema,total_cash_paid:moneyInputSchema,total_tds_deducted:moneyInputSchema,total_paid:moneyInputSchema,outstanding_balance:moneyInputSchema,payments:z.array(paymentSnapshotSchema)}).passthrough();
export const demoSnapshotSchema = z.object({reporting:z.object({asOfDate:calendarDate}),invoices:z.array(invoiceSnapshotSchema),customers:z.array(z.object({id:z.number().int().positive(),billing_name:z.string().min(1)}).passthrough()),financial_years:z.array(z.object({code:z.string(),start_date:calendarDate,end_date:calendarDate}).passthrough()),sales_targets:z.array(z.object({user_id:z.number().int().positive(),fy_code:z.string(),target_amount:moneyInputSchema}).passthrough()),dashboard_summary:z.object({kpis:z.object({total_invoiced:moneyInputSchema,total_cash_collected:moneyInputSchema,total_tds_recognized:moneyInputSchema,total_settled:moneyInputSchema,total_outstanding:moneyInputSchema}).passthrough()}).passthrough()}).passthrough();
export const demoInputSchema = z.object({ documentId: z.number().int().positive(), remarks: z.string().trim().min(1, 'Enter remarks').max(500, 'Use at most 500 characters'), asOfDate: calendarDate.refine(value => value === '2026-04-30', 'Reporting date is fixed at 30 April 2026') }).strict();
export type DemoFormInput = z.input<typeof demoInputSchema>;
export type DemoInput = z.output<typeof demoInputSchema>;
export type DemoReview = { scenario: Scenario; input: DemoInput; fingerprint: string; supported: boolean; before: DemoSnapshot; after: DemoSnapshot | null; message: string };
export type DemoResult = { status: 'success' | 'blocked' | 'unsupported' | 'denied' | 'duplicate' | 'stale'; message: string; snapshot: DemoSnapshot };
export function scenarioById(id: ScenarioId): Scenario { const scenario = scenarios.find(item => item.id === id); if (!scenario) throw new Error('Unknown demo scenario'); return scenario; }
export function readDemoSnapshot(): DemoSnapshot { demoSnapshotSchema.parse(baselineSnapshot); return structuredClone(baselineSnapshot); }
export function metadataPayload(input: DemoInput): MetadataUpdatePayload { return {remarks:demoInputSchema.parse(input).remarks}; }
export const demoQueryKey = (fy: string, scenario: ScenarioId) => ['collectflow', 'demo', fy, scenario] as const;
export function reviewDemo(id: ScenarioId, raw: unknown, role: Role, fy: string): DemoReview {
 const input = demoInputSchema.parse(raw);
 const scenario = scenarioById(id);
 if (!permits(role, scenario.action)) throw new Error('This role cannot perform this action.');
 const row = baselineSnapshot.invoices.find(record => record.id === input.documentId);
 if (!row || row.fy_code !== fy) throw new Error('Select a document in the current financial year.');
 const supported = scenario.result === 'verified' && input.documentId === scenario.documentId && input.remarks === scenario.remarks;
 const after = supported && (id === 'order-note' || id === 'invoice-note') ? verifiedSnapshots[id] : null;
 const message = scenario.result === 'blocked' ? 'Cancellation is blocked: this invoice has an active payment. No reversal or cancellation occurs.' : supported ? 'Verified metadata-only snapshot. All amounts, payments, targets and aging remain unchanged.' : 'Review only: these inputs have no verified result. No changes can be applied.';
 return { scenario, input, fingerprint: JSON.stringify([id, fy, input.documentId, input.remarks, input.asOfDate]), supported, before: baselineSnapshot, after, message };
}
export function createDemoAdapter() {
 const consumed = new Set<string>();
 return {
  read: readDemoSnapshot,
  review: reviewDemo,
  reset: () => consumed.clear(),
  async confirm(review: DemoReview, role: Role, fy: string, selected: ScenarioId): Promise<DemoResult> {
   const unchanged = readDemoSnapshot();
   if (!permits(role, scenarioById(selected).action)) return { status: 'denied', message: 'Permission changed. No changes applied.', snapshot: unchanged };
   if (selected !== review.scenario.id || !unchanged.invoices.some(row => row.id === review.input.documentId && row.fy_code === fy)) return { status: 'stale', message: 'Scenario or financial year changed. Review again.', snapshot: unchanged };
   // Validate again at the adapter boundary; never trust a UI-supplied result snapshot.
   const verified = reviewDemo(selected, review.input, role, fy);
   if (!verified.supported || !verified.after) return { status: verified.scenario.result === 'blocked' ? 'blocked' : 'unsupported', message: verified.message, snapshot: unchanged };
   if (consumed.has(verified.fingerprint)) return { status: 'duplicate', message: 'This confirmation was already applied. No duplicate change occurred.', snapshot: structuredClone(verified.after) };
   consumed.add(verified.fingerprint);
   demoSnapshotSchema.parse(verified.after);
   return { status: 'success', message: 'Verified demo snapshot applied. No actual financial records are modified.', snapshot: structuredClone(verified.after) };
  },
 };
}