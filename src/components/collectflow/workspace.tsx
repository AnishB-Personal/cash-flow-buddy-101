import { apiClient } from "@/lib/api-client";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  LayoutDashboard,
  Gauge,
  Layers,
  ReceiptText,
  Wallet,
  Users,
  Target,
  TrendingUp,
  FileText,
  Settings2,
  Menu,
  X,
  Search,
  Plus,
  Monitor,
  Smartphone,
  ChevronRight,
  LockKeyhole,
  Bell,
  RefreshCw,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { data, type Invoice } from "@/data/collectflow";
import { type Role, type Screen, canWrite, selectRecords, agingAsOf } from "@/data/records";
import { FilterChoice, EmptyState } from "./controls";
import { FinancialDashboard } from "./dashboard";
import { RecordList } from "./record-list";
import { RecordDrawer } from "./record-drawer";
import { useMockSession } from "./session";
import { DemoControls } from "./demo-controls";
import { CustomerDirectory, FinancialReferences } from "./reference-workflows";
import { OrderWorkflowModal, type OrderOperation } from "./order-workflows";
import {
  orderForm,
  orderCreateExample,
  orderEditExample,
  orderConvertExample,
} from "@/data/orders";
import { PaymentsLedger, type PaymentItem } from "./payments-ledger";
import { RecordPaymentDrawer, PaymentCorrectionDrawer } from "./payment-workflows";
import { CancelInvoiceDrawer } from "./cancel-workflow";
import { TargetsScreen } from "./targets-screen";
import { PerformanceAnalytics } from "./performance-analytics";
import { UsersScreen } from "./users-screen";
import { ReportsHub } from "./reports-hub";
import { ExportDrawer } from "./export-drawer";
const groups = [
  {
    name: "OVERVIEW",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "AR Aging", icon: Gauge },
    ],
  },
  {
    name: "REVENUE OPERATIONS",
    items: [
      { name: "Orders", icon: Layers },
      { name: "Invoices", icon: ReceiptText },
      { name: "Payments", icon: Wallet },
      { name: "Customers", icon: Users },
    ],
  },
  {
    name: "PERFORMANCE",
    items: [
      { name: "Sales Targets", icon: Target },
      { name: "Performance Analytics", icon: TrendingUp },
      { name: "Reports", icon: FileText },
    ],
  },
  {
    name: "ADMINISTRATION",
    items: [
      { name: "Users & Roles", icon: Users },
      { name: "Settings", icon: Settings2 },
    ],
  },
];
const implemented = [
  "Dashboard",
  "AR Aging",
  "Orders",
  "Invoices",
  "Payments",
  "Customers",
  "Settings",
  "Sales Targets",
  "Performance Analytics",
  "Users & Roles",
  "Reports",
];
const modules: Record<string, string> = {
  Payments: "Payment registration, cash/TDS breakdown, remittance details and the payment ledger.",
  Customers: "Customer creation, contact information, GST details and customer history.",
  "Sales Targets":
    "Annual, half-yearly, quarterly and monthly sales targets and executive attainment.",
  "Performance Analytics":
    "Executive quota attainment, sub-period breakdowns and performance analytics.",
  Reports:
    "Financial reconciliation reports, payments ledger, customer exposure, executive quota attainment, AR aging, and XLSX export flow.",
  "Users & Roles":
    "User administration and the existing admin, finance, sales and viewer permissions.",
  Settings: "Financial-year masters, GST/TDS rates and documented application settings.",
};
export function Workspace({ initial = "Dashboard" }: { initial?: Screen }) {
  const routerNavigate = useNavigate();
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [deferredPage, setDeferredPage] = useState<string | null>(null);
  const page = deferredPage ?? initial;
  const [targetTab, setTargetTab] = useState<"Targets Quotas" | "Performance Analytics">(
    "Targets Quotas",
  );
  const { fy, setFy, role, setRole, demo, revision, references, mobile, setMobile } =
    useMockSession();
  const isLive = apiClient.getMode() === "live";
  const currentUser = apiClient.getCurrentUser();
  const activeRole = (isLive && currentUser?.role) ? currentUser.role : role;

  function handleLogout() {
    apiClient.logout();
    void routerNavigate({ to: "/login" });
  }

  const [menu, setMenu] = useState(false);
  const [state, setState] = useState("Live");
  const [bucket, setBucket] = useState<string | null>(null);
  const [record, setRecord] = useState<Invoice | null>(null);
  const [kind, setKind] = useState<"order" | "invoice">("invoice");
  const [notice, setNotice] = useState<string | null>(null);
  const [global, setGlobal] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recent, setRecent] = useState("Invoices");
  const searchTrigger = useRef<HTMLElement | null>(null);
  const [orderOp, setOrderOp] = useState<OrderOperation | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [cancelInvoice, setCancelInvoice] = useState<Invoice | null>(null);
  const [correctionPayment, setCorrectionPayment] = useState<PaymentItem | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const isModalOpen = Boolean(
    record ||
    orderOp ||
    paymentInvoice ||
    cancelInvoice ||
    correctionPayment ||
    searchOpen ||
    exportOpen,
  );
  useEffect(() => {
    if (!isModalOpen) return undefined;
    if (mobile && frame) {
      frame.scrollTop = 0;
      return undefined;
    }
    if (!mobile) {
      document.body.classList.add("cf-scroll-locked");
      return () => {
        document.body.classList.remove("cf-scroll-locked");
      };
    }
    return undefined;
  }, [isModalOpen, mobile, frame]);
  const denied = state === "Permission denied";
  function navigate(name: string) {
    setMenu(false);
    setBucket(null);
    setState("Live");
    if (name === "Dashboard") {
      setDeferredPage(null);
      void routerNavigate({ to: "/" });
    } else if (name === "Orders") {
      setDeferredPage(null);
      void routerNavigate({ to: "/orders" });
    } else if (name === "Invoices") {
      setDeferredPage(null);
      void routerNavigate({ to: "/invoices" });
    } else if (name === "Payments") {
      setDeferredPage(null);
      void routerNavigate({ to: "/payments" });
    } else if (name === "AR Aging") {
      setDeferredPage(null);
      void routerNavigate({ to: "/ar-aging" });
    } else if (name === "Customers") {
      setDeferredPage(null);
      void routerNavigate({ to: "/customers" });
    } else if (name === "Settings") {
      setDeferredPage(null);
      void routerNavigate({ to: "/settings" });
    } else if (name === "Sales Targets") {
      setDeferredPage(null);
      void routerNavigate({ to: "/sales-targets" });
    } else if (name === "Performance Analytics") {
      setDeferredPage(null);
      void routerNavigate({ to: "/performance-analytics" });
    } else if (name === "Users & Roles") {
      setDeferredPage(null);
      void routerNavigate({ to: "/users" });
    } else if (name === "Reports") {
      setDeferredPage(null);
      void routerNavigate({ to: "/reports" });
    } else setDeferredPage(name);
  }
  function open(row: Invoice, type: "order" | "invoice") {
    setKind(type);
    setRecord(row);
    setSearchOpen(false);
  }
  function unavailable(action: string) {
    setNotice(
      `${action} is unavailable — backend integration is not connected. No records have changed.`,
    );
  }
  function startRecordPayment(row: Invoice) {
    setRecord(null);
    setPaymentInvoice(row);
  }
  function startCancelInvoice(row: Invoice) {
    setRecord(null);
    setCancelInvoice(row);
  }
  function startCreateOrder() {
    setRecord(null);
    setOrderOp({
      action: "order-create",
      target: "",
      label: "Create Purchase Order",
      values: orderForm(undefined, "order-create", fy),
      example: orderCreateExample,
    });
  }
  function startEditOrder(row: Invoice) {
    setRecord(null);
    setOrderOp({
      action: "order-edit",
      target: String(row.id),
      label: row.invoice_number ? "Edit invoice metadata" : "Edit Order",
      values: orderForm(row, "order-edit", fy),
      example: orderEditExample(row),
      record: row,
    });
  }
  function startConvertOrder(row: Invoice) {
    setRecord(null);
    setOrderOp({
      action: "order-convert",
      target: String(row.id),
      label: "Convert to Invoice",
      values: orderForm(row, "order-convert", fy),
      example: orderConvertExample,
      record: row,
    });
  }
  function startDeleteOrder(row: Invoice) {
    setRecord(null);
    setOrderOp({
      action: "order-delete",
      target: String(row.id),
      label: "Delete Order",
      values: {},
      example: {},
      record: row,
    });
  }
  const searchRows = selectRecords(
    "Orders",
    fy,
    role,
    "",
    "All statuses",
    "All executives",
    null,
    undefined,
    demo.invoices,
  ).filter((row) =>
    `${row.customer_name} ${row.po_number} ${row.invoice_number ?? ""}`
      .toLowerCase()
      .includes(global.toLowerCase()),
  );
  return (
    <div className={`cf-app ${mobile ? "cf-preview-mobile" : ""}`}>
      <div className="cf-review-bar">
        <span>
          <i />
          {isLive ? "Live Sandbox Workspace" : "Mock workspace"}
        </span>
        <div>
          {!isLive && (
          <FilterChoice
            label="Preview role"
            value={role}
            options={["finance", "admin", "sales", "viewer"]}
            onChange={(value) => {
              setRole(value as Role);
              setRecord(null);
              setSearchOpen(false);
            }}
          />
        )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Desktop preview"
            title="Desktop preview"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mobile preview"
            title="Mobile preview"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone />
          </Button>
          <Link to="/design-comparison">
            Design reference <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div className="cf-frame" ref={setFrame}>
        <div className={`cf-shell ${isModalOpen ? "cf-scroll-locked" : ""}`}>
          <aside className={`cf-sidebar ${menu ? "cf-menu-open" : ""}`}>
            <header>
              <span className="cf-brand-mark">
                <ArrowUpRight />
              </span>
              <strong>CollectFlow</strong>
              <Button
                variant="ghost"
                size="icon"
                className="cf-mobile-close"
                aria-label="Close navigation"
                onClick={() => setMenu(false)}
              >
                <X />
              </Button>
            </header>
            <div className="cf-workspace-label">
              <span className="cf-avatar">AK</span>
              <div>
                Acme workspace<small>Financial operations</small>
              </div>
            </div>
            <nav aria-label="Main navigation">
              {groups.map((group) => (
                <section key={group.name}>
                  <h2>{group.name}</h2>
                  {group.items.map((item) => (
                    <Button
                      variant="ghost"
                      key={item.name}
                      className={`cf-nav-item ${page === item.name ? "active" : ""}`}
                      aria-current={page === item.name ? "page" : undefined}
                      title={item.name}
                      onClick={() => navigate(item.name)}
                    >
                      <item.icon size={19} />
                      <span>{item.name}</span>
                      {!implemented.includes(item.name) && (
                        <span
                          className="cf-deferred-dot"
                          aria-label="Not implemented in this phase"
                        />
                      )}
                      {page === item.name && <ChevronRight size={15} />}
                    </Button>
                  ))}
                </section>
              ))}
            </nav>
            <footer>
              <div className="cf-user">
                <span className="cf-avatar">
                  {role === "sales"
                    ? "NR"
                    : role === "viewer"
                      ? "KR"
                      : role === "admin"
                        ? "SA"
                        : "AK"}
                </span>
                <div>
                  <strong>
                    {role === "sales"
                      ? "Neha Rao"
                      : role === "viewer"
                        ? "Kavita Rao"
                        : role === "admin"
                          ? "System Administrator"
                          : "Aisha Khan"}
                  </strong>
                  <small>{(activeRole).charAt(0).toUpperCase() + (activeRole).slice(1)} · {isLive ? "Live sandbox" : "mock session"}</small>
                </div>
              </div>
              {isLive && (
                <div style={{ marginTop: "8px" }}>
                  <Button variant="outline" size="sm" style={{ width: "100%" }} onClick={handleLogout}>
                    Sign out
                  </Button>
                </div>
              )}
            </footer>
          </aside>
          <div className="cf-main">
            <header className="cf-topbar">
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle navigation"
                  onClick={() => setMenu(!menu)}
                >
                  <Menu />
                </Button>
                <span>Workspace</span>
                <ChevronRight size={14} />
                <strong>{page}</strong>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="cf-global-trigger"
                  aria-label="Search all records"
                  title="Search all records"
                  onClick={() => {
                    if (typeof document !== "undefined")
                      searchTrigger.current = document.activeElement as HTMLElement;
                    setSearchOpen(true);
                  }}
                >
                  <Search size={17} />
                  <span>Search all records</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Notifications"
                  title="Notifications"
                  onClick={() => setNotice("No notifications in this mock workspace.")}
                >
                  <Bell />
                </Button>
              </div>
            </header>
            <main className="cf-content">
              {!isLive && <DemoControls container={mobile ? frame : undefined} />}
              <header className="cf-page-heading">
                <div>
                  <span className="cf-kicker">
                    {page === "Dashboard" ? "WELCOME BACK" : "FINANCIAL OPERATIONS"}
                  </span>
                  <h1>{page === "Dashboard" ? "Business overview" : page}</h1>
                  <p>
                    {page === "Dashboard"
                      ? "Your financial position, clearly in view."
                      : page === "Orders"
                        ? "Purchase orders and billing readiness."
                        : page === "Invoices"
                          ? "Issued invoices, settlements and receivables."
                          : page === "Payments"
                            ? "Payment records, cash/TDS breakdown and remittance ledger."
                            : page === "AR Aging"
                              ? "Outstanding issued invoices by aging category."
                              : page === "Customers"
                                ? "Billing contacts and supplied customer history."
                                : page === "Settings"
                                  ? "Financial years and GST/TDS references."
                                  : page === "Sales Targets"
                                    ? "Annual, half-yearly, quarterly and monthly sales targets and executive attainment."
                                    : page === "Performance Analytics"
                                      ? "Target attainment, sub-period breakdown, and executive leaderboard analytics."
                                      : page === "Users & Roles"
                                        ? "User directory and role management."
                                        : page === "Reports"
                                          ? "Financial reports, reconciliations, executive quotas, and export workflows."
                                          : "Retained for a future approved phase."}
                  </p>
                </div>
                <div className="cf-heading-actions">
                  <FilterChoice
                    label="Financial year"
                    value={fy}
                    options={references.years.map((year) => year.code)}
                    onChange={setFy}
                  />
                  {page === "Orders" && canWrite(role) && (
                    <Button onClick={startCreateOrder}>
                      <Plus size={17} />
                      New Order
                    </Button>
                  )}
                </div>
              </header>
              <div className="cf-context">
                <span>
                  <i />
                  {fy} <span>·</span> Indian Rupee (INR)
                </span>
                <div>
                  <FilterChoice
                    label="Preview state"
                    value={state}
                    options={["Live", "Loading", "Empty", "Error", "Permission denied"]}
                    onChange={setState}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Refresh records"
                    title="Refresh records"
                    onClick={() => {
                      setState("Loading");
                      setTimeout(() => setState("Live"), 500);
                    }}
                  >
                    <RefreshCw size={16} />
                  </Button>
                </div>
              </div>
              {denied ? (
                <EmptyState type="permission" />
              ) : state === "Loading" ? (
                <div className="cf-loading" role="status" aria-label="Loading financial records">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div key={index} />
                  ))}
                </div>
              ) : state === "Error" ? (
                <EmptyState type="error" onReset={() => setState("Live")} />
              ) : !implemented.includes(page) ? (
                <section className="cf-deferred">
                  <EmptyState type="deferred" />
                  <h3>{page}</h3>
                  <p>{modules[page]}</p>
                  <span>Preserved in scope · no production integration</span>
                </section>
              ) : (
                <>
                  {page === "Customers" && (
                    <CustomerDirectory
                      container={mobile ? frame : undefined}
                      empty={state === "Empty"}
                      openRecord={open}
                    />
                  )}
                  {page === "Settings" && (
                    <FinancialReferences
                      container={mobile ? frame : undefined}
                      empty={state === "Empty"}
                    />
                  )}
                  {page === "Payments" && (
                    <PaymentsLedger
                      records={demo.invoices}
                      fy={fy}
                      role={role}
                      empty={state === "Empty"}
                      openInvoice={open}
                      container={mobile ? frame : undefined}
                      unavailable={unavailable}
                      onCorrectPayment={setCorrectionPayment}
                    />
                  )}
                  {page === "Dashboard" && (
                    <>
                      <FinancialDashboard
                        records={demo.invoices}
                        fy={fy}
                        role={role}
                        empty={state === "Empty"}
                        selectAging={(value) => {
                          setBucket(value);
                          setDeferredPage("AR Aging");
                        }}
                        onNavigateTargets={() => navigate("Sales Targets")}
                      />
                      <section className="cf-recent">
                        <header className="cf-section-header">
                          <h2>Recent documents</h2>
                          <div className="cf-segments">
                            {["Invoices", "Orders"].map((value) => (
                              <Button
                                key={value}
                                variant="ghost"
                                aria-pressed={recent === value}
                                onClick={() => setRecent(value)}
                              >
                                {value}
                              </Button>
                            ))}
                          </div>
                        </header>
                        <RecordList
                          records={demo.invoices}
                          key={`${recent}-${fy}-${role}`}
                          screen={recent as Screen}
                          fy={fy}
                          role={role}
                          bucket={null}
                          clearBucket={() => setBucket(null)}
                          open={open}
                          unavailable={unavailable}
                          empty={state === "Empty"}
                          compact
                          onEdit={startEditOrder}
                          onConvert={startConvertOrder}
                          onDelete={startDeleteOrder}
                          onRecordPayment={startRecordPayment}
                          onCancelInvoice={startCancelInvoice}
                        />
                      </section>
                    </>
                  )}
                  {page === "AR Aging" && (
                    <>
                      <div className="cf-aging-context">
                        <Gauge size={20} />
                        <span>
                          {agingAsOf()}
                          <br />
                          Issued receivables only · Unbilled orders are excluded.
                        </span>
                      </div>
                      <RecordList
                        records={demo.invoices}
                        key={`${page}-${fy}-${role}-${bucket}`}
                        screen="AR Aging"
                        fy={fy}
                        role={role}
                        bucket={bucket}
                        clearBucket={() => setBucket(null)}
                        open={open}
                        unavailable={unavailable}
                        empty={state === "Empty"}
                        onEdit={startEditOrder}
                        onConvert={startConvertOrder}
                        onDelete={startDeleteOrder}
                        onRecordPayment={startRecordPayment}
                        onCancelInvoice={startCancelInvoice}
                      />
                    </>
                  )}
                  {(page === "Orders" || page === "Invoices") && (
                    <RecordList
                      records={demo.invoices}
                      key={`${page}-${fy}-${role}`}
                      screen={page}
                      fy={fy}
                      role={role}
                      bucket={null}
                      clearBucket={() => setBucket(null)}
                      open={open}
                      unavailable={unavailable}
                      empty={state === "Empty"}
                      onEdit={startEditOrder}
                      onConvert={startConvertOrder}
                      onDelete={startDeleteOrder}
                      onRecordPayment={startRecordPayment}
                      onCancelInvoice={startCancelInvoice}
                    />
                  )}
                  {page === "Sales Targets" && (
                    <div className="cf-targets-view" data-testid="sales-targets-view">
                      <div
                        style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}
                      >
                        <div
                          className="cf-segments"
                          role="tablist"
                          aria-label="Sales Targets navigation"
                        >
                          {(["Targets Quotas", "Performance Analytics"] as const).map((tab) => (
                            <Button
                              key={tab}
                              variant="ghost"
                              role="tab"
                              aria-selected={targetTab === tab}
                              aria-pressed={targetTab === tab}
                              onClick={() => setTargetTab(tab)}
                              data-testid={`tab-${tab === "Targets Quotas" ? "targets-quotas" : "performance-analytics"}`}
                            >
                              {tab}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {targetTab === "Targets Quotas" ? (
                        <TargetsScreen
                          container={mobile ? frame : undefined}
                          empty={state === "Empty"}
                        />
                      ) : (
                        <PerformanceAnalytics
                          container={mobile ? frame : undefined}
                          empty={state === "Empty"}
                          onNavigateTargets={() => setTargetTab("Targets Quotas")}
                        />
                      )}
                    </div>
                  )}
                  {page === "Performance Analytics" && (
                    <div className="cf-targets-view" data-testid="performance-analytics-view">
                      <PerformanceAnalytics
                        container={mobile ? frame : undefined}
                        empty={state === "Empty"}
                        onNavigateTargets={() => navigate("Sales Targets")}
                      />
                    </div>
                  )}
                  {page === "Users & Roles" && (
                    <UsersScreen container={mobile ? frame : undefined} empty={state === "Empty"} />
                  )}
                  {page === "Reports" && (
                    <ReportsHub
                      container={mobile ? frame : undefined}
                      empty={state === "Empty"}
                      onOpenExport={() => setExportOpen(true)}
                    />
                  )}
                </>
              )}
              <footer className="cf-page-footer">
                <span>CollectFlow · Order-to-cash intelligence</span>
                <span>
                  <LockKeyhole size={13} />
                  Sanitized mock data
                </span>
              </footer>
            </main>
            <nav className="cf-bottom-nav" aria-label="Mobile navigation">
              {[
                { name: "Dashboard", icon: LayoutDashboard },
                { name: "Orders", icon: Layers },
                { name: "Invoices", icon: ReceiptText },
                { name: "Payments", icon: Wallet },
              ].map((item) => (
                <Button
                  variant="ghost"
                  key={item.name}
                  onClick={() => navigate(item.name)}
                  aria-current={page === item.name ? "page" : undefined}
                  className={page === item.name ? "active" : ""}
                >
                  <item.icon size={20} />
                  <span>{item.name}</span>
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setMenu(true)}>
                <Menu size={20} />
                <span>More</span>
              </Button>
            </nav>
          </div>
        </div>
        <RecordDrawer
          key={revision}
          record={record ? (demo.invoices.find((row) => row.id === record.id) ?? null) : null}
          kind={kind}
          role={role}
          close={() => setRecord(null)}
          unavailable={unavailable}
          container={mobile ? frame : undefined}
          onEdit={startEditOrder}
          onConvert={startConvertOrder}
          onDelete={startDeleteOrder}
          onRecordPayment={startRecordPayment}
          onCancelInvoice={startCancelInvoice}
        />
        <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
          <Dialog.Portal container={mobile ? frame : undefined}>
            <Dialog.Overlay className="cf-overlay" />
            <Dialog.Content
              className="cf-app cf-search-dialog"
              onCloseAutoFocus={(event) => {
                if (searchTrigger.current) {
                  event.preventDefault();
                  searchTrigger.current.focus();
                  searchTrigger.current = null;
                }
              }}
            >
              <header>
                <Dialog.Title>Search all records</Dialog.Title>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close global search">
                    <X />
                  </Button>
                </Dialog.Close>
              </header>
              <Dialog.Description>Orders, invoices and customers · {fy}</Dialog.Description>
              <div className="cf-table-search">
                <Search size={18} />
                <Input
                  autoFocus
                  aria-label="Global search"
                  placeholder="Search customer, PO or invoice"
                  value={global}
                  onChange={(event) => setGlobal(event.target.value)}
                />
              </div>
              <div className="cf-search-results">
                {searchRows.map((row) => (
                  <div key={row.id}>
                    <Button variant="ghost" onClick={() => open(row, "order")}>
                      <Layers size={18} />
                      <span>
                        <strong>{row.po_number}</strong>
                        <small>Order · {row.customer_name}</small>
                      </span>
                      <ArrowUpRight size={17} />
                    </Button>
                    {row.invoice_number && (
                      <Button variant="ghost" onClick={() => open(row, "invoice")}>
                        <ReceiptText size={18} />
                        <span>
                          <strong>{row.invoice_number}</strong>
                          <small>Invoice · {row.customer_name}</small>
                        </span>
                        <ArrowUpRight size={17} />
                      </Button>
                    )}
                  </div>
                ))}
                {references.customers
                  .filter((customer) =>
                    customer.billing_name.toLowerCase().includes(global.toLowerCase()),
                  )
                  .map((customer) => (
                    <Button
                      variant="ghost"
                      key={customer.id}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate("Customers");
                      }}
                    >
                      <Users size={18} />
                      <span>
                        <strong>{customer.billing_name}</strong>
                        <small>Customer · {customer.state}</small>
                      </span>
                    </Button>
                  ))}
                {!searchRows.length &&
                  !references.customers.some((customer) =>
                    customer.billing_name.toLowerCase().includes(global.toLowerCase()),
                  ) && <EmptyState />}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        {orderOp && (
          <OrderWorkflowModal
            operation={orderOp}
            container={mobile ? frame : undefined}
            close={() => setOrderOp(null)}
          />
        )}
        {paymentInvoice && (
          <RecordPaymentDrawer
            invoice={paymentInvoice}
            container={mobile ? frame : undefined}
            close={() => setPaymentInvoice(null)}
          />
        )}
        {cancelInvoice && (
          <CancelInvoiceDrawer
            invoice={cancelInvoice}
            container={mobile ? frame : undefined}
            close={() => setCancelInvoice(null)}
          />
        )}
        {correctionPayment && (
          <PaymentCorrectionDrawer
            payment={correctionPayment}
            container={mobile ? frame : undefined}
            close={() => setCorrectionPayment(null)}
          />
        )}
        {exportOpen && (
          <ExportDrawer
            initialFy={fy}
            container={mobile ? frame : undefined}
            close={() => setExportOpen(false)}
          />
        )}
        {notice && (
          <div className="cf-notice" role="status">
            <LockKeyhole size={17} />
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
