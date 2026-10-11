/**
 * CollectFlow Export Engine
 * Authoritative implementation matching backend `/api/export/excel` & `/api/export/token`
 * Reference backend: collectflow app/routers/export.py & app/utils/financial.py
 */

import { type Invoice, asOfDate } from "@/data/collectflow";
import { classifyAging } from "@/data/reporting";

/**
 * 17 Authoritative Backend Export Columns
 * Strictly ordered matching `v_invoice_summary` / `app/routers/export.py:98-116`
 */
export const AUTHORITATIVE_COLUMNS = [
  "FY",
  "PO Date",
  "PO Number",
  "Customer Name",
  "Executive",
  "Exclusive Amount (₹)",
  "Tax Amount (₹)",
  "Total Invoiced (₹)",
  "Invoice Number",
  "Invoice Date",
  "Due Date",
  "Cash Received (₹)",
  "TDS Deducted (₹)",
  "Total Settled (₹)",
  "Balance Outstanding (₹)",
  "Status",
  "Days Overdue",
] as const;

export type AuthoritativeColumn = (typeof AUTHORITATIVE_COLUMNS)[number];

/**
 * Currency Columns with ₹#,##0.00 formatting (1-indexed: 6, 7, 8, 12, 13, 14, 15)
 * 0-indexed column positions: [5, 6, 7, 11, 12, 13, 14]
 */
export const CURRENCY_COLUMN_INDICES = [5, 6, 7, 11, 12, 13, 14] as const;

export const CURRENCY_COLUMNS: readonly AuthoritativeColumn[] = [
  "Exclusive Amount (₹)",
  "Tax Amount (₹)",
  "Total Invoiced (₹)",
  "Cash Received (₹)",
  "TDS Deducted (₹)",
  "Total Settled (₹)",
  "Balance Outstanding (₹)",
];

export const EXCEL_CURRENCY_FORMAT = "₹#,##0.00";

export const EXCEL_HEADER_STYLE = {
  fontName: "Calibri",
  fontSize: 11,
  bold: true,
  color: "#FFFFFF",
  fillColor: "#1F4E79",
  fillPattern: "Solid",
  alignment: "center",
} as const;

export const DEMO_CSV_LABEL = "Demo CSV Export";

export interface ExportRow {
  FY: string;
  "PO Date": string;
  "PO Number": string;
  "Customer Name": string;
  Executive: string;
  "Exclusive Amount (₹)": number;
  "Tax Amount (₹)": number;
  "Total Invoiced (₹)": number;
  "Invoice Number": string;
  "Invoice Date": string;
  "Due Date": string;
  "Cash Received (₹)": number;
  "TDS Deducted (₹)": number;
  "Total Settled (₹)": number;
  "Balance Outstanding (₹)": number;
  Status: string;
  "Days Overdue": number;
}

export interface ExportTotals {
  totalInvoiced: number;
  totalExclusive: number;
  totalTax: number;
  totalCash: number;
  totalTds: number;
  totalSettled: number;
  totalOutstanding: number;
  recordCount: number;
}

/**
 * Formula Injection Sanitization (CWE-1236)
 * Strictly matches backend `app/utils/financial.py:130-138`:
 * If a text value starts with =, +, -, @, \t, or \r, prepend a single quote (')
 * so spreadsheet software renders it strictly as literal text.
 */
export function sanitizeFormulaInjection<T>(val: T): T | string {
  if (typeof val === "string") {
    if (
      val.startsWith("=") ||
      val.startsWith("+") ||
      val.startsWith("-") ||
      val.startsWith("@") ||
      val.startsWith("\t") ||
      val.startsWith("\r")
    ) {
      return `'${val}`;
    }
  }
  return val;
}

/**
 * Sensitive Data Stripping
 * Strictly omit any passwords, password hashes, secrets, salts, tokens, private keys.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /pass_hash/i,
  /password_hash/i,
  /hashed_password/i,
  /secret/i,
  /salt/i,
  /token/i,
  /auth_token/i,
  /access_token/i,
  /refresh_token/i,
  /session_token/i,
  /api_key/i,
  /private_key/i,
  /credential/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function stripSensitiveFields<T extends Record<string, unknown>>(record: T): Partial<T> {
  if (!record || typeof record !== "object") return record;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as Partial<T>;
}

/**
 * Currency Formatter: Indian Rupee standard format `₹#,##0.00`
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Column Auto-Width Formula: max(max_len + 3, 12)
 * Strictly matches backend `app/routers/export.py:153-156`
 */
export function calculateColumnAutoWidth(values: (string | number | null | undefined)[]): number {
  let maxLen = 0;
  for (const v of values) {
    const len = String(v ?? "").length;
    if (len > maxLen) maxLen = len;
  }
  return Math.max(maxLen + 3, 12);
}

/**
 * Role-Based Access Control for Exports
 * Admin & Finance: Full export access
 * Sales & Viewer: View-only preview / restricted
 */
export function canExport(role: string): boolean {
  return role === "admin" || role === "finance";
}

export function getExportPermissions(role: string): {
  allowed: boolean;
  canDownload: boolean;
  canPreview: boolean;
  role: string;
  reason?: string | undefined;
} {
  const allowed = canExport(role);
  return {
    allowed,
    canDownload: allowed,
    canPreview: true, // all authenticated roles may inspect preview
    role,
    reason: allowed
      ? undefined
      : `Export generation is restricted to Admin and Finance roles. Role '${role}' has view-only preview access.`,
  };
}

/**
 * Lightweight synchronous SHA-256 implementation
 * for deterministic ticket hashing simulation across browser & test runners.
 */
function sha256Sync(str: string): string {
  const K: readonly number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const msg = new TextEncoder().encode(str);
  const l = msg.length;
  const bitLen = l * 8;
  const newLen = ((l + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(newLen);
  padded.set(msg);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(newLen - 8, BigInt(bitLen), false);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < newLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const wT15 = W[t - 15] ?? 0;
      const wT2 = W[t - 2] ?? 0;
      const wT16 = W[t - 16] ?? 0;
      const wT7 = W[t - 7] ?? 0;
      const s0 = rotr(wT15, 7) ^ rotr(wT15, 18) ^ (wT15 >>> 3);
      const s1 = rotr(wT2, 17) ^ rotr(wT2, 19) ^ (wT2 >>> 10);
      W[t] = (wT16 + s0 + wT7 + s1) | 0;
    }
    let a = H[0] ?? 0;
    let b = H[1] ?? 0;
    let c = H[2] ?? 0;
    let d = H[3] ?? 0;
    let e = H[4] ?? 0;
    let f = H[5] ?? 0;
    let g = H[6] ?? 0;
    let h = H[7] ?? 0;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const kT = K[t] ?? 0;
      const wT = W[t] ?? 0;
      const temp1 = (h + S1 + ch + kT + wT) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = ((H[0] ?? 0) + a) | 0;
    H[1] = ((H[1] ?? 0) + b) | 0;
    H[2] = ((H[2] ?? 0) + c) | 0;
    H[3] = ((H[3] ?? 0) + d) | 0;
    H[4] = ((H[4] ?? 0) + e) | 0;
    H[5] = ((H[5] ?? 0) + f) | 0;
    H[6] = ((H[6] ?? 0) + g) | 0;
    H[7] = ((H[7] ?? 0) + h) | 0;
  }
  return Array.from(H)
    .map((x) => (x >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Single-Use 5-Minute Export Ticket Simulation
 * Strictly matches backend `app/routers/export.py:19-72`
 * - 32-byte URL-safe string
 * - SHA-256 hashed into `ticket_hash`
 * - TTL: 5 minutes (300 seconds)
 * - Atomic single-use consumption
 */
export interface ExportTicket {
  ticket: string;
  ticket_hash: string;
  expires_in: number; // 300 seconds
  expires_at: number; // UTC timestamp ms
  used: boolean;
  user_id: number | string;
  role: string;
}

export class ExportTicketManager {
  private tickets = new Map<string, ExportTicket>();

  createTicket(
    userId: number | string,
    role: string,
  ): { ticket: string; ticket_hash: string; expires_in: number } {
    const randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let ticket = "";
    for (let i = 0; i < 43; i++) {
      ticket += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    const ticket_hash = sha256Sync(ticket);
    const expires_in = 300; // 5 minutes
    const expires_at = Date.now() + expires_in * 1000;

    const record: ExportTicket = {
      ticket,
      ticket_hash,
      expires_in,
      expires_at,
      used: false,
      user_id: userId,
      role,
    };

    this.tickets.set(ticket, record);
    return { ticket, ticket_hash, expires_in };
  }

  consumeTicket(ticket: string): { success: boolean; error?: string; ticket?: ExportTicket } {
    const entry = this.tickets.get(ticket);
    if (!entry) {
      return { success: false, error: "Invalid export ticket" };
    }
    if (entry.used) {
      return { success: false, error: "Invalid, expired, or already consumed export ticket" };
    }
    if (Date.now() > entry.expires_at) {
      return { success: false, error: "Export ticket expired (> 5 minutes)" };
    }
    entry.used = true;
    return { success: true, ticket: entry };
  }

  reset(): void {
    this.tickets.clear();
  }
}

export const ticketManager = new ExportTicketManager();

/**
 * Compile Authoritative Export Rows from Invoice records
 * Filters by FY (or 'ALL'), cleanses sensitive data, and enforces 17 authoritative columns.
 */
export function compileExportRows(
  invoices: readonly Invoice[],
  fy: string = "ALL",
  referenceDate: string = asOfDate,
): ExportRow[] {
  const filtered = invoices.filter((inv) => fy === "ALL" || inv.fy_code === fy);

  return filtered.map((inv) => {
    // Determine status & balances conforming to v_invoice_summary SQL view
    const isCancelled = inv.payment_status === "CANCELLED";
    const isUnbilled = !inv.invoice_number?.trim();
    const computedStatus = isCancelled
      ? "CANCELLED"
      : isUnbilled
        ? "UNBILLED"
        : inv.computed_status ||
          (inv.outstanding_balance <= 0 ? "PAID" : inv.total_paid > 0 ? "PARTIAL" : "PENDING");

    const outstandingBalance = isCancelled ? 0.0 : inv.outstanding_balance;
    const invDaysOverdue = (inv as Record<string, unknown>)["days_overdue"] as number | undefined;
    const daysOverdue =
      isCancelled || isUnbilled
        ? 0
        : invDaysOverdue !== undefined
          ? invDaysOverdue
          : classifyAging(inv, referenceDate).daysOverdue;

    const row: ExportRow = {
      FY: inv.fy_code,
      "PO Date": inv.po_date,
      "PO Number": inv.po_number,
      "Customer Name": inv.customer_name,
      Executive: inv.executive_name,
      "Exclusive Amount (₹)": Number(inv.exclusive_amount ?? 0),
      "Tax Amount (₹)": Number(inv.tax_amount ?? 0),
      "Total Invoiced (₹)": Number(inv.total_amount ?? 0),
      "Invoice Number": inv.invoice_number ?? "",
      "Invoice Date": inv.invoice_date ?? "",
      "Due Date": inv.due_date ?? "",
      "Cash Received (₹)": Number(inv.total_cash_paid ?? 0),
      "TDS Deducted (₹)": Number(inv.total_tds_deducted ?? 0),
      "Total Settled (₹)": Number(inv.total_paid ?? 0),
      "Balance Outstanding (₹)": Number(outstandingBalance ?? 0),
      Status: computedStatus,
      "Days Overdue": Number(daysOverdue ?? 0),
    };

    return row;
  });
}

/**
 * Calculate Summary Totals for the Export Dataset
 */
export function calculateExportTotals(rows: readonly ExportRow[]): ExportTotals {
  return rows.reduce(
    (acc, row) => {
      // Unbilled orders are excluded from invoiced revenue totals
      const isIssued = Boolean(row["Invoice Number"]?.trim()) && row["Status"] !== "CANCELLED";
      if (isIssued) {
        acc.totalInvoiced += row["Total Invoiced (₹)"];
        acc.totalExclusive += row["Exclusive Amount (₹)"];
        acc.totalTax += row["Tax Amount (₹)"];
      }
      acc.totalCash += row["Cash Received (₹)"];
      acc.totalTds += row["TDS Deducted (₹)"];
      acc.totalSettled += row["Total Settled (₹)"];
      acc.totalOutstanding += row["Balance Outstanding (₹)"];
      acc.recordCount += 1;
      return acc;
    },
    {
      totalInvoiced: 0,
      totalExclusive: 0,
      totalTax: 0,
      totalCash: 0,
      totalTds: 0,
      totalSettled: 0,
      totalOutstanding: 0,
      recordCount: 0,
    },
  );
}

/**
 * XML Entity Escaping helper
 */
function escapeXml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate Structured SpreadsheetML 2003 XML Workbook
 * Matches openpyxl styling:
 * - Worksheet title: "Invoices & Collections"
 * - Header font: Calibri 11pt, bold, white (#FFFFFF)
 * - Header fill: #1F4E79 solid pattern
 * - Alignment: centered
 * - Currency number format: ₹#,##0.00 on columns 6, 7, 8, 12, 13, 14, 15
 * - Auto-widths: max(max_len + 3, 12)
 * - Formula injection protection applied
 */
export function generateExcelXml(rows: readonly ExportRow[], fy: string = "ALL"): string {
  // Compute column auto-widths across headers and data
  const colWidths = AUTHORITATIVE_COLUMNS.map((colHeader, colIdx) => {
    const isCurrency = (CURRENCY_COLUMN_INDICES as readonly number[]).includes(colIdx);
    const colValues = rows.map((r) => {
      const val = r[colHeader];
      return isCurrency && typeof val === "number" ? formatCurrency(val) : String(val ?? "");
    });
    return calculateColumnAutoWidth([colHeader, ...colValues]);
  });

  const headerCellsXml = AUTHORITATIVE_COLUMNS.map((col) => {
    return `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(col)}</Data></Cell>`;
  }).join("");

  const rowsXml = rows
    .map((row) => {
      const cellsXml = AUTHORITATIVE_COLUMNS.map((col, idx) => {
        const rawVal = row[col];
        const isCurrency = (CURRENCY_COLUMN_INDICES as readonly number[]).includes(idx);

        if (isCurrency && typeof rawVal === "number") {
          return `<Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${rawVal.toFixed(2)}</Data></Cell>`;
        } else if (typeof rawVal === "number") {
          return `<Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${rawVal}</Data></Cell>`;
        } else {
          const sanitized = sanitizeFormulaInjection(String(rawVal ?? ""));
          const isCentered =
            col === "FY" ||
            col === "Status" ||
            col === "PO Date" ||
            col === "Invoice Date" ||
            col === "Due Date";
          const styleId = isCentered ? "CenterStyle" : "TextStyle";
          return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(sanitized)}</Data></Cell>`;
        }
      }).join("");
      return `<Row ss:AutoFitHeight="1">${cellsXml}</Row>`;
    })
    .join("\n    ");

  const columnsXml = colWidths
    .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${Math.round(width * 7.5)}" />`)
    .join("\n   ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>CollectFlow Export - ${escapeXml(fy)}</Title>
  <Author>CollectFlow</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F4E79" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="CurrencyStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
   <NumberFormat ss:Format="₹#,##0.00"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
   <NumberFormat ss:Format="0"/>
  </Style>
  <Style ss:ID="CenterStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="TextStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Invoices &amp; Collections">
  <Table>
   ${columnsXml}
   <Row ss:AutoFitHeight="1">
    ${headerCellsXml}
   </Row>
    ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function cleanFilenameFy(fy: string): string {
  return (fy || "ALL").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Generate Excel Blob & Filename
 */
export function generateExcelBlob(
  rows: readonly ExportRow[],
  fy: string = "ALL",
): { blob: Blob; filename: string } {
  const xml = generateExcelXml(rows, fy);
  const cleanFy = cleanFilenameFy(fy);
  const filename = `CollectFlow_Export_${cleanFy}.xlsx`;
  const blob = new Blob([xml], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8",
  });
  return { blob, filename };
}

export interface CsvExportOptions {
  includeDemoBanner?: boolean;
  formatCurrency?: boolean;
}

/**
 * Generate Client-Side Demo CSV Export
 * Explicitly labeled as "Demo CSV Export" with formula injection guards.
 * CSV is strictly a frontend simulation and NOT a backend API capability.
 */
export function generateDemoCsv(
  rows: readonly ExportRow[],
  fy: string = "ALL",
  options: CsvExportOptions = { includeDemoBanner: true, formatCurrency: true },
): {
  content: string;
  filename: string;
  blob: Blob;
  label: string;
} {
  const cleanFy = cleanFilenameFy(fy);
  const filename = `CollectFlow_Demo_CSV_Export_${cleanFy}.csv`;

  const escapeCsvCell = (val: string | number): string => {
    let text = String(val ?? "");
    // Escape formula injection
    text = String(sanitizeFormulaInjection(text));
    if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines: string[] = [];

  if (options.includeDemoBanner) {
    lines.push(
      `# Demo CSV Export — Client-Side Simulation Only (Backend produces authoritative XLSX via /api/export/excel)`,
    );
  }

  // Header row
  lines.push(AUTHORITATIVE_COLUMNS.map(escapeCsvCell).join(","));

  // Data rows
  for (const row of rows) {
    const rowValues = AUTHORITATIVE_COLUMNS.map((col, idx) => {
      const rawVal = row[col];
      const isCurrency = (CURRENCY_COLUMN_INDICES as readonly number[]).includes(idx);
      if (isCurrency && typeof rawVal === "number") {
        return options.formatCurrency ? formatCurrency(rawVal) : rawVal.toFixed(2);
      }
      return rawVal ?? "";
    });
    lines.push(rowValues.map(escapeCsvCell).join(","));
  }

  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });

  return {
    content,
    filename,
    blob,
    label: DEMO_CSV_LABEL,
  };
}

/**
 * Browser File Download Trigger
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
