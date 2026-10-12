import { describe, it, expect } from "vitest";
import {
  parsePaise,
  formatPaise,
  multiplyMoney,
  computeGstBreakdown,
} from "../contracts/financial-contracts";

describe("Frontend Financial Arithmetic & Exact Monetary Contract", () => {
  it("parses decimal strings to exact integer paise without floating point inaccuracy", () => {
    expect(parsePaise("100.50")).toBe(10050n);
    expect(parsePaise("0.05")).toBe(5n);
    expect(parsePaise("531000.00")).toBe(53100000n);
    expect(parsePaise("-200000.00")).toBe(-20000000n);
  });

  it("formats integer paise to exact 2-decimal string representation", () => {
    expect(formatPaise(10050n)).toBe("100.50");
    expect(formatPaise(5n)).toBe("0.05");
    expect(formatPaise(53100000n)).toBe("531000.00");
    expect(formatPaise(-20000000n)).toBe("-200000.00");
  });

  it("computes half-up financial multiplication accurately", () => {
    // 450,000 * 0.18 = 81,000.00
    expect(multiplyMoney("450000.00", "0.18")).toBe("81000.00");
    // Half-up rounding check on fractional paise
    expect(multiplyMoney("100.05", "0.10")).toBe("10.01");
  });

  it("computes intra-state GST breakdown with 50/50 CGST/SGST allocation", () => {
    // Karnataka to Karnataka: 18% GST -> 9% CGST (40,500) + 9% SGST (40,500)
    const breakdown = computeGstBreakdown("450000.00", 0.18, "Karnataka", "Karnataka");
    expect(breakdown.isInterState).toBe(false);
    expect(breakdown.cgstAmount).toBe("40500.00");
    expect(breakdown.sgstAmount).toBe("40500.00");
    expect(breakdown.igstAmount).toBe("0.00");
    expect(breakdown.totalTaxAmount).toBe("81000.00");
  });

  it("computes inter-state GST breakdown with 100% IGST allocation", () => {
    // Maharashtra to Karnataka: 18% GST -> 18% IGST (81,000)
    const breakdown = computeGstBreakdown("450000.00", 0.18, "Maharashtra", "Karnataka");
    expect(breakdown.isInterState).toBe(true);
    expect(breakdown.cgstAmount).toBe("0.00");
    expect(breakdown.sgstAmount).toBe("0.00");
    expect(breakdown.igstAmount).toBe("81000.00");
    expect(breakdown.totalTaxAmount).toBe("81000.00");
  });

  it("reconciles approved baseline fixtures exactly", () => {
    // INV-2026-042
    const exclusive = "450000.00";
    const tax = multiplyMoney(exclusive, "0.18");
    const totalGross = formatPaise(parsePaise(exclusive) + parsePaise(tax));
    expect(totalGross).toBe("531000.00");

    const cashPaid = "200000.00";
    const tdsDeducted = "9000.00";
    const totalSettled = formatPaise(parsePaise(cashPaid) + parsePaise(tdsDeducted));
    expect(totalSettled).toBe("209000.00");

    const outstanding = formatPaise(parsePaise(totalGross) - parsePaise(totalSettled));
    expect(outstanding).toBe("322000.00");

    // PO-NEXUS-881
    const poExclusive = "250000.00";
    const poTax = multiplyMoney(poExclusive, "0.18");
    const poTotal = formatPaise(parsePaise(poExclusive) + parsePaise(poTax));
    expect(poTotal).toBe("295000.00");
  });
});
