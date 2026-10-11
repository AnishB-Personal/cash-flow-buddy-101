import { data, asOfDate, type Invoice } from "./collectflow";
import {
  classifyAging,
  issuedRecord,
  receivableRecord,
  summarizeAging,
  agingDateLabel,
} from "./reporting";
export type Role = "admin" | "finance" | "sales" | "viewer";
export type Screen =
  | "Dashboard"
  | "Orders"
  | "Invoices"
  | "Payments"
  | "AR Aging"
  | "Customers"
  | "Settings"
  | "Sales Targets"
  | "Performance Analytics"
  | "Users & Roles"
  | "Reports";
export const issued = issuedRecord;
export const isReceivable = receivableRecord;
export const invoiceAging = (row: Invoice, referenceDate = asOfDate) =>
  classifyAging(row, referenceDate).bucket;
export const overdue = (row: Invoice, referenceDate = asOfDate) =>
  classifyAging(row, referenceDate).overdue;
export const agingAsOf = (referenceDate = asOfDate) => agingDateLabel(referenceDate);
export const overdueLabel = (row: Invoice, referenceDate = asOfDate) => {
  const aging = classifyAging(row, referenceDate);
  if (!issued(row) || row.computed_status === "CANCELLED") return "Not applicable";
  if (!row.due_date && isReceivable(row)) return "Due date unavailable · 0 days overdue";
  return `${aging.overdue ? "Overdue" : "Not overdue"} · ${aging.daysOverdue} ${aging.daysOverdue === 1 ? "day" : "days"} overdue`;
};
export const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "—";
export const labelStatus = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
export function selectRecords(
  screen: Screen,
  fy: string,
  _role: Role,
  query = "",
  status = "All statuses",
  executive = "All executives",
  bucket: string | null = null,
  referenceDate = asOfDate,
  records: Invoice[] = data.invoices,
) {
  return records.filter(
    (row) =>
      row.fy_code === fy &&
      ((screen !== "Invoices" && screen !== "AR Aging") || issued(row)) &&
      (screen !== "AR Aging" || isReceivable(row)) &&
      (!bucket || invoiceAging(row, referenceDate) === bucket) &&
      (status === "All statuses" || row.computed_status === status) &&
      (executive === "All executives" || row.executive_name === executive) &&
      `${row.customer_name} ${row.po_number} ${row.invoice_number ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
}
export function snapshot(
  fy: string,
  role: Role,
  referenceDate = asOfDate,
  records: Invoice[] = data.invoices,
) {
  const rows = selectRecords(
    "Orders",
    fy,
    role,
    "",
    "All statuses",
    "All executives",
    null,
    referenceDate,
    records,
  );
  // Aggregate supplied amounts only. Cash+TDS/outstanding originate in the supplied snapshot.
  const invoices = rows.filter((row) => issued(row) && row.computed_status !== "CANCELLED");
  const sum = (
    field:
      | "total_amount"
      | "outstanding_balance"
      | "total_cash_paid"
      | "total_tds_deducted"
      | "total_paid",
    list = invoices,
  ) => list.reduce((total, row) => total + row[field], 0);
  const invoiced = sum("total_amount");
  const cash = sum("total_cash_paid");
  const tds = sum("total_tds_deducted");
  return {
    invoiced,
    cash,
    tds,
    settled: sum("total_paid"),
    outstanding: sum("outstanding_balance"),
    rate: invoiced ? Math.round(((cash + tds) / invoiced) * 1000) / 10 : 0,
    overdue: sum(
      "outstanding_balance",
      invoices.filter((row) => overdue(row, referenceDate)),
    ),
    unbilled: sum(
      "total_amount",
      rows.filter((row) => !issued(row)),
    ),
    unbilledCount: rows.filter((row) => !issued(row)).length,
    count: invoices.length,
    aging: summarizeAging(invoices, referenceDate),
  };
}
export const canWrite = (role: Role) => role === "admin" || role === "finance" || role === "sales";
export const canPay = (role: Role) => role === "admin" || role === "finance";
