import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * CollectFlow Stage 6 — Reports Hub, Authoritative Exports & Comprehensive UAT
 *
 * Requirements covered:
 * 1. Zero unhandled browser console errors via test.afterEach.
 * 2. Multi-viewport verification across 1440px desktop, 768px tablet, 390px mobile, 320px narrow mobile.
 * 3. Reports Hub navigation (direct URL /reports and sidebar under PERFORMANCE).
 * 4. 5 core reports tabs (Invoices & Receivables, Collections Ledger, Customer Exposure, Executive Attainment, AR Aging Breakdown).
 * 5. Live filtering (FY, customer, executive, search) and filter reset.
 * 6. Financial reconciliation and exclusions:
 *    - Invoiced ₹5,31,000, Outstanding ₹3,22,000, Cash ₹2,00,000, TDS ₹9,000, Settled ₹2,09,000.
 *    - Unbilled PO-NEXUS-881 (₹2,95,000 gross) and cancelled INV-2026-041 strictly excluded.
 * 7. 5-step ExportDrawer workflow (Scope -> Preview -> Review -> Confirm -> Result).
 * 8. Authoritative 17 columns checklist, number formatting, openpyxl styling metadata, and CWE-1236 sanitization badges.
 * 9. Format selection: Excel (.xlsx) vs Demo CSV (.csv) with transparent demo labeling.
 * 10. Single-use ticket simulation (SHA-256 hash, 300s TTL).
 * 11. Discard dialog prompt on dirty drawer dismissal.
 * 12. RBAC export authorization: Admin/Finance full access; Sales/Viewer restricted; mid-workflow role switch denial banner.
 * 13. Mobile preview persistence (CF3-05) across /reports navigation.
 * 14. Reset Demo restoration of all 7 invariants, 6 baseline users, and Stage 4 target baselines.
 * 15. Cross-module regression verification across all application routes.
 */

const VIEWPORTS = [
  { width: 1440, height: 900, name: "1440px-desktop" },
  { width: 768, height: 1024, name: "768px-tablet" },
  { width: 390, height: 844, name: "390px-mobile" },
  { width: 320, height: 568, name: "320px-narrow-mobile" },
];

const BASELINE_FINANCIALS = {
  invoiced: "5,31,000",
  cash: "2,00,000",
  tds: "9,000",
  settlements: "2,09,000",
  outstanding: "3,22,000",
  unbilled: "2,95,000",
};

async function restoreBaseline(page: Page) {
  const resetBtn = page.getByRole("button", { name: /Reset Demo/i });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.getByRole("button", { name: "Restore baseline" });
    try {
      await confirmBtn.waitFor({ state: "visible", timeout: 3000 });
      await confirmBtn.click();
      await page.waitForTimeout(400);
    } catch {
      // baseline dialog not triggered
    }
  }
}

async function navigateToReports(page: Page, width: number) {
  if (width >= 768) {
    const navItem = page.locator(".cf-sidebar .cf-nav-item", { hasText: "Reports" });
    await navItem.click();
  } else {
    // Open mobile sidebar via More menu in bottom nav
    const moreBtn = page.locator(".cf-bottom-nav button", { hasText: "More" });
    await moreBtn.click();
    const navItem = page.locator(".cf-sidebar.cf-menu-open .cf-nav-item", { hasText: "Reports" });
    await navItem.click();
  }
  await expect(page).toHaveURL(/\/reports/);
  await expect(page.locator("h1")).toHaveText("Reports");
  await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();
}

async function switchRole(page: Page, role: "admin" | "finance" | "sales" | "viewer") {
  const roleSelector = page.locator('button[aria-label="Preview role"]');
  await roleSelector.click({ force: true });
  await page.getByRole("option", { name: role }).click({ force: true });
  await page.waitForTimeout(300);
}

async function assertAll7BaselineFinancialInvariants(page: Page) {
  // Navigate to Dashboard to inspect financial metrics
  const dashboardItem = page.locator(".cf-nav-item", { hasText: "Dashboard" }).first();
  if (await dashboardItem.isVisible()) {
    await dashboardItem.click();
  } else {
    await page.goto("/", { waitUntil: "networkidle" });
  }
  await expect(page.locator("h1")).toHaveText("Business overview");

  // 1. Invoiced: ₹5,31,000
  const invoiced = page
    .locator(".cf-metric")
    .filter({ hasText: "Total invoiced" })
    .locator("strong");
  await expect(invoiced).toHaveText(`₹${BASELINE_FINANCIALS.invoiced}`);

  // 2. Outstanding: ₹3,22,000
  const outstanding = page
    .locator(".cf-metric")
    .filter({ hasText: "Total outstanding" })
    .locator("strong");
  await expect(outstanding).toHaveText(`₹${BASELINE_FINANCIALS.outstanding}`);

  // 3. Cash: ₹2,00,000
  const cash = page.locator(".cf-metric").filter({ hasText: "Cash collected" }).locator("strong");
  await expect(cash).toHaveText(`₹${BASELINE_FINANCIALS.cash}`);

  // 4. TDS: ₹9,000
  const tds = page.locator(".cf-metric").filter({ hasText: "TDS recognized" }).locator("strong");
  await expect(tds).toHaveText(`₹${BASELINE_FINANCIALS.tds}`);

  // 5. Unbilled: ₹2,95,000
  const unbilled = page
    .locator(".cf-metric")
    .filter({ hasText: "Unbilled orders" })
    .locator("strong");
  await expect(unbilled).toHaveText(`₹${BASELINE_FINANCIALS.unbilled}`);

  // 6. Settlements: ₹2,09,000
  const settlements = page.locator(".cf-revenue footer strong");
  await expect(settlements).toHaveText(`₹${BASELINE_FINANCIALS.settlements}`);

  // 7. Reporting as-of date: 30 April 2026
  const reportingDate = page.locator(".cf-demo-bar");
  await expect(reportingDate).toContainText(/30 Apr(il)? 2026/);
}

test.describe("CollectFlow Stage 6 — Reports Hub & Authoritative Exports E2E Suite", () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") browserErrors.push(`[console.error] ${msg.text()}`);
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`[uncaughtException] ${error.message}`);
    });
  });

  test.afterEach(async () => {
    expect(browserErrors, "Zero unhandled browser console errors").toEqual([]);
  });

  // ─── 1. MULTI-VIEWPORT NAVIGATION, LAYOUT & SCREENSHOTS ───────────────────

  for (const vp of VIEWPORTS) {
    test(`Reports Hub responsive navigation and rendering across ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/", { waitUntil: "networkidle" });
      await restoreBaseline(page);

      // Navigate to Reports via sidebar under PERFORMANCE group
      await navigateToReports(page, vp.width);
      await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();

      // Check responsive layout
      if (vp.width > 600) {
        // Desktop / tablet table layout
        const table = page.locator('[data-testid="invoices-report-table"]');
        await expect(table).toBeVisible();
        await expect(page.locator('[data-testid="invoices-report-cards"]')).not.toBeVisible();
      } else {
        // Mobile cards layout (<=600px)
        const mobileCards = page.locator('[data-testid="invoices-report-cards"]');
        await expect(mobileCards).toBeVisible();
        await expect(page.locator('[data-testid="invoices-report-table"]')).not.toBeVisible();
      }

      // Check horizontal scroll containment for mobile viewports (<=600px)
      if (vp.width <= 600) {
        const scrollInfo = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);
      }

      // Capture required viewport screenshot
      const screenshotName = `s6-reports-${vp.name}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, screenshotName),
        fullPage: false,
      });
    });
  }

  // ─── 2. DIRECT URL NAVIGATION ─────────────────────────────────────────────

  test("Direct URL navigation to /reports loads cleanly with 0 console errors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    await expect(page).toHaveURL(/\/reports/);
    await expect(page.locator("h1")).toHaveText("Reports");
    await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-invoices"]')).toBeVisible();
  });

  // ─── 3. TAB SWITCHING ACROSS ALL 5 REPORTS & FINANCIAL RECONCILIATION ─────

  test("Tab switching across 5 reports reconciles with financial invariants", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // 1. Invoices & Receivables Tab
    const invoicesTab = page.locator('[data-testid="tab-invoices"]');
    await expect(invoicesTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="invoices-report-view"]')).toBeVisible();

    const invoicedGross = page.locator('[data-testid="kpi-invoiced-gross"] strong');
    const outstanding = page.locator('[data-testid="kpi-outstanding-receivables"] strong');
    const settled = page.locator('[data-testid="kpi-total-settled"] strong');
    const collectionRate = page.locator('[data-testid="kpi-collection-rate"] strong');

    await expect(invoicedGross).toHaveText("₹5,31,000");
    await expect(outstanding).toHaveText("₹3,22,000");
    await expect(settled).toHaveText("₹2,09,000");
    await expect(collectionRate).toHaveText("39.4%");

    // Verify invoice row INV-2026-042 exists in table
    const invoiceRow = page.locator('[data-testid="invoice-row-101"]');
    await expect(invoiceRow).toBeVisible();
    await expect(invoiceRow).toContainText("INV-2026-042");
    await expect(invoiceRow).toContainText("Acme Cloud Solutions Pvt Ltd");
    await expect(invoiceRow).toContainText("₹5,31,000");
    await expect(invoiceRow).toContainText("₹3,22,000");

    // Verify exclusion callout banner
    const exclusionBanner = page.locator(".cf-exclusion-banner");
    await expect(exclusionBanner).toBeVisible();
    await expect(exclusionBanner).toContainText("PO-NEXUS-881");
    await expect(exclusionBanner).toContainText("INV-2026-041");

    // 2. Collections Ledger Tab
    const paymentsTab = page.locator('[data-testid="tab-payments"]');
    await paymentsTab.click();
    await expect(paymentsTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="payments-report-view"]')).toBeVisible();

    const cashKpi = page.locator('[data-testid="kpi-cash-collected"] strong');
    const tdsKpi = page.locator('[data-testid="kpi-tds-deducted"] strong');
    const paymentsSettledKpi = page.locator('[data-testid="kpi-payments-settled"] strong');
    const txCountKpi = page.locator('[data-testid="kpi-transaction-count"] strong');

    await expect(cashKpi).toHaveText("₹2,00,000");
    await expect(tdsKpi).toHaveText("₹9,000");
    await expect(paymentsSettledKpi).toHaveText("₹2,09,000");
    await expect(txCountKpi).toHaveText("1");

    const paymentRow = page.locator('[data-testid="payment-row-85"]');
    await expect(paymentRow).toBeVisible();
    await expect(paymentRow).toContainText("UTR-ICICI-9876543210");
    await expect(paymentRow).toContainText("INV-2026-042");

    // 3. Customer Exposure Tab
    const customersTab = page.locator('[data-testid="tab-customers"]');
    await customersTab.click();
    await expect(customersTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="customers-report-view"]')).toBeVisible();

    const customerBilled = page.locator('[data-testid="kpi-customer-billed"] strong');
    const customerOutstanding = page.locator('[data-testid="kpi-customer-outstanding"] strong');
    const customerSettled = page.locator('[data-testid="kpi-customer-settled"] strong');

    await expect(customerBilled).toHaveText("₹5,31,000");
    await expect(customerOutstanding).toHaveText("₹3,22,000");
    await expect(customerSettled).toHaveText("₹2,09,000");

    const customerRow = page.locator('[data-testid="customer-row-1"]');
    await expect(customerRow).toBeVisible();
    await expect(customerRow).toContainText("Acme Cloud Solutions Pvt Ltd");

    // 4. Executive Attainment Tab
    const executivesTab = page.locator('[data-testid="tab-executives"]');
    await executivesTab.click();
    await expect(executivesTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="executives-report-view"]')).toBeVisible();

    const annualQuota = page.locator('[data-testid="kpi-annual-quota"] strong');
    const actualSales = page.locator('[data-testid="kpi-actual-invoiced-sales"] strong');
    const attainment = page.locator('[data-testid="kpi-quota-attainment"] strong');
    const remainingQuota = page.locator('[data-testid="kpi-remaining-quota"] strong');

    await expect(annualQuota).toHaveText("₹75,00,000");
    await expect(actualSales).toHaveText("₹4,50,000");
    await expect(attainment).toHaveText("6.0%");
    await expect(remainingQuota).toHaveText("₹70,50,000");

    const execRow = page.locator('[data-testid="exec-row-3"]');
    await expect(execRow).toBeVisible();
    await expect(execRow).toContainText("Neha Rao");
    await expect(execRow).toContainText("₹40,00,000");
    await expect(execRow).toContainText("₹4,50,000");
    await expect(execRow).toContainText("11.3%");

    // 5. AR Aging Summary Tab
    const agingTab = page.locator('[data-testid="tab-aging"]');
    await agingTab.click();
    await expect(agingTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="aging-report-view"]')).toBeVisible();

    const totalReceivables = page.locator('[data-testid="kpi-total-receivables"] strong');
    const currentNotDue = page.locator('[data-testid="kpi-current-not-due"] strong');
    const totalOverdue = page.locator('[data-testid="kpi-total-overdue"] strong');
    const asOfDate = page.locator('[data-testid="kpi-as-of-date"] strong');

    await expect(totalReceivables).toHaveText("₹3,22,000");
    await expect(currentNotDue).toHaveText("₹3,22,000");
    await expect(totalOverdue).toHaveText("₹0");
    await expect(asOfDate).toHaveText("30 Apr 2026");

    // Aging breakdown buckets grid
    const bucketsGrid = page.locator('[data-testid="aging-buckets-grid"]');
    await expect(bucketsGrid).toBeVisible();
    await expect(page.locator('[data-testid="bucket-current---not-due"]')).toContainText(
      "₹3,22,000",
    );

    // Capture reconciliation screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "s6-reports-reconciliation-1440.png"),
      fullPage: false,
    });
  });

  // ─── 4. LIVE REPORT FILTERS & EXCLUSIONS ──────────────────────────────────

  test("Live filters recalculate report summary and respect unbilled/cancelled exclusions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // Initial state: FY 2026-27
    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹5,31,000");

    // Filter by Financial Year: switch to FY 2025-26
    const fyTrigger = page.locator(
      '[data-testid="reports-hub"] button[aria-label="Financial year"]',
    );
    await fyTrigger.click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();
    await page.waitForTimeout(300);

    // FY 2025-26 has no active issued invoices
    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹0");
    await expect(page.locator('[data-testid="kpi-outstanding-receivables"] strong')).toHaveText(
      "₹0",
    );

    // Switch back to FY 2026-27 using Reset filters button
    const resetFiltersBtn = page.locator('[data-testid="reset-filters-btn"]');
    await resetFiltersBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹5,31,000");

    // Filter by Executive: select Kavya Nair (who has 0 invoices in FY 2026-27)
    const execTrigger = page.locator(
      '[data-testid="reports-hub"] button[aria-label="Executive filter"]',
    );
    await execTrigger.click();
    await page.getByRole("option", { name: "Kavya Nair" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹0");
    await expect(page.locator('[data-testid="kpi-outstanding-receivables"] strong')).toHaveText(
      "₹0",
    );

    // Reset filters
    await resetFiltersBtn.click();
    await page.waitForTimeout(300);

    // Filter by Customer: select Acme Cloud Solutions Pvt Ltd
    const customerTrigger = page.locator(
      '[data-testid="reports-hub"] button[aria-label="Customer filter"]',
    );
    await customerTrigger.click();
    await page.getByRole("option", { name: "Acme Cloud Solutions Pvt Ltd" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹5,31,000");
    await expect(page.locator('[data-testid="invoice-row-101"]')).toBeVisible();

    // Search filter: search for unbilled order PO-NEXUS-881
    // Unbilled orders are excluded from invoiced revenue, so searching for PO-NEXUS-881 produces 0 rows in Invoices report
    await resetFiltersBtn.click();
    await page.waitForTimeout(300);

    const searchInput = page.locator('[data-testid="reports-search-input"]');
    await searchInput.fill("PO-NEXUS-881");
    await page.waitForTimeout(300);

    // Table should show empty state or 0 matching rows
    await expect(page.locator('[data-testid="invoice-row-101"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹0");

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="invoice-row-101"]')).toBeVisible();
  });

  // ─── 5. 5-STEP EXPORT DRAWER WORKFLOW (ADMIN & FINANCE ROLES) ─────────────

  test("Complete 5-step Excel export workflow from Reports Hub at 1440px desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // Trigger export drawer
    const exportBtn = page.locator('[data-testid="export-report-btn"]');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const drawer = page.locator(".cf-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("h2")).toContainText("Generate Financial Export");

    // Step 1: Scope
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText("Scope");
    await expect(drawer.locator("text=1. Financial Year Scope")).toBeVisible();
    await expect(drawer.locator("text=2. Dataset Filter Scope")).toBeVisible();
    await expect(drawer.locator("text=3. Export Format Selection")).toBeVisible();

    // Verify format selection is Excel by default
    await expect(drawer.locator("text=Excel Workbook (.xlsx)")).toBeVisible();

    // Advance to Step 2: Preview
    const continueToPreviewBtn = drawer.getByRole("button", { name: "Continue to Preview" });
    await continueToPreviewBtn.click();

    // Step 2: Preview
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText("Preview");
    await expect(drawer.locator("text=Matched Scope")).toBeVisible();
    await expect(drawer.locator("text=Sample Dataset Rows Preview")).toBeVisible();
    await expect(
      drawer.locator(
        "text=Preview shows selected subset. All 17 authoritative backend columns will be generated.",
      ),
    ).toBeVisible();

    // Advance to Step 3: Review
    const reviewBtn = drawer.getByRole("button", { name: "Review Columns & Totals" });
    await reviewBtn.click();

    // Step 3: Review
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText("Review");
    await expect(drawer.locator("text=1. Summary Financial Totals (Reconciliation)")).toBeVisible();
    await expect(drawer.locator("text=Gross Invoiced")).toBeVisible();
    await expect(drawer.getByText("Balance Outstanding", { exact: true })).toBeVisible();
    await expect(drawer.locator("text=2. Authoritative 17 Columns Checklist")).toBeVisible();

    // Verify presence of all 17 authoritative column names
    const expectedColumns = [
      "1. FY",
      "2. PO Date",
      "3. PO Number",
      "4. Customer Name",
      "5. Executive",
      "6. Exclusive Amount",
      "7. Tax Amount",
      "8. Total Invoiced",
      "9. Invoice Number",
      "10. Invoice Date",
      "11. Due Date",
      "12. Cash Received",
      "13. TDS Deducted",
      "14. Total Settled",
      "15. Balance Outstanding",
      "16. Status",
      "17. Days Overdue",
    ];

    for (const col of expectedColumns) {
      await expect(drawer.locator(`text=${col}`)).toBeVisible();
    }

    // Capture drawer workflow screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "s6-export-drawer-workflow-1440.png"),
      fullPage: false,
    });

    // Advance to Step 4: Confirm
    const proceedToConfirmBtn = drawer.getByRole("button", { name: "Proceed to Confirmation" });
    await proceedToConfirmBtn.click();

    // Step 4: Confirm
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText("Confirm");
    await expect(drawer.locator("text=Pre-Flight Security & Integrity Checks")).toBeVisible();
    await expect(drawer.locator("text=17-Column Schema:")).toBeVisible();
    await expect(drawer.locator("text=CWE-1236 Formula Sanitization:")).toBeVisible();
    await expect(drawer.locator("text=Zero Credential Exposure:")).toBeVisible();
    await expect(drawer.locator("text=Ticket Lifecycle Simulation:")).toBeVisible();
    await expect(drawer.locator("text=Authoritative Styling:")).toBeVisible();
    await expect(drawer.locator("text=Role Authorization Check")).toBeVisible();
    await expect(drawer.locator("text=Acting Role: FINANCE")).toBeVisible();

    // Trigger generation
    const confirmGenerateBtn = drawer.getByRole("button", {
      name: /Confirm & Generate Excel Export/i,
    });
    await expect(confirmGenerateBtn).toBeEnabled();
    await confirmGenerateBtn.click();

    // Step 5: Result
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText("Result");
    await expect(drawer.locator("h2")).toContainText("Export Ready for Download");
    await expect(drawer.locator("text=Export Generated Successfully")).toBeVisible();
    await expect(
      drawer.locator("text=Excel workbook prepared with authoritative 17 columns and styling."),
    ).toBeVisible();

    // Verify artifact details
    await expect(drawer.locator("text=Artifact Details")).toBeVisible();
    await expect(drawer.locator("text=CollectFlow_Export_FY_2026-27.xlsx")).toBeVisible();
    await expect(drawer.locator("text=Single-Use Ticket Lifecycle")).toBeVisible();
    await expect(
      drawer.locator("text=Ticket expires in 300 seconds (5 minutes). Single-use only."),
    ).toBeVisible();

    // Verify Download action
    const downloadBtn = drawer.getByRole("button", { name: /Download Export File/i });
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    // Verify state after download triggered
    await expect(drawer.getByRole("button", { name: /Download Again/i })).toBeVisible();

    // Capture result screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "s6-export-result-1440.png"),
      fullPage: false,
    });

    // Close drawer via Return to Workspace
    const doneBtn = drawer.getByRole("button", { name: /Done · Return to Workspace/i });
    await doneBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  // ─── 6. DEMO CSV EXPORT WORKFLOW & LABELING ───────────────────────────────

  test("Demo CSV export workflow enforces formula injection badges and transparent labeling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // Open export drawer
    await page.locator('[data-testid="export-report-btn"]').click();
    const drawer = page.locator(".cf-drawer");
    await expect(drawer).toBeVisible();

    // Step 1: Select Demo CSV format
    const csvOption = drawer.locator("text=Demo CSV Export (.csv)");
    await csvOption.click();

    // Advance to Step 2 -> Step 3 -> Step 4
    await drawer.getByRole("button", { name: "Continue to Preview" }).click();
    await expect(drawer.locator("text=Demo CSV")).toBeVisible();

    await drawer.getByRole("button", { name: "Review Columns & Totals" }).click();
    await drawer.getByRole("button", { name: "Proceed to Confirmation" }).click();

    // Step 4: Verify Demo CSV Labeling pre-flight badge
    await expect(drawer.locator("text=Demo CSV Labeling:")).toBeVisible();
    await expect(drawer.locator("text=Demo CSV Export")).toBeVisible();

    // Confirm generation
    const confirmCsvBtn = drawer.getByRole("button", { name: /Confirm & Generate CSV Export/i });
    await expect(confirmCsvBtn).toBeEnabled();
    await confirmCsvBtn.click();

    // Step 5: Verify result
    await expect(drawer.locator("text=CollectFlow_Demo_CSV_Export_FY_2026-27.csv")).toBeVisible();
    await expect(
      drawer.locator("text=Demo CSV export prepared with formula injection sanitization."),
    ).toBeVisible();

    await drawer.getByRole("button", { name: /Done · Return to Workspace/i }).click();
    await expect(drawer).not.toBeVisible();
  });

  // ─── 7. DISCARD CONFIRMATION ON DIRTY DRAWER DISMISSAL ────────────────────

  test("Discard confirmation dialog intercepts dirty drawer dismissal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // Open export drawer
    await page.locator('[data-testid="export-report-btn"]').click();
    const drawer = page.locator(".cf-drawer");
    await expect(drawer).toBeVisible();

    // Modify scope parameter (make it dirty)
    await drawer.getByRole("button", { name: "ALL" }).click();

    // Click close (X) button
    const closeBtn = drawer.locator('button[aria-label="Close export drawer"]');
    await closeBtn.click();

    // Verify discard prompt appears and drawer remains open
    const discardPrompt = drawer.locator(".cf-discard");
    await expect(discardPrompt).toBeVisible();
    await expect(discardPrompt.locator("text=Discard unsaved export parameters?")).toBeVisible();

    // Click "Keep editing"
    await discardPrompt.getByRole("button", { name: "Keep editing" }).click();
    await expect(discardPrompt).not.toBeVisible();
    await expect(drawer).toBeVisible();

    // Click close again and choose "Discard inputs"
    await closeBtn.click();
    await expect(discardPrompt).toBeVisible();
    await discardPrompt.getByRole("button", { name: "Discard inputs" }).click();

    // Drawer should now be cleanly closed
    await expect(drawer).not.toBeVisible();
  });

  // ─── 8. RBAC EXPORT AUTHORIZATION & MID-DRAWER ROLE SWITCH ────────────────

  test("RBAC export authorization restricts Sales/Viewer roles and displays denial alert on mid-workflow change", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // 1. Switch to Sales role
    await switchRole(page, "sales");

    // Open export drawer as Sales
    await page.locator('[data-testid="export-report-btn"]').click();
    const drawer = page.locator(".cf-drawer");
    await expect(drawer).toBeVisible();

    // Denial banner must be visible immediately
    const denialBanner = drawer.locator(".cf-denial-banner");
    await expect(denialBanner).toBeVisible();
    await expect(denialBanner).toContainText("Permission Notice: Simulated role changed to sales");
    await expect(denialBanner).toContainText(
      "Only Admin and Finance roles have full export generation access",
    );

    // Navigate to Confirm step
    await drawer.getByRole("button", { name: "Continue to Preview" }).click();
    await drawer.getByRole("button", { name: "Review Columns & Totals" }).click();
    await drawer.getByRole("button", { name: "Proceed to Confirmation" }).click();

    // Confirm button must be strictly disabled
    const confirmBtn = drawer.getByRole("button", { name: /Confirm & Generate/i });
    await expect(confirmBtn).toBeDisabled();

    // Close drawer
    await drawer.locator('button[aria-label="Close export drawer"]').click();
    if (await drawer.locator(".cf-discard").isVisible()) {
      await drawer.locator(".cf-discard").getByRole("button", { name: "Discard inputs" }).click();
    }
    await expect(drawer).not.toBeVisible();

    // 2. Switch back to Admin role
    await switchRole(page, "admin");

    // Open export drawer as Admin
    await page.locator('[data-testid="export-report-btn"]').click();
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".cf-denial-banner")).not.toBeVisible();

    // Navigate to Step 4 (Confirm)
    await drawer.getByRole("button", { name: "Continue to Preview" }).click();
    await drawer.getByRole("button", { name: "Review Columns & Totals" }).click();
    await drawer.getByRole("button", { name: "Proceed to Confirmation" }).click();

    // As Admin, confirmation button is enabled
    await expect(drawer.getByRole("button", { name: /Confirm & Generate/i })).toBeEnabled();

    // 3. Mid-workflow dynamic role change: switch role to Viewer while drawer is open on Confirm step
    await switchRole(page, "viewer");

    // Live re-verification should immediately display denial banner and disable button
    await expect(drawer.locator(".cf-denial-banner")).toBeVisible();
    await expect(drawer.locator(".cf-denial-banner")).toContainText(
      "Simulated role changed to viewer",
    );
    await expect(drawer.getByRole("button", { name: /Confirm & Generate/i })).toBeDisabled();

    // Switch back to Finance: banner disappears and button becomes enabled again
    await switchRole(page, "finance");
    await expect(drawer.locator(".cf-denial-banner")).not.toBeVisible();
    await expect(drawer.getByRole("button", { name: /Confirm & Generate/i })).toBeEnabled();

    // Close drawer
    await drawer.locator('button[aria-label="Close export drawer"]').click();
    if (await drawer.locator(".cf-discard").isVisible()) {
      await drawer.locator(".cf-discard").getByRole("button", { name: "Discard inputs" }).click();
    }
    await expect(drawer).not.toBeVisible();
  });

  // ─── 9. MOBILE PREVIEW PERSISTENCE (CF3-05) ───────────────────────────────

  test("Mobile preview persistence (CF3-05) survives route changes into and out of Reports", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    const mobileBtn = page.locator('.cf-review-bar button[title="Mobile preview"]');
    const desktopBtn = page.locator('.cf-review-bar button[title="Desktop preview"]');

    // Switch to Mobile preview
    await mobileBtn.click();
    await expect(mobileBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cf-preview-mobile")).toBeVisible();

    // Navigate to Reports inside mobile preview
    await page.locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "More" }).click();
    await page
      .locator(".cf-preview-mobile .cf-sidebar.cf-menu-open .cf-nav-item", { hasText: "Reports" })
      .click();

    await expect(page).toHaveURL(/\/reports/);
    await expect(page.locator(".cf-preview-mobile")).toBeVisible();
    await expect(mobileBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();

    // Switch tab inside mobile preview
    await page.locator('.cf-preview-mobile [data-testid="tab-payments"]').click();
    await expect(
      page.locator('.cf-preview-mobile [data-testid="payments-report-view"]'),
    ).toBeVisible();

    // Navigate back to Dashboard inside mobile preview
    await page
      .locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "Dashboard" })
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".cf-preview-mobile")).toBeVisible();
    await expect(mobileBtn).toHaveAttribute("aria-pressed", "true");

    // Restore back to desktop preview
    await desktopBtn.click();
    await expect(desktopBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cf-preview-mobile")).not.toBeVisible();
  });

  // ─── 10. RESET DEMO RESTORATION ───────────────────────────────────────────

  test("Reset Demo restores all 7 financial invariants, 6 baseline users, and Stage 4 target baselines", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });

    // Modify state: switch role to viewer, switch FY
    await switchRole(page, "viewer");
    const fyTrigger = page.locator(
      '[data-testid="reports-hub"] button[aria-label="Financial year"]',
    );
    await fyTrigger.click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();
    await page.waitForTimeout(300);

    // Trigger Reset Demo
    await restoreBaseline(page);

    // 1. Verify all 7 financial invariants on Dashboard
    await assertAll7BaselineFinancialInvariants(page);

    // 2. Verify all 6 baseline users on /users
    await page.goto("/users", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Users & Roles");
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    const expectedUsers = [
      { id: 1, name: "System Administrator", user: "admin" },
      { id: 2, name: "Aisha Khan", user: "finance_lead" },
      { id: 3, name: "Neha Rao", user: "siliya" },
      { id: 4, name: "Kavya Nair", user: "syama" },
      { id: 5, name: "Arjun Mehta", user: "anshar" },
      { id: 6, name: "Kavita Rao", user: "auditor" },
    ];
    for (const u of expectedUsers) {
      const userRow = page.locator(`[data-testid="user-row-${u.id}"]`);
      await expect(userRow).toBeVisible();
      await expect(userRow).toContainText(u.name);
      await expect(userRow).toContainText(`@${u.user}`);
    }

    // 3. Verify Stage 4 target baselines on /sales-targets
    await page.goto("/sales-targets", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Sales Targets");
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Annual Target Quota" }).locator("strong"),
    ).toHaveText("₹75,00,000");
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Overall Attainment" }).locator("strong"),
    ).toHaveText("6%");

    // 4. Verify Reports Hub restored to FY 2026-27 baseline
    await page.goto("/reports", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="kpi-invoiced-gross"] strong')).toHaveText("₹5,31,000");
    await expect(page.locator('[data-testid="kpi-outstanding-receivables"] strong')).toHaveText(
      "₹3,22,000",
    );
  });

  // ─── 11. CROSS-MODULE REGRESSION VERIFICATION ─────────────────────────────

  test("Cross-module navigation across all 9 application routes is error-free", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    const routes = [
      { path: "/", title: "Business overview" },
      { path: "/orders", title: "Orders" },
      { path: "/invoices", title: "Invoices" },
      { path: "/payments", title: "Payments" },
      { path: "/sales-targets", title: "Sales Targets" },
      { path: "/performance-analytics", title: "Performance Analytics" },
      { path: "/users", title: "Users & Roles" },
      { path: "/settings", title: "Settings" },
      { path: "/reports", title: "Reports" },
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.locator("h1")).toHaveText(route.title);
      // Ensure no error state is displayed
      await expect(page.locator('.cf-empty[role="alert"]')).not.toBeVisible();
    }
  });
});
