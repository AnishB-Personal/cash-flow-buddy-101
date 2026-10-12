import { describe, it, expect, beforeEach } from "vitest";
import {
  AUTHORITATIVE_COLUMNS,
  CURRENCY_COLUMNS,
  CURRENCY_COLUMN_INDICES,
  EXCEL_CURRENCY_FORMAT,
  EXCEL_HEADER_STYLE,
  DEMO_CSV_LABEL,
  sanitizeFormulaInjection,
  stripSensitiveFields,
  isSensitiveKey,
  formatCurrency,
  calculateColumnAutoWidth,
  canExport,
  getExportPermissions,
  ExportTicketManager,
  ticketManager,
  compileExportRows,
  calculateExportTotals,
  generateExcelXml,
  generateExcelBlob,
  generateXlsxZipBytes,
  createStoredZip,
  generateDemoCsv,
  type ExportRow,
} from "@/utils/export-engine";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { data as fixtureData, type Invoice } from "@/data/collectflow";

describe("Export Engine — Authoritative Columns & Structure", () => {
  it("enforces exact 17-column order and headers matching v_invoice_summary contract", () => {
    expect(AUTHORITATIVE_COLUMNS).toHaveLength(17);
    expect([...AUTHORITATIVE_COLUMNS]).toEqual([
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
    ]);
  });

  it("identifies exact 7 currency columns and 0-based indices matching columns 6, 7, 8, 12, 13, 14, 15", () => {
    expect(CURRENCY_COLUMNS).toHaveLength(7);
    expect([...CURRENCY_COLUMN_INDICES]).toEqual([5, 6, 7, 11, 12, 13, 14]);

    // Verify mapping from indices to column names
    const mappedColumns = CURRENCY_COLUMN_INDICES.map((idx) => AUTHORITATIVE_COLUMNS[idx]);
    expect(mappedColumns).toEqual([
      "Exclusive Amount (₹)",
      "Tax Amount (₹)",
      "Total Invoiced (₹)",
      "Cash Received (₹)",
      "TDS Deducted (₹)",
      "Total Settled (₹)",
      "Balance Outstanding (₹)",
    ]);
  });
});

describe("Export Engine — Formula Injection Sanitization (CWE-1236)", () => {
  it("escapes all formula injection trigger characters: =, +, -, @, \\t, \\r", () => {
    // Leading '='
    expect(sanitizeFormulaInjection("=SUM(A1:B10)")).toBe("'=SUM(A1:B10)");
    expect(sanitizeFormulaInjection("=cmd|/C calc!A0")).toBe("'=cmd|/C calc!A0");

    // Leading '+'
    expect(sanitizeFormulaInjection("+123456789")).toBe("'+123456789");
    expect(sanitizeFormulaInjection("+cmd|/C calc!A0")).toBe("'+cmd|/C calc!A0");

    // Leading '-'
    expect(sanitizeFormulaInjection("-5000")).toBe("'-5000");
    expect(sanitizeFormulaInjection("-2+3*4")).toBe("'-2+3*4");

    // Leading '@'
    expect(sanitizeFormulaInjection("@SUM(1,2)")).toBe("'@SUM(1,2)");
    expect(sanitizeFormulaInjection("@attacker.com")).toBe("'@attacker.com");

    // Leading Tab '\t'
    expect(sanitizeFormulaInjection("\tcmd")).toBe("'\tcmd");
    expect(sanitizeFormulaInjection("\t=1+1")).toBe("'\t=1+1");

    // Leading Carriage Return '\r'
    expect(sanitizeFormulaInjection("\rcmd")).toBe("'\rcmd");
    expect(sanitizeFormulaInjection("\r=2+2")).toBe("'\r=2+2");
  });

  it("leaves safe alphanumeric strings, numbers, and nullish inputs untouched", () => {
    expect(sanitizeFormulaInjection("Acme Cloud Solutions")).toBe("Acme Cloud Solutions");
    expect(sanitizeFormulaInjection("INV-2026-042")).toBe("INV-2026-042");
    expect(sanitizeFormulaInjection("FY 2026-27")).toBe("FY 2026-27");
    expect(sanitizeFormulaInjection("100% Guaranteed")).toBe("100% Guaranteed");
    expect(sanitizeFormulaInjection("")).toBe("");
    expect(sanitizeFormulaInjection(531000)).toBe(531000);
    expect(sanitizeFormulaInjection(-42)).toBe(-42); // numeric type is safe
    expect(sanitizeFormulaInjection(null)).toBeNull();
    expect(sanitizeFormulaInjection(undefined)).toBeUndefined();
  });
});

describe("Export Engine — Currency Formatting", () => {
  it("formats amounts into Indian Rupee currency standard with two decimals", () => {
    expect(EXCEL_CURRENCY_FORMAT).toBe("₹#,##0.00");

    const formattedInvoiced = formatCurrency(531000);
    expect(formattedInvoiced).toBe("₹5,31,000.00");

    const formattedSettled = formatCurrency(209000);
    expect(formattedSettled).toBe("₹2,09,000.00");

    const formattedOutstanding = formatCurrency(322000);
    expect(formattedOutstanding).toBe("₹3,22,000.00");

    const formattedZero = formatCurrency(0);
    expect(formattedZero).toBe("₹0.00");
  });
});

describe("Export Engine — Column Auto-Widths", () => {
  it("calculates column widths via max(max_len + 3, 12)", () => {
    // Short content under minimum 12
    expect(calculateColumnAutoWidth(["FY", "FY"])).toBe(12);

    // Medium content (length 10 -> 10 + 3 = 13)
    expect(calculateColumnAutoWidth(["FY", "FY 2026-27"])).toBe(13);

    // Long header: 'Balance Outstanding (₹)' has length 23 -> 23 + 3 = 26
    expect(calculateColumnAutoWidth(["Balance Outstanding (₹)", "₹3,22,000.00"])).toBe(26);

    // Empty values
    expect(calculateColumnAutoWidth([null, undefined, ""])).toBe(12);
  });
});

describe("Export Engine — Sensitive Data Stripping", () => {
  it("detects sensitive keys correctly", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("password_hash")).toBe(true);
    expect(isSensitiveKey("hashed_password")).toBe(true);
    expect(isSensitiveKey("salt")).toBe(true);
    expect(isSensitiveKey("secret")).toBe(true);
    expect(isSensitiveKey("token")).toBe(true);
    expect(isSensitiveKey("session_token")).toBe(true);
    expect(isSensitiveKey("auth_token")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("private_key")).toBe(true);
    expect(isSensitiveKey("credential")).toBe(true);

    expect(isSensitiveKey("customer_name")).toBe(false);
    expect(isSensitiveKey("invoice_number")).toBe(false);
    expect(isSensitiveKey("total_amount")).toBe(false);
  });

  it("strips all sensitive credentials from objects recursively", () => {
    const rawUserRecord = {
      id: 1,
      username: "admin",
      full_name: "Administrator",
      password: "PlainPassword123!",
      password_hash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      salt: "random_salt_value",
      secret_key: "super-secret",
      auth_token: "bearer-xyz",
      nested: {
        role: "admin",
        private_key: "rsa_private_xyz",
      },
    };

    const sanitized = stripSensitiveFields(rawUserRecord);
    expect(sanitized).toEqual({
      id: 1,
      username: "admin",
      full_name: "Administrator",
      nested: {
        role: "admin",
      },
    });
    const sanitizedObj = sanitized as Record<string, unknown>;
    expect(sanitizedObj["password"]).toBeUndefined();
    expect(sanitizedObj["password_hash"]).toBeUndefined();
    expect(sanitizedObj["salt"]).toBeUndefined();
    expect(sanitizedObj["secret_key"]).toBeUndefined();
    expect(sanitizedObj["auth_token"]).toBeUndefined();
  });
});

describe("Export Engine — Role-Based Access Control", () => {
  it("grants full export access to Admin and Finance roles", () => {
    expect(canExport("admin")).toBe(true);
    expect(canExport("finance")).toBe(true);

    const adminPerms = getExportPermissions("admin");
    expect(adminPerms.allowed).toBe(true);
    expect(adminPerms.canDownload).toBe(true);
    expect(adminPerms.canPreview).toBe(true);
    expect(adminPerms.reason).toBeUndefined();

    const financePerms = getExportPermissions("finance");
    expect(financePerms.allowed).toBe(true);
    expect(financePerms.canDownload).toBe(true);
    expect(financePerms.canPreview).toBe(true);
    expect(financePerms.reason).toBeUndefined();
  });

  it("restricts Sales and Viewer roles to view-only preview access", () => {
    expect(canExport("sales")).toBe(false);
    expect(canExport("viewer")).toBe(false);

    const salesPerms = getExportPermissions("sales");
    expect(salesPerms.allowed).toBe(false);
    expect(salesPerms.canDownload).toBe(false);
    expect(salesPerms.canPreview).toBe(true);
    expect(salesPerms.reason).toContain("restricted to Admin and Finance");

    const viewerPerms = getExportPermissions("viewer");
    expect(viewerPerms.allowed).toBe(false);
    expect(viewerPerms.canDownload).toBe(false);
    expect(viewerPerms.canPreview).toBe(true);
    expect(viewerPerms.reason).toContain("restricted to Admin and Finance");
  });
});

describe("Export Engine — Single-Use 5-Minute Ticket Simulation", () => {
  let manager: ExportTicketManager;

  beforeEach(() => {
    manager = new ExportTicketManager();
  });

  it("issues a ticket with 300 seconds TTL and SHA-256 ticket_hash matching backend protocol", () => {
    const { ticket, ticket_hash, expires_in } = manager.createTicket(1, "admin");

    expect(ticket).toHaveLength(43);
    expect(ticket_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(expires_in).toBe(300);
  });

  it("allows single-use consumption and rejects replay attempts", () => {
    const { ticket } = manager.createTicket(1, "admin");

    // First consumption succeeds
    const firstAttempt = manager.consumeTicket(ticket);
    expect(firstAttempt.success).toBe(true);
    expect(firstAttempt.ticket?.used).toBe(true);

    // Second consumption is blocked (atomic single-use)
    const secondAttempt = manager.consumeTicket(ticket);
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toContain("already consumed");
  });

  it("rejects invalid or non-existent tickets", () => {
    const attempt = manager.consumeTicket("non_existent_ticket_12345");
    expect(attempt.success).toBe(false);
    expect(attempt.error).toBe("Invalid export ticket");
  });
});

describe("Export Engine — Dataset Compilation & Financial Reconciliation", () => {
  it("compiles rows for approved baseline FY 2026-27 reconciling with financial invariants", () => {
    const rows = compileExportRows(fixtureData.invoices, "FY 2026-27");
    expect(rows).toHaveLength(2); // INV-2026-042 and PO-NEXUS-881

    const totals = calculateExportTotals(rows);

    // Approved invariants
    // Total Invoiced: ₹5,31,000 (INV-2026-042; unbilled PO-NEXUS-881 excluded)
    expect(totals.totalInvoiced).toBe(531000);
    // Cash Collected: ₹2,00,000
    expect(totals.totalCash).toBe(200000);
    // TDS Deducted: ₹9,000
    expect(totals.totalTds).toBe(9000);
    // Settlements: ₹2,09,000
    expect(totals.totalSettled).toBe(209000);
    // Outstanding: ₹3,22,000 (Acme invoice)
    expect(totals.totalOutstanding).toBe(322000 + 295000); // 322k invoice + 295k unbilled order in raw totals
  });

  it("excludes unbilled purchase order PO-NEXUS-881 from invoiced gross total", () => {
    const rows = compileExportRows(fixtureData.invoices, "FY 2026-27");
    const totals = calculateExportTotals(rows);

    // Gross invoiced must be exactly ₹5,31,000
    expect(totals.totalInvoiced).toBe(531000);

    const unbilledRow = rows.find((r) => r["PO Number"] === "PO-NEXUS-881");
    expect(unbilledRow).toBeDefined();
    expect(unbilledRow?.Status).toBe("UNBILLED");
    expect(unbilledRow?.["Invoice Number"]).toBe("");
  });

  it("correctly zeroes out outstanding balance for CANCELLED invoices", () => {
    const cancelledInvoice: Invoice = {
      id: 999,
      fy_code: "FY 2026-27",
      order_type: "PO",
      po_number: "PO-CANCELLED-001",
      po_date: "2026-04-01",
      customer_id: 1,
      executive_id: 3,
      customer_name: "Acme Cloud Solutions Pvt Ltd",
      customer_gstin: "29AAAAA0000A1Z5",
      customer_address: "Bangalore",
      customer_state: "Karnataka",
      currency: "INR",
      exchange_rate: 1.0,
      original_amount: 100000.0,
      exclusive_amount: 100000.0,
      tax_rate: 0.18,
      tax_amount: 18000.0,
      total_amount: 118000.0,
      invoice_number: "INV-2026-041",
      invoice_date: "2026-04-02",
      due_date: "2026-05-02",
      remarks: "[CANCELLED: Customer requested cancellation]",
      payment_status: "CANCELLED",
      total_cash_paid: 0.0,
      total_tds_deducted: 0.0,
      total_paid: 0.0,
      outstanding_balance: 118000.0, // raw snapshot might have old balance
      computed_status: "CANCELLED",
      executive_name: "Neha Rao",
      line_items: [],
      payments: [],
    };

    const compiled = compileExportRows([cancelledInvoice], "FY 2026-27");
    expect(compiled[0]?.Status).toBe("CANCELLED");
    expect(compiled[0]?.["Balance Outstanding (₹)"]).toBe(0.0);
    expect(compiled[0]?.["Days Overdue"]).toBe(0);
  });
});

describe("Export Engine — Excel XML Workbook Generation & Styling", () => {
  it("generates structured SpreadsheetML XML with authoritative styling and worksheet name", () => {
    const rows = compileExportRows(fixtureData.invoices, "FY 2026-27");
    const xml = generateExcelXml(rows, "FY 2026-27");

    // Worksheet title: "Invoices & Collections"
    expect(xml).toContain('ss:Name="Invoices &amp; Collections"');

    // Header styling: Calibri 11pt, bold, color #FFFFFF, fill #1F4E79
    expect(EXCEL_HEADER_STYLE.fontName).toBe("Calibri");
    expect(EXCEL_HEADER_STYLE.fontSize).toBe(11);
    expect(EXCEL_HEADER_STYLE.fillColor).toBe("#1F4E79");
    expect(xml).toContain('ss:ID="HeaderStyle"');
    expect(xml).toContain('ss:FontName="Calibri"');
    expect(xml).toContain('ss:Color="#FFFFFF"');
    expect(xml).toContain('ss:Color="#1F4E79"');

    // Currency number format: ₹#,##0.00
    expect(xml).toContain('ss:ID="CurrencyStyle"');
    expect(xml).toContain('ss:Format="₹#,##0.00"');

    // All 17 authoritative column headers present
    for (const col of AUTHORITATIVE_COLUMNS) {
      expect(xml).toContain(`<Data ss:Type="String">${col}</Data>`);
    }
  });

  it("generates Excel blob with valid MIME type, filename, and genuine ZIP PK magic bytes (CF6-P01)", () => {
    const rows = compileExportRows(fixtureData.invoices, "FY 2026-27");
    const { blob, filename, bytes } = generateExcelBlob(rows, "FY 2026-27");

    expect(filename).toBe("CollectFlow_Export_FY_2026-27.xlsx");
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(blob.size).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(0);

    // Verify genuine PKZip 2.0 magic bytes: PK\x03\x04
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it("produces genuine XLSX package verifiable programmatically by Python openpyxl (CF6-P01)", () => {
    const rows = compileExportRows(fixtureData.invoices, "ALL");
    const { bytes } = generateExcelBlob(rows, "ALL");

    const tmpPath = "/tmp/collectflow_test_openpyxl.xlsx";
    fs.writeFileSync(tmpPath, bytes);

    const pyScript = `import openpyxl

wb = openpyxl.load_workbook('${tmpPath}')
ws = wb.active
assert ws.title == 'Invoices & Collections', f'Bad title: {ws.title}'
assert ws.max_column == 17, f'Bad cols: {ws.max_column}'

headers = [ws.cell(1, col).value for col in range(1, 18)]
assert headers[0] == 'FY'
assert headers[5] == 'Exclusive Amount (₹)'
assert headers[16] == 'Days Overdue'

# Check header styling
h1 = ws.cell(1, 1)
assert h1.font.bold is True
assert h1.font.name == 'Calibri'
assert h1.fill.fgColor.rgb == 'FF1F4E79'

# Check currency format
c_curr = ws.cell(2, 6)
assert c_curr.number_format == '₹#,##0.00'

print('SUCCESS')
`;
    const pyScriptPath = "/tmp/collectflow_verify_openpyxl.py";
    fs.writeFileSync(pyScriptPath, pyScript);
    const pyOutput = execSync(`python3 ${pyScriptPath}`).toString().trim();
    expect(pyOutput).toBe("SUCCESS");
  });
});

describe("Export Engine — Demo CSV Export & Labeling", () => {
  it("generates CSV explicitly labeled as Demo CSV Export with formula injection protection", () => {
    const maliciousInvoice: Invoice = {
      id: 888,
      fy_code: "FY 2026-27",
      order_type: "PO",
      po_number: "=cmd|/C calc!A0", // formula injection
      po_date: "2026-04-10",
      customer_id: 1,
      executive_id: 3,
      customer_name: "@evil_corp", // formula injection
      customer_gstin: "29AAAAA0000A1Z5",
      customer_address: "+Bangalore Office", // formula injection
      customer_state: "Karnataka",
      currency: "INR",
      exchange_rate: 1.0,
      original_amount: 10000.0,
      exclusive_amount: 10000.0,
      tax_rate: 0.18,
      tax_amount: 1800.0,
      total_amount: 11800.0,
      invoice_number: "-INV-999", // formula injection
      invoice_date: "2026-04-11",
      due_date: "2026-05-11",
      remarks: "Test",
      payment_status: "PENDING",
      total_cash_paid: 0.0,
      total_tds_deducted: 0.0,
      total_paid: 0.0,
      outstanding_balance: 11800.0,
      computed_status: "PENDING",
      executive_name: "\tNeha Rao", // tab formula trigger
      line_items: [],
      payments: [],
    };

    const rows = compileExportRows([maliciousInvoice], "FY 2026-27");
    const csvResult = generateDemoCsv(rows, "FY 2026-27");

    // Verification of Demo CSV Labeling
    expect(csvResult.label).toBe(DEMO_CSV_LABEL);
    expect(csvResult.filename).toBe("CollectFlow_Demo_CSV_Export_FY_2026-27.csv");
    expect(csvResult.content).toContain("# Demo CSV Export");

    // Verification of Formula Injection Sanitization (prepends ')
    expect(csvResult.content).toContain("'=cmd|/C calc!A0");
    expect(csvResult.content).toContain("'@evil_corp");
    expect(csvResult.content).toContain("'-INV-999");
    expect(csvResult.content).toContain("'\tNeha Rao");
  });
});

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MockSessionProvider, useMockSession } from "@/components/collectflow/session";
import { ExportDrawer, type ExportResult } from "@/components/collectflow/export-drawer";
import type { Role } from "@/data/records";

function DrawerWrapper({
  role = "admin",
  children,
  onSessionReady,
}: {
  role?: Role;
  children?: React.ReactNode;
  onSessionReady?: (session: ReturnType<typeof useMockSession>) => void;
}) {
  return React.createElement(
    MockSessionProvider,
    null,
    React.createElement(SessionHelper, { role, onSessionReady }),
    children,
  );
}

function SessionHelper({
  role,
  onSessionReady,
}: {
  role: Role;
  onSessionReady?: ((session: ReturnType<typeof useMockSession>) => void) | undefined;
}) {
  const session = useMockSession();
  const init = React.useRef(false);
  React.useEffect(() => {
    if (!init.current) {
      init.current = true;
      if (session.role !== role) session.setRole(role);
    }
  }, [role, session]);
  React.useEffect(() => {
    if (onSessionReady) onSessionReady(session);
  }, [session, onSessionReady]);
  return null;
}

describe("ExportDrawer — 5-Step Workflow UI Component Tests", () => {
  it("renders the 5-step progress indicator and begins on Scope step", () => {
    const handleClose = () => {};
    render(
      React.createElement(
        DrawerWrapper,
        { role: "admin" },
        React.createElement(ExportDrawer, { close: handleClose }),
      ),
    );

    const progress = screen.getByLabelText("Export workflow progress");
    expect(progress).toBeDefined();

    expect(screen.getByText("Scope")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Preview")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Review")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Confirm")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Result")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("1. Financial Year Scope")).toBeDefined();
  });

  it("navigates through all 5 steps: Scope -> Preview -> Review -> Confirm -> Result", async () => {
    let completedResult: ExportResult | null = null;
    const handleClose = () => {};

    render(
      React.createElement(
        DrawerWrapper,
        { role: "admin" },
        React.createElement(ExportDrawer, {
          close: handleClose,
          onExportComplete: (res: ExportResult) => {
            completedResult = res;
          },
        }),
      ),
    );

    // Step 1: Scope -> Click Continue to Preview
    const continueBtn = screen.getByText("Continue to Preview");
    fireEvent.click(continueBtn);

    // Step 2: Preview -> Verify count and click Review Columns & Totals
    expect(screen.getByText("Preview")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Sample Dataset Rows Preview/i)).toBeDefined();

    const reviewBtn = screen.getByText("Review Columns & Totals");
    fireEvent.click(reviewBtn);

    // Step 3: Review -> Verify financial totals and click Proceed to Confirmation
    expect(screen.getByText("Review")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("1. Summary Financial Totals (Reconciliation)")).toBeDefined();
    expect(screen.getByText("2. Authoritative 17 Columns Checklist")).toBeDefined();

    const confirmNavBtn = screen.getByText("Proceed to Confirmation");
    fireEvent.click(confirmNavBtn);

    // Step 4: Confirm -> Verify pre-flight checks and trigger generation
    expect(screen.getByText("Confirm")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Pre-Flight Security & Integrity Checks/i)).toBeDefined();
    expect(screen.getByText(/Acting Role: ADMIN/i)).toBeDefined();

    const generateBtn = screen.getByText(/Confirm & Generate Excel Export/i);
    fireEvent.click(generateBtn);

    // Step 5: Result -> Verify download button and artifact details
    expect(screen.getByText("Result")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Export Generated Successfully")).toBeDefined();
    expect(screen.getByText("Download Export File")).toBeDefined();
    expect(completedResult).not.toBeNull();
    const resultObj = completedResult as ExportResult | null;
    expect(resultObj?.format).toBe("excel");
    expect(resultObj?.filename).toContain(".xlsx");
  });

  it("displays unsaved discard prompt when user modifies scope and clicks close", () => {
    let closed = false;
    render(
      React.createElement(
        DrawerWrapper,
        { role: "admin" },
        React.createElement(ExportDrawer, {
          close: () => {
            closed = true;
          },
        }),
      ),
    );

    // Modify scope by clicking another FY pill
    const fyAllBtn = screen.getByText("ALL");
    fireEvent.click(fyAllBtn);

    // Attempt close via X button
    const closeBtn = screen.getByLabelText("Close export drawer");
    fireEvent.click(closeBtn);

    // Discard prompt should appear
    expect(screen.getByText("Discard unsaved export parameters?")).toBeDefined();
    expect(closed).toBe(false);

    // Clicking Discard inputs triggers close
    const discardBtn = screen.getByText("Discard inputs");
    fireEvent.click(discardBtn);
    expect(closed).toBe(true);
  });

  it("displays permission denial banner and blocks confirmation when role is Sales or Viewer", () => {
    render(
      React.createElement(
        DrawerWrapper,
        { role: "sales" },
        React.createElement(ExportDrawer, { close: () => {} }),
      ),
    );

    // Denial banner must be visible
    const denialBanner = screen.getByRole("alert");
    expect(denialBanner.textContent).toContain("Permission Notice");
    expect(denialBanner.textContent).toContain(
      "Only Admin and Finance roles have full export generation access",
    );

    // Navigate to Confirm step
    fireEvent.click(screen.getByText("Continue to Preview"));
    fireEvent.click(screen.getByText("Review Columns & Totals"));
    fireEvent.click(screen.getByText("Proceed to Confirmation"));

    // In Confirm step, generation button must be disabled
    const generateBtn = screen.getByRole("button", { name: /Confirm & Generate/i });
    expect(generateBtn).toBeDisabled();
  });

  it("dynamically reacts to mid-drawer simulated role changes", () => {
    let sessionRef: ReturnType<typeof useMockSession> | null = null;
    render(
      React.createElement(
        DrawerWrapper,
        {
          role: "admin",
          onSessionReady: (s) => {
            sessionRef = s;
          },
        },
        React.createElement(ExportDrawer, { close: () => {} }),
      ),
    );

    // Initially admin, no denial banner
    expect(screen.queryByRole("alert")).toBeNull();

    // Navigate to Confirm step
    fireEvent.click(screen.getByText("Continue to Preview"));
    fireEvent.click(screen.getByText("Review Columns & Totals"));
    fireEvent.click(screen.getByText("Proceed to Confirmation"));

    const generateBtn = screen.getByRole("button", { name: /Confirm & Generate/i });
    expect(generateBtn).not.toBeDisabled();

    // Mid-workflow role change to Viewer
    act(() => {
      sessionRef?.setRole("viewer");
    });

    // Denial banner appears immediately and blocks button
    expect(screen.getByRole("alert")).toBeDefined();
    expect(generateBtn).toBeDisabled();
  });
});

describe("Stage 6 Independent UAT Defect Corrections (CF6-01 through CF6-04)", () => {
  // CF6-01: Split Recognized AR vs Unbilled Orders in Preview and Review
  describe("CF6-01: Recognized AR vs Unbilled Orders Split", () => {
    it("derives recognizedOutstanding (₹3,22,000) and unbilledOutstanding (₹2,95,000) separately from raw totals", () => {
      const rows = compileExportRows(fixtureData.invoices, "ALL");
      const totals = calculateExportTotals(rows);

      expect(totals.recognizedOutstanding).toBe(322000.0);
      expect(totals.unbilledOutstanding).toBe(295000.0);
      expect(totals.totalOutstanding).toBe(617000.0);
      expect(totals.totalInvoiced).toBe(531000.0);
    });

    it("presents distinct Recognized AR and Unbilled Orders cards in Step 2 Preview and Step 3 Review", () => {
      render(
        React.createElement(
          DrawerWrapper,
          { role: "admin" },
          React.createElement(ExportDrawer, { close: () => {} }),
        ),
      );

      // Step 1 -> Step 2 Preview
      fireEvent.click(screen.getByText("Continue to Preview"));
      expect(screen.getByText("Recognized AR")).toBeDefined();
      expect(screen.getByText("Unbilled Orders")).toBeDefined();
      expect(screen.getAllByText("₹3,22,000.00").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("₹2,95,000.00").length).toBeGreaterThanOrEqual(1);

      // Step 2 -> Step 3 Review
      fireEvent.click(screen.getByText("Review Columns & Totals"));
      expect(screen.getByText("Balance Outstanding")).toBeDefined();
      expect(screen.getByText("Recognized Accounts Receivable")).toBeDefined();
      expect(screen.getByText("Unbilled Orders (Gross)")).toBeDefined();
      expect(screen.getByText("Pending Commercial Invoice")).toBeDefined();
    });
  });

  // CF6-02: Cancelled Invoice Retention in Raw Export
  describe("CF6-02: Cancelled Invoice Retention in Raw Export", () => {
    it("retains CANCELLED invoices in raw export with status CANCELLED, 0 outstanding, and 0 days overdue", () => {
      const cancelledInvoice: Invoice = {
        id: 103,
        fy_code: "FY 2026-27",
        order_type: "PO",
        po_number: "PO-CANCEL-001",
        po_date: "2026-04-11",
        customer_id: 1,
        executive_id: 3,
        customer_name: "Acme Cloud Solutions Pvt Ltd",
        customer_gstin: "27AABCA1234A1Z5",
        customer_address: "Plot 42, Tech Park, Andheri East, Mumbai, Maharashtra - 400069",
        customer_state: "Maharashtra",
        currency: "INR",
        exchange_rate: 1.0,
        original_amount: 100000.0,
        exclusive_amount: 100000.0,
        tax_rate: 0.18,
        tax_amount: 18000.0,
        total_amount: 118000.0,
        invoice_number: "INV-2026-041",
        invoice_date: "2026-04-12",
        due_date: "2026-04-25",
        remarks: "Cancelled prior to payment",
        payment_status: "CANCELLED",
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 118000.0, // raw legacy balance before cancellation
        computed_status: "CANCELLED",
        executive_name: "Neha Rao",
        line_items: [],
        payments: [],
      };

      const dataset = [...fixtureData.invoices, cancelledInvoice];
      const rows = compileExportRows(dataset, "ALL");
      expect(rows).toHaveLength(3);

      const cancelledRow = rows.find((r) => r["Invoice Number"] === "INV-2026-041");
      expect(cancelledRow).toBeDefined();
      expect(cancelledRow?.Status).toBe("CANCELLED");
      expect(cancelledRow?.["Balance Outstanding (₹)"]).toBe(0.0);
      expect(cancelledRow?.["Days Overdue"]).toBe(0);

      // Verify financial totals exclude cancelled invoice from revenue and receivables
      const totals = calculateExportTotals(rows);
      expect(totals.totalInvoiced).toBe(531000.0);
      expect(totals.recognizedOutstanding).toBe(322000.0);
      expect(totals.unbilledOutstanding).toBe(295000.0);
      expect(totals.totalOutstanding).toBe(617000.0);
    });

    it("programmatically verifies XLSX with openpyxl confirms 17 columns and cancelled row zero outstanding", () => {
      const cancelledInvoice: Invoice = {
        id: 103,
        fy_code: "FY 2026-27",
        order_type: "PO",
        po_number: "PO-CANCEL-001",
        po_date: "2026-04-11",
        customer_id: 1,
        executive_id: 3,
        customer_name: "Acme Cloud Solutions Pvt Ltd",
        customer_gstin: "27AABCA1234A1Z5",
        customer_address: "Plot 42, Tech Park, Andheri East, Mumbai, Maharashtra - 400069",
        customer_state: "Maharashtra",
        currency: "INR",
        exchange_rate: 1.0,
        original_amount: 100000.0,
        exclusive_amount: 100000.0,
        tax_rate: 0.18,
        tax_amount: 18000.0,
        total_amount: 118000.0,
        invoice_number: "INV-2026-041",
        invoice_date: "2026-04-12",
        due_date: "2026-04-25",
        remarks: "Cancelled",
        payment_status: "CANCELLED",
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 118000.0,
        computed_status: "CANCELLED",
        executive_name: "Neha Rao",
        line_items: [],
        payments: [],
      };

      const rows = compileExportRows([...fixtureData.invoices, cancelledInvoice], "ALL");
      const zipBytes = generateXlsxZipBytes(rows);
      const filePath = "/tmp/collectflow_cancelled_test.xlsx";
      fs.writeFileSync(filePath, zipBytes);

      const pyScript = `
import openpyxl, warnings
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always')
    wb = openpyxl.load_workbook('${filePath}')
    assert len(w) == 0, f'Unexpected warnings: {[str(x) for x in w]}'

ws = wb.active
assert ws.max_column == 17
assert ws.max_row == 4 # Header + 3 rows

# Check cancelled row (row 4)
cancelled_num = ws.cell(4, 9).value # Invoice Number
assert cancelled_num == 'INV-2026-041'
status = ws.cell(4, 16).value # Status
assert status == 'CANCELLED'
balance = ws.cell(4, 15).value # Balance Outstanding
assert balance == 0.0
days = ws.cell(4, 17).value # Days Overdue
assert days == 0

print('CANCELLED_VERIFIED')
`;
      const pyScriptPath = "/tmp/collectflow_cancelled_verify.py";
      fs.writeFileSync(pyScriptPath, pyScript);
      const out = execSync(`python3 ${pyScriptPath}`).toString().trim();
      expect(out).toBe("CANCELLED_VERIFIED");
    });
  });

  // CF6-03: Mobile Export Preview Overflow
  describe("CF6-03: Mobile Export Preview Responsiveness", () => {
    it("renders both cf-table-container and cf-mobile-cards in Step 2 Preview", () => {
      render(
        React.createElement(
          DrawerWrapper,
          { role: "admin" },
          React.createElement(ExportDrawer, { close: () => {} }),
        ),
      );

      fireEvent.click(screen.getByText("Continue to Preview"));

      const tableContainer = document.querySelector(".cf-table-container");
      const mobileCards = document.querySelector(".cf-mobile-cards");

      expect(tableContainer).not.toBeNull();
      expect(mobileCards).not.toBeNull();

      const cards = document.querySelectorAll(".cf-mobile-cards .cf-record-card");
      expect(cards.length).toBe(fixtureData.invoices.length);
    });
  });

  // CF6-04: Executive Attainment Search
  describe("CF6-04: Executive Attainment Search Filtering", () => {
    it("filters executive attainment by query, returning 0 records on CF6-NO-MATCH and restoring on reset", async () => {
      const { getExecutiveAttainmentReport } = await import("@/data/reporting");
      const { INITIAL_TARGETS } = await import("@/data/targets");

      // Baseline: FY 2025-26 has 3 executives (Neha, Kavya, Arjun)
      const baseRep = getExecutiveAttainmentReport(fixtureData.invoices, INITIAL_TARGETS, {
        fy: "FY 2025-26",
      });
      expect(baseRep.rows).toHaveLength(3);
      expect(baseRep.summary.executive_count).toBe(3);
      expect(baseRep.summary.is_filtered).toBe(false);

      // Search for non-existent executive
      const noMatchRep = getExecutiveAttainmentReport(fixtureData.invoices, INITIAL_TARGETS, {
        fy: "FY 2025-26",
        query: "CF6-NO-MATCH",
      });
      expect(noMatchRep.rows).toHaveLength(0);
      expect(noMatchRep.summary.executive_count).toBe(0);
      expect(noMatchRep.summary.total_target).toBe(0);
      expect(noMatchRep.summary.is_filtered).toBe(true);

      // Search for specific executive by name
      const nehaRep = getExecutiveAttainmentReport(fixtureData.invoices, INITIAL_TARGETS, {
        fy: "FY 2025-26",
        query: "Neha",
      });
      expect(nehaRep.rows).toHaveLength(1);
      expect(nehaRep.rows[0]?.executive_name).toBe("Neha Rao");
      expect(nehaRep.summary.executive_count).toBe(1);

      // Search by username
      const siliyaRep = getExecutiveAttainmentReport(fixtureData.invoices, INITIAL_TARGETS, {
        fy: "FY 2025-26",
        query: "siliya",
      });
      expect(siliyaRep.rows).toHaveLength(1);
      expect(siliyaRep.rows[0]?.executive_name).toBe("Neha Rao");

      // Search by user ID
      const idRep = getExecutiveAttainmentReport(fixtureData.invoices, INITIAL_TARGETS, {
        fy: "FY 2025-26",
        query: "5",
      });
      expect(idRep.rows).toHaveLength(1);
      expect(idRep.rows[0]?.executive_name).toBe("Arjun Mehta");
    });
  });
});
