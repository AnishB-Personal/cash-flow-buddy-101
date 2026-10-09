// Date classification only: financial amounts and payment statuses remain authoritative inputs.
export const agingBuckets = ['Current / Not Due', '1–30 days', '31–60 days', '61–90 days', '91–180 days', '180+ days'] as const;
export type AgingBucket = typeof agingBuckets[number];
export type AgingRecord = { invoice_number: string | null; due_date: string | null; computed_status: string; outstanding_balance: number };
export const issuedRecord = (row: AgingRecord) => Boolean(row.invoice_number?.trim());
export const receivableRecord = (row: AgingRecord) => issuedRecord(row) && row.computed_status !== 'CANCELLED' && row.outstanding_balance > 0;

function calendarDay(value: string) {
 const timestamp = Date.parse(`${value}T00:00:00Z`);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error(`Invalid reporting calendar date: ${value}`);
 return timestamp / 86400000;
}
export function classifyAging(row: AgingRecord, asOfDate: string): { daysOverdue: number; overdue: boolean; bucket: AgingBucket | undefined } {
 const reportingDay = calendarDay(asOfDate);
 if (!receivableRecord(row)) return { daysOverdue: 0, overdue: false, bucket: undefined };
 // Mirrors FastAPI's null-due-date and calendar-day treatment; never invent a due date.
 const daysOverdue = row.due_date ? Math.max(0, reportingDay - calendarDay(row.due_date)) : 0;
 const bucket = daysOverdue === 0 ? agingBuckets[0] : daysOverdue <= 30 ? agingBuckets[1] : daysOverdue <= 60 ? agingBuckets[2] : daysOverdue <= 90 ? agingBuckets[3] : daysOverdue <= 180 ? agingBuckets[4] : agingBuckets[5];
 return { daysOverdue, overdue: daysOverdue > 0, bucket };
}
export function summarizeAging(rows: readonly AgingRecord[], asOfDate: string) {
 const classified = rows.map(row => ({ row, bucket: classifyAging(row, asOfDate).bucket }));
 return agingBuckets.map(bucket => {
  const members = classified.filter(item => item.bucket === bucket);
  return { bucket, amount: members.reduce((sum, item) => sum + item.row.outstanding_balance, 0), count: members.length };
 });
}
export const reportingDateLabel = (date: string) => {
 calendarDay(date);
 return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
};
export const agingDateLabel = (asOfDate: string) => `Aging as of ${reportingDateLabel(asOfDate)}`;