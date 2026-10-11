import { z } from "zod";
import type { Role } from "./records";
import fixtures from "./collectflow.json";

export interface SalesTarget {
  id: number;
  user_id: number;
  user_name: string;
  fy_code: string;
  yearly_target: number;
  half_yearly_target: number;
  quarterly_target: number;
  monthly_target: number;
  monthly_bottom_line: number;
  yearly_bottom_line: number;
  created_at?: string | undefined;
  updated_at?: string | undefined;
}

export interface TargetUpdateInput {
  user_id: number;
  fy_code: string;
  yearly_target: number;
  half_yearly_target?: number | undefined;
  quarterly_target?: number | undefined;
  monthly_target?: number | undefined;
  monthly_bottom_line?: number | undefined;
  yearly_bottom_line?: number | undefined;
}

export interface TargetReviewDiff {
  yearly_target: { prev: number; curr: number };
  half_yearly_target: { prev: number; curr: number };
  quarterly_target: { prev: number; curr: number };
  monthly_target: { prev: number; curr: number };
  monthly_bottom_line: { prev: number; curr: number };
  yearly_bottom_line: { prev: number; curr: number };
}

export interface TargetReview {
  target: SalesTarget;
  previousTarget: SalesTarget | null;
  diff: TargetReviewDiff;
  resultingAchievementPct: number;
  unverifiedCustomInput: boolean;
}

export interface ExecutivePerformance {
  user_id: number;
  name: string;
  fy_code: string;
  yearly_target: number;
  half_yearly_target: number;
  quarterly_target: number;
  monthly_target: number;
  fy_sales: number;
  fy_orders: number;
  fy_outstanding: number;
  all_time_sales: number;
  achievement_pct: number;
  remaining_target: number;
}

export type InvoiceSummary = {
  id: number;
  fy_code: string;
  executive_id?: number | null;
  computed_status?: string;
  payment_status?: string;
  invoice_number?: string | null;
  exclusive_amount?: number;
  total_amount?: number;
  outstanding_balance?: number;
};

export const targetUpdateSchema = z.object({
  user_id: z.coerce.number().int().positive("User ID must be a positive integer"),
  fy_code: z.string().trim().min(1, "Financial year code is required"),
  yearly_target: z.coerce.number().min(0, "Yearly target must be greater than or equal to 0.00"),
  half_yearly_target: z.coerce
    .number()
    .min(0, "Half-yearly target must be greater than or equal to 0.00")
    .optional(),
  quarterly_target: z.coerce
    .number()
    .min(0, "Quarterly target must be greater than or equal to 0.00")
    .optional(),
  monthly_target: z.coerce
    .number()
    .min(0, "Monthly target must be greater than or equal to 0.00")
    .optional(),
  monthly_bottom_line: z.coerce
    .number()
    .min(0, "Monthly bottom line must be greater than or equal to 0.00")
    .optional(),
  yearly_bottom_line: z.coerce
    .number()
    .min(0, "Yearly bottom line must be greater than or equal to 0.00")
    .optional(),
});

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function deriveTargetBreakdown(
  yearly: number,
  overrides?: {
    half_yearly_target?: number | null | undefined;
    quarterly_target?: number | null | undefined;
    monthly_target?: number | null | undefined;
    monthly_bottom_line?: number | null | undefined;
    yearly_bottom_line?: number | null | undefined;
  },
): {
  half_yearly_target: number;
  quarterly_target: number;
  monthly_target: number;
  monthly_bottom_line: number;
  yearly_bottom_line: number;
} {
  const half_yearly_target =
    overrides?.half_yearly_target !== undefined && overrides.half_yearly_target !== null
      ? roundCurrency(overrides.half_yearly_target)
      : roundCurrency(yearly / 2);

  const quarterly_target =
    overrides?.quarterly_target !== undefined && overrides.quarterly_target !== null
      ? roundCurrency(overrides.quarterly_target)
      : roundCurrency(yearly / 4);

  const monthly_target =
    overrides?.monthly_target !== undefined && overrides.monthly_target !== null
      ? roundCurrency(overrides.monthly_target)
      : roundCurrency(yearly / 12);

  const monthly_bottom_line =
    overrides?.monthly_bottom_line !== undefined && overrides.monthly_bottom_line !== null
      ? roundCurrency(overrides.monthly_bottom_line)
      : 0;

  const yearly_bottom_line =
    overrides?.yearly_bottom_line !== undefined && overrides.yearly_bottom_line !== null
      ? roundCurrency(overrides.yearly_bottom_line)
      : 0;

  return {
    half_yearly_target,
    quarterly_target,
    monthly_target,
    monthly_bottom_line,
    yearly_bottom_line,
  };
}

export function calculateExecutiveAchievement(
  executiveId: number,
  invoices: InvoiceSummary[],
  target: number,
  fyCode: string,
  options?: { includeUnbilled?: boolean; useTotalAmount?: boolean },
): {
  actual_sales: number;
  achievement_pct: number;
  remaining_target: number;
  order_count: number;
  outstanding: number;
} {
  const matching = invoices.filter((inv) => {
    if (inv.executive_id !== executiveId) return false;
    if (inv.fy_code !== fyCode) return false;
    const status = (inv.computed_status ?? inv.payment_status ?? "").toUpperCase();
    if (status === "CANCELLED") return false;
    // Strictly exclude unbilled purchase orders unless explicitly requested:
    // Only issued, non-cancelled invoices with an invoice number qualify for sales achievement.
    if (!options?.includeUnbilled && (!inv.invoice_number?.trim() || status === "UNBILLED")) return false;
    return true;
  });

  const actual_sales = roundCurrency(
    matching.reduce((sum, inv) => {
      const amount = options?.useTotalAmount
        ? (inv.total_amount ?? inv.exclusive_amount ?? 0)
        : (inv.exclusive_amount ?? inv.total_amount ?? 0);
      return sum + amount;
    }, 0),
  );

  const achievement_pct = target > 0 ? Number(((actual_sales / target) * 100).toFixed(1)) : 0.0;
  const remaining_target = Math.max(0, roundCurrency(target - actual_sales));
  const order_count = matching.length;
  const outstanding = roundCurrency(
    matching.reduce((sum, inv) => sum + (inv.outstanding_balance ?? 0), 0),
  );

  return {
    actual_sales,
    achievement_pct,
    remaining_target,
    order_count,
    outstanding,
  };
}

export function canManageTargets(role: Role): boolean {
  return role === "admin" || role === "finance";
}

function getUserName(userId: number): string {
  const user = fixtures.users.find((u) => u.id === userId);
  return user?.full_name ?? user?.username ?? `User ${userId}`;
}

export const INITIAL_TARGETS: SalesTarget[] = [
  // FY 2026-27 (Active default financial year)
  {
    id: 1,
    user_id: 3,
    user_name: "Neha Rao",
    fy_code: "FY 2026-27",
    yearly_target: 4000000,
    half_yearly_target: 2000000,
    quarterly_target: 1000000,
    monthly_target: 333333.33,
    monthly_bottom_line: 0,
    yearly_bottom_line: 0,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  {
    id: 2,
    user_id: 4,
    user_name: "Kavya Nair",
    fy_code: "FY 2026-27",
    yearly_target: 3500000,
    half_yearly_target: 1750000,
    quarterly_target: 875000,
    monthly_target: 291666.67,
    monthly_bottom_line: 0,
    yearly_bottom_line: 0,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  // FY 2025-26 (Prior financial year fixtures for cross-FY verification)
  {
    id: 3,
    user_id: 3,
    user_name: "Neha Rao",
    fy_code: "FY 2025-26",
    yearly_target: 3600000,
    half_yearly_target: 1800000,
    quarterly_target: 900000,
    monthly_target: 300000,
    monthly_bottom_line: 0,
    yearly_bottom_line: 0,
    created_at: "2025-04-01T00:00:00Z",
    updated_at: "2025-04-01T00:00:00Z",
  },
  {
    id: 4,
    user_id: 4,
    user_name: "Kavya Nair",
    fy_code: "FY 2025-26",
    yearly_target: 3000000,
    half_yearly_target: 1500000,
    quarterly_target: 750000,
    monthly_target: 250000,
    monthly_bottom_line: 0,
    yearly_bottom_line: 0,
    created_at: "2025-04-01T00:00:00Z",
    updated_at: "2025-04-01T00:00:00Z",
  },
  {
    id: 5,
    user_id: 5,
    user_name: "Arjun Mehta",
    fy_code: "FY 2025-26",
    yearly_target: 2400000,
    half_yearly_target: 1200000,
    quarterly_target: 600000,
    monthly_target: 200000,
    monthly_bottom_line: 0,
    yearly_bottom_line: 0,
    created_at: "2025-04-01T00:00:00Z",
    updated_at: "2025-04-01T00:00:00Z",
  },
];

export function readInitialTargets(): SalesTarget[] {
  return structuredClone(INITIAL_TARGETS);
}

export interface TargetAdapter {
  listTargets(fyCode?: string): SalesTarget[];
  getTarget(userId: number, fyCode?: string): SalesTarget | null;
  upsertTarget(input: TargetUpdateInput): SalesTarget;
  reset(): void;
  current?: TargetAdapter;
}

export function createTargetAdapter(): TargetAdapter {
  let store: SalesTarget[] = readInitialTargets();

  const adapter: TargetAdapter = {
    listTargets(fyCode?: string): SalesTarget[] {
      const list = fyCode ? store.filter((t) => t.fy_code === fyCode) : store;
      return structuredClone(list);
    },

    getTarget(userId: number, fyCode?: string): SalesTarget | null {
      const code = fyCode ?? "FY 2026-27";
      const found = store.find((t) => t.user_id === userId && t.fy_code === code);
      return found ? structuredClone(found) : null;
    },

    upsertTarget(rawInput: TargetUpdateInput): SalesTarget {
      const validated = targetUpdateSchema.parse(rawInput);
      const breakdown = deriveTargetBreakdown(validated.yearly_target, validated);
      const existingIdx = store.findIndex(
        (t) => t.user_id === validated.user_id && t.fy_code === validated.fy_code,
      );

      const now = new Date().toISOString();
      if (existingIdx !== -1) {
        const existing = store[existingIdx]!;
        const updated: SalesTarget = {
          ...existing,
          yearly_target: roundCurrency(validated.yearly_target),
          half_yearly_target: breakdown.half_yearly_target,
          quarterly_target: breakdown.quarterly_target,
          monthly_target: breakdown.monthly_target,
          monthly_bottom_line: breakdown.monthly_bottom_line,
          yearly_bottom_line: breakdown.yearly_bottom_line,
          updated_at: now,
        };
        store[existingIdx] = updated;
        return structuredClone(updated);
      }

      const nextId = store.length > 0 ? Math.max(...store.map((t) => t.id)) + 1 : 1;
      const created: SalesTarget = {
        id: nextId,
        user_id: validated.user_id,
        user_name: getUserName(validated.user_id),
        fy_code: validated.fy_code,
        yearly_target: roundCurrency(validated.yearly_target),
        half_yearly_target: breakdown.half_yearly_target,
        quarterly_target: breakdown.quarterly_target,
        monthly_target: breakdown.monthly_target,
        monthly_bottom_line: breakdown.monthly_bottom_line,
        yearly_bottom_line: breakdown.yearly_bottom_line,
        created_at: now,
        updated_at: now,
      };
      store.push(created);
      return structuredClone(created);
    },

    reset(): void {
      store = readInitialTargets();
    },
  };

  adapter.current = adapter;
  return adapter;
}

export function reviewTarget(
  input: TargetUpdateInput,
  existingTarget: SalesTarget | null,
  invoices: InvoiceSummary[],
): TargetReview {
  const validated = targetUpdateSchema.parse(input);
  const breakdown = deriveTargetBreakdown(validated.yearly_target, validated);
  const defaultBreakdown = deriveTargetBreakdown(validated.yearly_target);

  const unverifiedCustomInput = Boolean(
    (input.half_yearly_target !== undefined &&
      input.half_yearly_target !== defaultBreakdown.half_yearly_target) ||
    (input.quarterly_target !== undefined &&
      input.quarterly_target !== defaultBreakdown.quarterly_target) ||
    (input.monthly_target !== undefined &&
      input.monthly_target !== defaultBreakdown.monthly_target) ||
    (input.monthly_bottom_line !== undefined && input.monthly_bottom_line > 0) ||
    (input.yearly_bottom_line !== undefined && input.yearly_bottom_line > 0),
  );

  const prev = existingTarget;
  const target: SalesTarget = {
    id: prev?.id ?? 0,
    user_id: validated.user_id,
    user_name: prev?.user_name ?? getUserName(validated.user_id),
    fy_code: validated.fy_code,
    yearly_target: roundCurrency(validated.yearly_target),
    half_yearly_target: breakdown.half_yearly_target,
    quarterly_target: breakdown.quarterly_target,
    monthly_target: breakdown.monthly_target,
    monthly_bottom_line: breakdown.monthly_bottom_line,
    yearly_bottom_line: breakdown.yearly_bottom_line,
    created_at: prev?.created_at,
    updated_at: new Date().toISOString(),
  };

  const diff: TargetReviewDiff = {
    yearly_target: { prev: prev?.yearly_target ?? 0, curr: target.yearly_target },
    half_yearly_target: { prev: prev?.half_yearly_target ?? 0, curr: target.half_yearly_target },
    quarterly_target: { prev: prev?.quarterly_target ?? 0, curr: target.quarterly_target },
    monthly_target: { prev: prev?.monthly_target ?? 0, curr: target.monthly_target },
    monthly_bottom_line: { prev: prev?.monthly_bottom_line ?? 0, curr: target.monthly_bottom_line },
    yearly_bottom_line: { prev: prev?.yearly_bottom_line ?? 0, curr: target.yearly_bottom_line },
  };

  const achievement = calculateExecutiveAchievement(
    validated.user_id,
    invoices,
    target.yearly_target,
    validated.fy_code,
  );

  return {
    target,
    previousTarget: prev ? structuredClone(prev) : null,
    diff,
    resultingAchievementPct: achievement.achievement_pct,
    unverifiedCustomInput,
  };
}

export function getExecutivePerformanceList(
  targets: SalesTarget[],
  invoices: InvoiceSummary[],
  fyCode: string,
  options?: { includeUnbilled?: boolean; useTotalAmount?: boolean },
): ExecutivePerformance[] {
  const salesUsers = fixtures.users.filter((u) => u.role === "sales");

  return salesUsers.map((user) => {
    const target = targets.find((t) => t.user_id === user.id && t.fy_code === fyCode);
    const yearly = target?.yearly_target ?? 0;
    const halfYearly = target?.half_yearly_target ?? 0;
    const quarterly = target?.quarterly_target ?? 0;
    const monthly = target?.monthly_target ?? 0;

    const fyAch = calculateExecutiveAchievement(user.id, invoices, yearly, fyCode, options);

    const allTimeMatching = invoices.filter((inv) => {
      if (inv.executive_id !== user.id) return false;
      const status = (inv.computed_status ?? inv.payment_status ?? "").toUpperCase();
      if (status === "CANCELLED") return false;
      if (!options?.includeUnbilled && (!inv.invoice_number?.trim() || status === "UNBILLED")) return false;
      return true;
    });

    const all_time_sales = roundCurrency(
      allTimeMatching.reduce((sum, inv) => {
        const amount = options?.useTotalAmount
          ? (inv.total_amount ?? inv.exclusive_amount ?? 0)
          : (inv.exclusive_amount ?? inv.total_amount ?? 0);
        return sum + amount;
      }, 0),
    );

    return {
      user_id: user.id,
      name: user.full_name ?? user.username,
      fy_code: fyCode,
      yearly_target: yearly,
      half_yearly_target: halfYearly,
      quarterly_target: quarterly,
      monthly_target: monthly,
      fy_sales: fyAch.actual_sales,
      fy_orders: fyAch.order_count,
      fy_outstanding: fyAch.outstanding,
      all_time_sales,
      achievement_pct: fyAch.achievement_pct,
      remaining_target: fyAch.remaining_target,
    };
  });
}
