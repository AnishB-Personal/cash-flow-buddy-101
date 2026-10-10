import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MockSessionProvider, useMockSession } from "@/components/collectflow/session";
import {
  targetUpdateSchema,
  deriveTargetBreakdown,
  calculateExecutiveAchievement,
  canManageTargets,
  createTargetAdapter,
  reviewTarget,
  getExecutivePerformanceList,
  roundCurrency,
  type InvoiceSummary,
} from "@/data/targets";

describe("Sales Targets — Data Layer & Calculations", () => {
  describe("targetUpdateSchema Validation", () => {
    it("accepts valid minimal target input", () => {
      const parsed = targetUpdateSchema.parse({
        user_id: 3,
        fy_code: "FY 2026-27",
        yearly_target: 1200000,
      });
      expect(parsed.user_id).toBe(3);
      expect(parsed.fy_code).toBe("FY 2026-27");
      expect(parsed.yearly_target).toBe(1200000);
    });

    it("accepts valid full target input with overrides and bottom lines", () => {
      const parsed = targetUpdateSchema.parse({
        user_id: 4,
        fy_code: "FY 2026-27",
        yearly_target: 2400000,
        half_yearly_target: 1200000,
        quarterly_target: 600000,
        monthly_target: 200000,
        monthly_bottom_line: 150000,
        yearly_bottom_line: 1800000,
      });
      expect(parsed.half_yearly_target).toBe(1200000);
      expect(parsed.quarterly_target).toBe(600000);
      expect(parsed.monthly_target).toBe(200000);
      expect(parsed.monthly_bottom_line).toBe(150000);
      expect(parsed.yearly_bottom_line).toBe(1800000);
    });

    it("rejects empty fy_code", () => {
      expect(() =>
        targetUpdateSchema.parse({
          user_id: 3,
          fy_code: "   ",
          yearly_target: 1000000,
        }),
      ).toThrow();
    });

    it("rejects negative yearly target", () => {
      expect(() =>
        targetUpdateSchema.parse({
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: -500,
        }),
      ).toThrow();
    });

    it("rejects negative sub-period targets and bottom lines", () => {
      expect(() =>
        targetUpdateSchema.parse({
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 1000000,
          half_yearly_target: -100,
        }),
      ).toThrow();

      expect(() =>
        targetUpdateSchema.parse({
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 1000000,
          monthly_bottom_line: -1,
        }),
      ).toThrow();
    });

    it("rejects non-positive user_id", () => {
      expect(() =>
        targetUpdateSchema.parse({
          user_id: 0,
          fy_code: "FY 2026-27",
          yearly_target: 1000000,
        }),
      ).toThrow();
    });
  });

  describe("deriveTargetBreakdown Arithmetic", () => {
    it("auto-divides even annual amount (12 Lakh)", () => {
      const breakdown = deriveTargetBreakdown(1200000);
      expect(breakdown.half_yearly_target).toBe(600000);
      expect(breakdown.quarterly_target).toBe(300000);
      expect(breakdown.monthly_target).toBe(100000);
      expect(breakdown.monthly_bottom_line).toBe(0);
      expect(breakdown.yearly_bottom_line).toBe(0);
    });

    it("auto-divides odd annual amount with Decimal paise rounding (10 Lakh)", () => {
      const breakdown = deriveTargetBreakdown(1000000);
      expect(breakdown.half_yearly_target).toBe(500000);
      expect(breakdown.quarterly_target).toBe(250000);
      expect(breakdown.monthly_target).toBe(83333.33);
    });

    it("matches baseline 40L target breakdown for Neha Rao", () => {
      const breakdown = deriveTargetBreakdown(4000000);
      expect(breakdown.half_yearly_target).toBe(2000000);
      expect(breakdown.quarterly_target).toBe(1000000);
      expect(breakdown.monthly_target).toBe(333333.33);
    });

    it("matches baseline 35L target breakdown for Kavya Nair", () => {
      const breakdown = deriveTargetBreakdown(3500000);
      expect(breakdown.half_yearly_target).toBe(1750000);
      expect(breakdown.quarterly_target).toBe(875000);
      expect(breakdown.monthly_target).toBe(291666.67);
    });

    it("preserves manual sub-period overrides", () => {
      const breakdown = deriveTargetBreakdown(1200000, {
        half_yearly_target: 700000,
        quarterly_target: 350000,
        monthly_target: 120000,
        monthly_bottom_line: 80000,
        yearly_bottom_line: 960000,
      });
      expect(breakdown.half_yearly_target).toBe(700000);
      expect(breakdown.quarterly_target).toBe(350000);
      expect(breakdown.monthly_target).toBe(120000);
      expect(breakdown.monthly_bottom_line).toBe(80000);
      expect(breakdown.yearly_bottom_line).toBe(960000);
    });
  });

  describe("calculateExecutiveAchievement Engine", () => {
    const mockInvoices: InvoiceSummary[] = [
      {
        id: 1,
        fy_code: "FY 2026-27",
        executive_id: 3,
        exclusive_amount: 500000,
        total_amount: 590000,
        outstanding_balance: 200000,
        computed_status: "PARTIAL",
        invoice_number: "INV-2026-001",
      },
      {
        id: 2,
        fy_code: "FY 2026-27",
        executive_id: 3,
        exclusive_amount: 300000,
        total_amount: 354000,
        outstanding_balance: 0,
        computed_status: "PAID",
        invoice_number: "INV-2026-002",
      },
      {
        id: 3,
        fy_code: "FY 2026-27",
        executive_id: 3,
        exclusive_amount: 400000,
        total_amount: 472000,
        outstanding_balance: 0,
        computed_status: "CANCELLED",
        invoice_number: "INV-2026-003",
      },
      {
        id: 4,
        fy_code: "FY 2025-26", // different FY
        executive_id: 3,
        exclusive_amount: 600000,
        total_amount: 708000,
        outstanding_balance: 0,
        computed_status: "PAID",
        invoice_number: "INV-2025-099",
      },
      {
        id: 5,
        fy_code: "FY 2026-27",
        executive_id: 4, // different executive
        exclusive_amount: 250000,
        total_amount: 295000,
        outstanding_balance: 295000,
        computed_status: "UNBILLED",
        invoice_number: null,
      },
    ];

    it("calculates achievement excluding cancelled invoices and other FYs", () => {
      // For Executive 3 in FY 2026-27: Inv 1 (500k) + Inv 2 (300k) = 800k. Cancelled (400k) and FY 2025-26 excluded.
      const result = calculateExecutiveAchievement(3, mockInvoices, 4000000, "FY 2026-27");
      expect(result.actual_sales).toBe(800000);
      expect(result.achievement_pct).toBe(20.0); // 800k / 4000k * 100 = 20.0%
      expect(result.remaining_target).toBe(3200000);
      expect(result.order_count).toBe(2);
      expect(result.outstanding).toBe(200000);
    });

    it("handles zero target safely without NaN or division-by-zero errors", () => {
      const result = calculateExecutiveAchievement(3, mockInvoices, 0, "FY 2026-27");
      expect(result.actual_sales).toBe(800000);
      expect(result.achievement_pct).toBe(0.0);
      expect(result.remaining_target).toBe(0);
    });

    it("clamps remaining target to zero when target is exceeded", () => {
      const result = calculateExecutiveAchievement(3, mockInvoices, 500000, "FY 2026-27");
      expect(result.actual_sales).toBe(800000);
      expect(result.achievement_pct).toBe(160.0);
      expect(result.remaining_target).toBe(0);
    });

    it("returns zero sales for executive with no matching invoices", () => {
      const result = calculateExecutiveAchievement(99, mockInvoices, 1000000, "FY 2026-27");
      expect(result.actual_sales).toBe(0);
      expect(result.achievement_pct).toBe(0.0);
      expect(result.remaining_target).toBe(1000000);
      expect(result.order_count).toBe(0);
      expect(result.outstanding).toBe(0);
    });

    it("respects onlyIssued option to exclude unbilled POs if requested", () => {
      // Executive 4 has 1 unbilled PO
      const withUnbilled = calculateExecutiveAchievement(4, mockInvoices, 3500000, "FY 2026-27");
      expect(withUnbilled.actual_sales).toBe(250000);
      expect(withUnbilled.order_count).toBe(1);

      const onlyIssued = calculateExecutiveAchievement(4, mockInvoices, 3500000, "FY 2026-27", {
        onlyIssued: true,
      });
      expect(onlyIssued.actual_sales).toBe(0);
      expect(onlyIssued.order_count).toBe(0);
    });
  });

  describe("canManageTargets RBAC Helper", () => {
    it("authorizes admin and finance roles", () => {
      expect(canManageTargets("admin")).toBe(true);
      expect(canManageTargets("finance")).toBe(true);
    });

    it("denies sales and viewer roles", () => {
      expect(canManageTargets("sales")).toBe(false);
      expect(canManageTargets("viewer")).toBe(false);
    });
  });

  describe("createTargetAdapter In-Memory Store", () => {
    it("seeds initial targets from collectflow.json baseline", () => {
      const adapter = createTargetAdapter();
      const targets = adapter.listTargets();
      expect(targets).toHaveLength(2);

      const neha = adapter.getTarget(3, "FY 2026-27");
      expect(neha).not.toBeNull();
      expect(neha?.user_name).toBe("Neha Rao");
      expect(neha?.yearly_target).toBe(4000000);
      expect(neha?.monthly_target).toBe(333333.33);

      const kavya = adapter.getTarget(4, "FY 2026-27");
      expect(kavya).not.toBeNull();
      expect(kavya?.user_name).toBe("Kavya Nair");
      expect(kavya?.yearly_target).toBe(3500000);
      expect(kavya?.monthly_target).toBe(291666.67);
    });

    it("filters targets by financial year", () => {
      const adapter = createTargetAdapter();
      expect(adapter.listTargets("FY 2026-27")).toHaveLength(2);
      expect(adapter.listTargets("FY 2025-26")).toHaveLength(0);
    });

    it("returns null for unconfigured user", () => {
      const adapter = createTargetAdapter();
      expect(adapter.getTarget(5, "FY 2026-27")).toBeNull();
    });

    it("upserts existing target in place and recalculates sub-period targets", () => {
      const adapter = createTargetAdapter();
      const updated = adapter.upsertTarget({
        user_id: 3,
        fy_code: "FY 2026-27",
        yearly_target: 4800000,
      });

      expect(updated.yearly_target).toBe(4800000);
      expect(updated.half_yearly_target).toBe(2400000);
      expect(updated.quarterly_target).toBe(1200000);
      expect(updated.monthly_target).toBe(400000);

      const retrieved = adapter.getTarget(3, "FY 2026-27");
      expect(retrieved?.yearly_target).toBe(4800000);
      expect(adapter.listTargets()).toHaveLength(2); // no duplicates created
    });

    it("creates a new target for previously unassigned executive", () => {
      const adapter = createTargetAdapter();
      const created = adapter.upsertTarget({
        user_id: 5,
        fy_code: "FY 2026-27",
        yearly_target: 3000000,
      });

      expect(created.user_id).toBe(5);
      expect(created.user_name).toBe("Arjun Mehta");
      expect(created.yearly_target).toBe(3000000);
      expect(created.monthly_target).toBe(250000);
      expect(adapter.listTargets()).toHaveLength(3);
    });

    it("reset() restores baseline targets after mutations", () => {
      const adapter = createTargetAdapter();
      adapter.upsertTarget({
        user_id: 3,
        fy_code: "FY 2026-27",
        yearly_target: 9999999,
      });
      expect(adapter.getTarget(3)?.yearly_target).toBe(9999999);

      adapter.reset();
      expect(adapter.getTarget(3)?.yearly_target).toBe(4000000);
      expect(adapter.listTargets()).toHaveLength(2);
    });
  });

  describe("reviewTarget 4-Step Review Helper", () => {
    it("produces structured TargetReview with diff and standard auto-breakdown flag", () => {
      const adapter = createTargetAdapter();
      const existing = adapter.getTarget(3, "FY 2026-27");
      const invoices: InvoiceSummary[] = [
        {
          id: 101,
          fy_code: "FY 2026-27",
          executive_id: 3,
          exclusive_amount: 450000,
          total_amount: 531000,
          outstanding_balance: 322000,
          computed_status: "PARTIAL",
          invoice_number: "INV-2026-042",
        },
      ];

      const review = reviewTarget(
        {
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 4500000,
        },
        existing,
        invoices,
      );

      expect(review.previousTarget?.yearly_target).toBe(4000000);
      expect(review.target.yearly_target).toBe(4500000);
      expect(review.diff.yearly_target).toEqual({ prev: 4000000, curr: 4500000 });
      expect(review.diff.half_yearly_target).toEqual({ prev: 2000000, curr: 2250000 });
      expect(review.resultingAchievementPct).toBe(10.0); // 450,000 / 4,500,000 * 100 = 10.0%
      expect(review.unverifiedCustomInput).toBe(false);
    });

    it("flags unverifiedCustomInput when manual sub-period overrides differ from arithmetic division", () => {
      const adapter = createTargetAdapter();
      const existing = adapter.getTarget(3, "FY 2026-27");
      const review = reviewTarget(
        {
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 4000000,
          monthly_target: 500000, // custom manual override
        },
        existing,
        [],
      );

      expect(review.unverifiedCustomInput).toBe(true);
    });
  });

  describe("getExecutivePerformanceList Leaderboard", () => {
    it("generates performance records for all sales executives", () => {
      const adapter = createTargetAdapter();
      const targets = adapter.listTargets("FY 2026-27");
      const invoices: InvoiceSummary[] = [
        {
          id: 101,
          fy_code: "FY 2026-27",
          executive_id: 3,
          exclusive_amount: 450000,
          total_amount: 531000,
          outstanding_balance: 322000,
          computed_status: "PARTIAL",
          invoice_number: "INV-2026-042",
        },
        {
          id: 102,
          fy_code: "FY 2026-27",
          executive_id: 4,
          exclusive_amount: 250000,
          total_amount: 295000,
          outstanding_balance: 295000,
          computed_status: "UNBILLED",
          invoice_number: null,
        },
      ];

      const list = getExecutivePerformanceList(targets, invoices, "FY 2026-27");
      expect(list.length).toBeGreaterThanOrEqual(2);

      const neha = list.find((e) => e.user_id === 3);
      expect(neha).toBeDefined();
      expect(neha?.name).toBe("Neha Rao");
      expect(neha?.yearly_target).toBe(4000000);
      expect(neha?.fy_sales).toBe(450000);
      expect(neha?.achievement_pct).toBe(11.3); // 450000 / 4000000 * 100 = 11.25 -> 11.3%
      expect(neha?.remaining_target).toBe(3550000);

      const kavya = list.find((e) => e.user_id === 4);
      expect(kavya).toBeDefined();
      expect(kavya?.name).toBe("Kavya Nair");
      expect(kavya?.yearly_target).toBe(3500000);
    });
  });

  describe("MockSessionProvider Integration", () => {
    it("initializes with baseline targets and allows update by finance role", async () => {
      const { result } = renderHook(() => useMockSession(), {
        wrapper: MockSessionProvider,
      });

      expect(result.current.targets).toHaveLength(2);
      expect(result.current.targets.find((t) => t.user_id === 3)?.yearly_target).toBe(4000000);

      await act(async () => {
        await result.current.confirmTarget({
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 5000000,
        });
      });

      expect(result.current.targets.find((t) => t.user_id === 3)?.yearly_target).toBe(5000000);

      await act(async () => {
        result.current.resetDemo();
      });

      expect(result.current.targets.find((t) => t.user_id === 3)?.yearly_target).toBe(4000000);
    });

    it("blocks sales role from confirming targets", async () => {
      const { result } = renderHook(() => useMockSession(), {
        wrapper: MockSessionProvider,
      });

      act(() => {
        result.current.setRole("sales");
      });

      await expect(
        result.current.confirmTarget({
          user_id: 3,
          fy_code: "FY 2026-27",
          yearly_target: 5000000,
        }),
      ).rejects.toThrow("Access forbidden: role 'sales'");
    });

    it("provides targetAdapter with dual current compatibility", () => {
      const { result } = renderHook(() => useMockSession(), {
        wrapper: MockSessionProvider,
      });

      // Directly on targetAdapter
      expect(result.current.targetAdapter.listTargets()).toHaveLength(2);
      // Via targetAdapter.current
      expect(result.current.targetAdapter.current.listTargets()).toHaveLength(2);
    });
  });
});
