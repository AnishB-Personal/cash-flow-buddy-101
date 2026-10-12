/**
 * CollectFlow Export Drawer (Design B 5-Step Workflow)
 * Implements R1: Authoritative Backend Export Contract & 5-Step Export Workflow
 * Steps: Scope -> Preview -> Review -> Confirm -> Result
 */

import { useState, useRef, useMemo, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Info,
  Clock,
  Sparkles,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMockSession } from "./session";
import { FormSection } from "./demo-controls";
import {
  AUTHORITATIVE_COLUMNS,
  CURRENCY_COLUMNS,
  CURRENCY_COLUMN_INDICES,
  EXCEL_CURRENCY_FORMAT,
  DEMO_CSV_LABEL,
  compileExportRows,
  calculateExportTotals,
  generateExcelBlob,
  generateDemoCsv,
  triggerFileDownload,
  getExportPermissions,
  canExport,
  ticketManager,
  formatCurrency,
  type ExportRow,
  type ExportTotals,
} from "@/utils/export-engine";

export type ExportStep = "scope" | "preview" | "review" | "confirm" | "result";
export type ExportFormat = "excel" | "csv";
export type ExportScopeType = "all" | "issued" | "outstanding";

export interface ExportResult {
  filename: string;
  format: ExportFormat;
  recordCount: number;
  ticket: string;
  ticketHash: string;
  totals: ExportTotals;
}

export interface ExportDrawerProps {
  open?: boolean;
  initialFy?: string;
  container?: HTMLElement | null | undefined;
  close: () => void;
  onExportComplete?: (result: ExportResult) => void;
}

export function ExportDrawer({ initialFy, container, close, onExportComplete }: ExportDrawerProps) {
  const { role, mobile, demo, fy: sessionFy } = useMockSession();
  const trigger = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement),
  );

  // 5-Step Workflow progress state
  const [step, setStep] = useState<ExportStep>("scope");

  // Step 1: Scope configuration
  const [selectedFy, setSelectedFy] = useState<string>(initialFy || sessionFy || "FY 2026-27");
  const [scopeType, setScopeType] = useState<ExportScopeType>("all");
  const [format, setFormat] = useState<ExportFormat>("excel");

  // Workflow control state
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  // Result state
  const [generatedTicket, setGeneratedTicket] = useState<{
    ticket: string;
    ticket_hash: string;
    expires_in: number;
  } | null>(null);
  const [generatedBlob, setGeneratedBlob] = useState<{
    blob: Blob;
    filename: string;
  } | null>(null);

  // Dynamic role re-verification
  const permissions = getExportPermissions(role);
  const isAuthorized = permissions.allowed;

  // Compile export dataset matching active scope
  const allFyRows = useMemo(() => {
    return compileExportRows(demo.invoices, selectedFy);
  }, [demo.invoices, selectedFy]);

  const scopedRows = useMemo(() => {
    if (scopeType === "issued") {
      return allFyRows.filter(
        (r) => Boolean(r["Invoice Number"]?.trim()) && r["Status"] !== "CANCELLED",
      );
    }
    if (scopeType === "outstanding") {
      return allFyRows.filter(
        (r) => r["Balance Outstanding (₹)"] > 0 && r["Status"] !== "CANCELLED",
      );
    }
    return allFyRows;
  }, [allFyRows, scopeType]);

  const totals = useMemo(() => calculateExportTotals(scopedRows), [scopedRows]);

  // Handle escape / close request
  function requestClose() {
    if (pending) return;
    if (dirty && step !== "result") {
      setDiscard(true);
    } else {
      close();
    }
  }

  // Step 4 -> 5: Generate Export simulation & ticket issuance
  async function handleConfirmAndGenerate() {
    if (!isAuthorized) return;
    setPending(true);

    try {
      // 1. Simulate single-use 5-minute ticket issuance matching POST /api/export/token
      const ticketInfo = ticketManager.createTicket(1, role);
      setGeneratedTicket(ticketInfo);

      // 2. Generate file payload matching requested format
      let artifact: { blob: Blob; filename: string };
      if (format === "excel") {
        artifact = generateExcelBlob(scopedRows, selectedFy);
      } else {
        const csvResult = generateDemoCsv(scopedRows, selectedFy, {
          includeDemoBanner: true,
          formatCurrency: true,
        });
        artifact = { blob: csvResult.blob, filename: csvResult.filename };
      }

      setGeneratedBlob(artifact);
      setStep("result");

      if (onExportComplete) {
        onExportComplete({
          filename: artifact.filename,
          format,
          recordCount: scopedRows.length,
          ticket: ticketInfo.ticket,
          ticketHash: ticketInfo.ticket_hash,
          totals,
        });
      }
    } finally {
      setPending(false);
    }
  }

  // Step 5: Trigger download
  function handleDownload() {
    if (!generatedBlob || !generatedTicket) return;
    // Consume single-use ticket simulation
    const consumption = ticketManager.consumeTicket(generatedTicket.ticket);
    if (!consumption.success) {
      alert(`Export Ticket Error: ${consumption.error}`);
      return;
    }

    triggerFileDownload(generatedBlob.blob, generatedBlob.filename);
    setDownloadTriggered(true);
  }

  return (
    <Dialog.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal container={mobile ? container : undefined}>
        <Dialog.Overlay
          className="cf-overlay"
          style={mobile ? undefined : { top: 48, zIndex: 44 }}
        />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          style={mobile ? undefined : { top: 48, height: "calc(100dvh - 48px)", zIndex: 45 }}
          aria-describedby="export-drawer-description"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onInteractOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(".cf-review-bar")) {
              return;
            }
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(".cf-review-bar")) {
              return;
            }
            event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <header className="cf-drawer-header">
            <div>
              <span className="cf-kicker">DATA EXPORT & RECONCILIATION</span>
              <Dialog.Title>
                {step === "result" ? "Export Ready for Download" : "Generate Financial Export"}
              </Dialog.Title>
              <Dialog.Description id="export-drawer-description">
                {step === "scope"
                  ? "Step 1 of 5: Select financial year scope, filter dataset, and choose format."
                  : step === "preview"
                    ? "Step 2 of 5: Inspect sample records and count matching scope."
                    : step === "review"
                      ? "Step 3 of 5: Review 17 authoritative backend columns and financial totals."
                      : step === "confirm"
                        ? "Step 4 of 5: Confirm pre-flight security checks, ticket simulation & role access."
                        : "Step 5 of 5: Download generated file and review ticket lifecycle."}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close export drawer"
              disabled={pending}
              onClick={requestClose}
            >
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body" style={{ overflowX: "hidden" }}>
            {/* 5-Step Workflow Progress Bar */}
            <div
              className="cf-demo-progress"
              style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
              aria-label="Export workflow progress"
            >
              {["Scope", "Preview", "Review", "Confirm", "Result"].map((label) => (
                <span key={label} aria-current={label.toLowerCase() === step ? "step" : undefined}>
                  {label}
                </span>
              ))}
            </div>

            {/* Dynamic Role Permission Denial Alert Banner */}
            {!isAuthorized && (
              <div
                className="cf-denial-banner"
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  backgroundColor: "color-mix(in oklch, var(--destructive) 10%, var(--card))",
                  color: "var(--destructive)",
                  borderRadius: 6,
                  border: "1px solid var(--destructive)",
                  margin: "16px 0",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <ShieldAlert size={18} style={{ flexShrink: 0 }} />
                <span>
                  Permission Notice: Simulated role changed to {role}. Only Admin and Finance roles
                  have full export generation access. Sales and Viewer roles have view-only preview
                  access.
                </span>
              </div>
            )}

            {/* STEP 1: SELECT SCOPE */}
            {step === "scope" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <FormSection title="1. Financial Year Scope">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {["FY 2026-27", "FY 2025-26", "FY 2024-25", "ALL"].map((fyOption) => (
                      <Button
                        key={fyOption}
                        type="button"
                        variant={selectedFy === fyOption ? "default" : "outline"}
                        onClick={() => {
                          setSelectedFy(fyOption);
                          setDirty(true);
                        }}
                      >
                        {fyOption}
                      </Button>
                    ))}
                  </div>
                </FormSection>

                <FormSection title="2. Dataset Filter Scope">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      <input
                        type="radio"
                        name="scopeType"
                        checked={scopeType === "all"}
                        onChange={() => {
                          setScopeType("all");
                          setDirty(true);
                        }}
                      />
                      <span>
                        <strong>All FY Records</strong> — Includes commercial invoices and unbilled
                        draft purchase orders.
                      </span>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      <input
                        type="radio"
                        name="scopeType"
                        checked={scopeType === "issued"}
                        onChange={() => {
                          setScopeType("issued");
                          setDirty(true);
                        }}
                      />
                      <span>
                        <strong>Issued Invoices Only</strong> — Excludes unbilled orders and
                        cancelled records.
                      </span>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      <input
                        type="radio"
                        name="scopeType"
                        checked={scopeType === "outstanding"}
                        onChange={() => {
                          setScopeType("outstanding");
                          setDirty(true);
                        }}
                      />
                      <span>
                        <strong>Open Receivables Only</strong> — Invoices with remaining balance
                        &gt; ₹0.
                      </span>
                    </label>
                  </div>
                </FormSection>

                <FormSection title="3. Export Format Selection">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setFormat("excel");
                        setDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setFormat("excel");
                          setDirty(true);
                        }
                      }}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border:
                          format === "excel"
                            ? "2px solid var(--primary)"
                            : "1px solid var(--border)",
                        backgroundColor:
                          format === "excel"
                            ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                            : "var(--card)",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
                      >
                        <FileSpreadsheet size={20} color="var(--primary)" />
                        <strong>Excel Workbook (.xlsx)</strong>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
                        Authoritative backend format with 17 columns, #1F4E79 header fill, Calibri
                        font, and currency number format.
                      </p>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setFormat("csv");
                        setDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setFormat("csv");
                          setDirty(true);
                        }
                      }}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border:
                          format === "csv" ? "2px solid var(--primary)" : "1px solid var(--border)",
                        backgroundColor:
                          format === "csv"
                            ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                            : "var(--card)",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
                      >
                        <FileText size={20} color="var(--primary)" />
                        <strong>Demo CSV Export (.csv)</strong>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
                        Client-side simulation labeled &ldquo;Demo CSV Export&rdquo; with formula
                        injection sanitization.
                      </p>
                    </div>
                  </div>
                </FormSection>

                <div className="cf-drawer-footer" style={{ marginTop: 10 }}>
                  <Button variant="outline" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setStep("preview");
                      setDirty(true);
                    }}
                  >
                    <span>Continue to Preview</span>
                    <ArrowRight size={16} style={{ marginLeft: 6 }} />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: PREVIEW DATASET & COUNT */}
            {step === "preview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    backgroundColor: "var(--muted)",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--muted-foreground)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Matched Scope
                    </span>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {selectedFy} · {scopedRows.length}{" "}
                      {scopedRows.length === 1 ? "Record" : "Records"} Found
                    </div>
                  </div>
                  <Badge variant="outline">
                    {format === "excel" ? "Excel (.xlsx)" : "Demo CSV"}
                  </Badge>
                </div>

                {/* Financial Scope Totals (CF6-01: Split Recognized AR vs Unbilled) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: 10,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                      Recognized AR
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                      {formatCurrency(totals.recognizedOutstanding)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                      Unbilled Orders
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                      {formatCurrency(totals.unbilledOutstanding)}
                    </div>
                  </div>
                  {totals.unbilledOutstanding > 0 && (
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                        Combined Raw Balance
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                        {formatCurrency(totals.totalOutstanding)}
                      </div>
                    </div>
                  )}
                </div>

                <FormSection title="Sample Dataset Rows Preview">
                  {/* Desktop Table View */}
                  <div className="cf-table-container">
                    <table
                      className="cf-table"
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                        textAlign: "left",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "var(--muted)",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <th style={{ padding: "8px 12px" }}>Invoice #</th>
                          <th style={{ padding: "8px 12px" }}>Customer</th>
                          <th style={{ padding: "8px 12px" }}>PO Number</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>
                            Total Invoiced
                          </th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Outstanding</th>
                          <th style={{ padding: "8px 12px" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedRows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                              {r["Invoice Number"] || "—"}
                            </td>
                            <td style={{ padding: "8px 12px" }}>{r["Customer Name"]}</td>
                            <td style={{ padding: "8px 12px" }}>{r["PO Number"]}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              {formatCurrency(r["Total Invoiced (₹)"])}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              {formatCurrency(r["Balance Outstanding (₹)"])}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <span className={`cf-status ${r["Status"].toLowerCase()}`}>
                                {r["Status"]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Responsive Cards View (CF6-03: Zero horizontal overflow) */}
                  <div className="cf-mobile-cards">
                    {scopedRows.map((r, i) => (
                      <article
                        key={i}
                        className="cf-record-card"
                        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
                      >
                        <header
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <strong style={{ fontSize: 13 }}>
                            {r["Invoice Number"] || r["PO Number"] || "—"}
                          </strong>
                          <span className={`cf-status ${r["Status"].toLowerCase()}`}>
                            {r["Status"]}
                          </span>
                        </header>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{r["Customer Name"]}</div>
                        <dl
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "6px 10px",
                            fontSize: 11,
                            margin: 0,
                          }}
                        >
                          <div>
                            <dt style={{ color: "var(--muted-foreground)" }}>PO Number</dt>
                            <dd style={{ margin: 0, fontWeight: 500 }}>{r["PO Number"]}</dd>
                          </div>
                          <div>
                            <dt style={{ color: "var(--muted-foreground)" }}>FY</dt>
                            <dd style={{ margin: 0, fontWeight: 500 }}>{r["FY"]}</dd>
                          </div>
                          <div>
                            <dt style={{ color: "var(--muted-foreground)" }}>Total Invoiced</dt>
                            <dd style={{ margin: 0, fontWeight: 600 }}>
                              {formatCurrency(r["Total Invoiced (₹)"])}
                            </dd>
                          </div>
                          <div>
                            <dt style={{ color: "var(--muted-foreground)" }}>Outstanding</dt>
                            <dd style={{ margin: 0, fontWeight: 600 }}>
                              {formatCurrency(r["Balance Outstanding (₹)"])}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </FormSection>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted-foreground)",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <Info size={14} />
                  <span>
                    Preview shows selected subset. All 17 authoritative backend columns will be
                    generated.
                  </span>
                </div>

                <div className="cf-drawer-footer" style={{ marginTop: 10 }}>
                  <Button variant="outline" onClick={() => setStep("scope")}>
                    <ArrowLeft size={16} style={{ marginRight: 6 }} />
                    <span>Back to Scope</span>
                  </Button>
                  <Button onClick={() => setStep("review")}>
                    <span>Review Columns & Totals</span>
                    <ArrowRight size={16} style={{ marginLeft: 6 }} />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: REVIEW COLUMNS & TOTALS */}
            {step === "review" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <FormSection title="1. Summary Financial Totals (Reconciliation)">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: 12,
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        Gross Invoiced
                      </span>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                        {formatCurrency(totals.totalInvoiced)}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 12,
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        Total Settled (Cash+TDS)
                      </span>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                        {formatCurrency(totals.totalSettled)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
                        Cash: {formatCurrency(totals.totalCash)} · TDS:{" "}
                        {formatCurrency(totals.totalTds)}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 12,
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        Balance Outstanding
                      </span>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                        {formatCurrency(totals.recognizedOutstanding)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
                        Recognized Accounts Receivable
                      </div>
                    </div>
                    <div
                      style={{
                        padding: 12,
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        Unbilled Orders (Gross)
                      </span>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                        {formatCurrency(totals.unbilledOutstanding)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
                        Pending Commercial Invoice
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
                    Note: Recognized Accounts Receivable is {formatCurrency(totals.recognizedOutstanding)}.
                    Unbilled Orders (Gross) commitments ({formatCurrency(totals.unbilledOutstanding)}) are
                    tracked separately and excluded from invoiced revenue; cancelled invoices zero out outstanding receivables.
                    {totals.unbilledOutstanding > 0 && (
                      <> Combined Raw Export Balance: {formatCurrency(totals.totalOutstanding)}.</>
                    )}
                  </div>
                </FormSection>

                <FormSection title="2. Authoritative 17 Columns Checklist">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    {AUTHORITATIVE_COLUMNS.map((col, idx) => {
                      const isCurrency = (CURRENCY_COLUMN_INDICES as readonly number[]).includes(
                        idx,
                      );
                      return (
                        <div
                          key={col}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            backgroundColor: "var(--muted)",
                            borderRadius: 4,
                          }}
                        >
                          <Check size={14} color="var(--primary)" />
                          <span>
                            <strong>{idx + 1}.</strong> {col}
                            {isCurrency && (
                              <span style={{ color: "var(--muted-foreground)", marginLeft: 4 }}>
                                (₹)
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </FormSection>

                <div className="cf-drawer-footer" style={{ marginTop: 10 }}>
                  <Button variant="outline" onClick={() => setStep("preview")}>
                    <ArrowLeft size={16} style={{ marginRight: 6 }} />
                    <span>Back to Preview</span>
                  </Button>
                  <Button onClick={() => setStep("confirm")}>
                    <span>Proceed to Confirmation</span>
                    <ArrowRight size={16} style={{ marginLeft: 6 }} />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 4: CONFIRM / GENERATE */}
            {step === "confirm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <FormSection title="Pre-Flight Security & Integrity Checks">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle2 size={16} color="var(--primary)" />
                      <span>
                        <strong>17-Column Schema:</strong> Strictly conforms to backend{" "}
                        <code>v_invoice_summary</code> contract.
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle2 size={16} color="var(--primary)" />
                      <span>
                        <strong>CWE-1236 Formula Sanitization:</strong> Prepending &apos; to values
                        starting with =, +, -, @, \t, \r.
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle2 size={16} color="var(--primary)" />
                      <span>
                        <strong>Zero Credential Exposure:</strong> User passwords, hashes, salts,
                        and session tokens strictly stripped.
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle2 size={16} color="var(--primary)" />
                      <span>
                        <strong>Ticket Lifecycle Simulation:</strong> 5-minute single-use ticket
                        simulation (TTL 300s).
                      </span>
                    </div>
                    {format === "excel" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle2 size={16} color="var(--primary)" />
                        <span>
                          <strong>Authoritative Styling:</strong> Header fill #1F4E79, Calibri 11pt,
                          currency format {EXCEL_CURRENCY_FORMAT}.
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle2 size={16} color="var(--primary)" />
                        <span>
                          <strong>Demo CSV Labeling:</strong> Explicitly marked as client-side
                          &ldquo;{DEMO_CSV_LABEL}&rdquo;.
                        </span>
                      </div>
                    )}
                  </div>
                </FormSection>

                <FormSection title="Role Authorization Check">
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 6,
                      backgroundColor: isAuthorized
                        ? "color-mix(in oklch, var(--primary) 10%, var(--card))"
                        : "color-mix(in oklch, var(--destructive) 10%, var(--card))",
                      border: isAuthorized
                        ? "1px solid var(--primary)"
                        : "1px solid var(--destructive)",
                      fontSize: 13,
                    }}
                  >
                    <strong>Acting Role: {role.toUpperCase()}</strong>
                    <p
                      style={{
                        margin: "4px 0 0",
                        color: isAuthorized ? "var(--foreground)" : "var(--destructive)",
                      }}
                    >
                      {isAuthorized
                        ? "Full export generation permitted (Admin & Finance roles)."
                        : "Restricted: Role permissions do not permit full export generation. Only Admin & Finance roles can generate export files."}
                    </p>
                  </div>
                </FormSection>

                <div className="cf-drawer-footer" style={{ marginTop: 10 }}>
                  <Button variant="outline" disabled={pending} onClick={() => setStep("review")}>
                    <ArrowLeft size={16} style={{ marginRight: 6 }} />
                    <span>Back to Review</span>
                  </Button>
                  <Button disabled={!isAuthorized || pending} onClick={handleConfirmAndGenerate}>
                    {pending
                      ? "Generating..."
                      : `Confirm & Generate ${format === "excel" ? "Excel" : "CSV"} Export`}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 5: DOWNLOAD / RESULT */}
            {step === "result" && generatedBlob && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "16px",
                    borderRadius: 8,
                    backgroundColor: "color-mix(in oklch, var(--primary) 10%, var(--card))",
                    border: "1px solid var(--primary)",
                  }}
                >
                  <CheckCircle2 size={24} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                      Export Generated Successfully
                    </h3>
                    <p
                      style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}
                    >
                      {format === "excel"
                        ? "Excel workbook prepared with authoritative 17 columns and styling."
                        : "Demo CSV export prepared with formula injection sanitization."}
                    </p>
                  </div>
                </div>

                <FormSection title="Artifact Details">
                  <dl
                    className="cf-kv"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Filename</dt>
                      <dd style={{ fontWeight: 600, wordBreak: "break-all" }}>
                        {generatedBlob.filename}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Records Exported</dt>
                      <dd style={{ fontWeight: 600 }}>{scopedRows.length} rows</dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Financial Year</dt>
                      <dd style={{ fontWeight: 600 }}>{selectedFy}</dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Total Invoiced Gross</dt>
                      <dd style={{ fontWeight: 600 }}>{formatCurrency(totals.totalInvoiced)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Recognized AR</dt>
                      <dd style={{ fontWeight: 600 }}>
                        {formatCurrency(totals.recognizedOutstanding)}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--muted-foreground)" }}>Unbilled Orders</dt>
                      <dd style={{ fontWeight: 600 }}>
                        {formatCurrency(totals.unbilledOutstanding)}
                      </dd>
                    </div>
                  </dl>
                </FormSection>

                {generatedTicket && (
                  <FormSection title="Single-Use Ticket Lifecycle">
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted-foreground)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div>
                        <strong>Ticket Token:</strong>{" "}
                        <code>{generatedTicket.ticket.slice(0, 16)}...</code> (32-byte URL-safe)
                      </div>
                      <div>
                        <strong>SHA-256 Hash:</strong>{" "}
                        <code>{generatedTicket.ticket_hash.slice(0, 24)}...</code>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--foreground)",
                        }}
                      >
                        <Clock size={14} />
                        <span>Ticket expires in 300 seconds (5 minutes). Single-use only.</span>
                      </div>
                    </div>
                  </FormSection>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Button size="lg" style={{ width: "100%" }} onClick={handleDownload}>
                    <Download size={18} style={{ marginRight: 8 }} />
                    <span>{downloadTriggered ? "Download Again" : "Download Export File"}</span>
                  </Button>

                  <Button variant="outline" style={{ width: "100%" }} onClick={close}>
                    Done · Return to Workspace
                  </Button>
                </div>
              </div>
            )}

            {/* Discard confirmation prompt */}
            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved export parameters?</p>
                <Button variant="outline" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button
                  onClick={() => {
                    setDiscard(false);
                    close();
                  }}
                >
                  Discard inputs
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
