/**
 * CollectFlow Frontend OpenAPI v1 Contracts & Financial Arithmetic Engine
 * 
 * Enforces:
 * - Exact string parsing/formatting of monetary values to eliminate binary floating point drift
 * - Strict financial invariants matching backend NUMERIC(15, 2)
 * - Exact Indian GST Place of Supply calculations
 */

export type MoneyString = `${number}.${string}`;

/**
 * Parses monetary string into high-precision numeric cents/paise (integer representation)
 * to avoid IEEE 754 binary floating-point representation errors.
 */
export function parsePaise(amountStr: string | number): bigint {
  const clean = typeof amountStr === "number" ? amountStr.toFixed(2) : amountStr.trim();
  const match = clean.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error(`Invalid monetary amount format: "${amountStr}". Expected decimal string (e.g. "1250.50").`);
  }
  const intPart = match[1] ?? "0";
  const fracPart = (match[2] ?? "").padEnd(2, "0").slice(0, 2);
  const sign = intPart.startsWith("-") ? -1n : 1n;
  const absInt = intPart.replace("-", "");
  return sign * (BigInt(absInt) * 100n + BigInt(fracPart));
}

/**
 * Formats integer paise/cents into an exact 2-decimal string representation.
 */
export function formatPaise(paise: bigint): string {
  const isNeg = paise < 0n;
  const abs = isNeg ? -paise : paise;
  const intPart = abs / 100n;
  const fracPart = (abs % 100n).toString().padStart(2, "0");
  return `${isNeg ? "-" : ""}${intPart.toString()}.${fracPart}`;
}

/**
 * High-precision financial round half-up multiplication (e.g. quantity * unit_price or amount * tax_rate).
 */
export function multiplyMoney(amountStr: string, factor: number | string): string {
  const p = parsePaise(amountStr);
  const factorStr = typeof factor === "number" ? factor.toString() : factor;
  const [fInt = "0", fFrac = ""] = factorStr.split(".");
  const factorDecimals = BigInt(fFrac.length);
  const factorInt = BigInt(fInt + fFrac);
  
  // Multiply in big integer space
  const isNegative = (p < 0n && factorInt > 0n) || (p > 0n && factorInt < 0n);
  const absP = p < 0n ? -p : p;
  const absFactor = factorInt < 0n ? -factorInt : factorInt;

  const rawProduct = absP * absFactor;
  const divisor = 10n ** factorDecimals;
  // Round half up (symmetric away from zero)
  const remainder = rawProduct % divisor;
  let quotient = rawProduct / divisor;
  if (remainder * 2n >= divisor) {
    quotient += 1n;
  }
  const signedQuotient = isNegative ? -quotient : quotient;
  return formatPaise(signedQuotient);
}

/**
 * Indian GST Place of Supply and Rate Allocation Contract.
 */
export interface GstTaxBreakdown {
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTaxAmount: string;
  isInterState: boolean;
}

export function computeGstBreakdown(
  exclusiveAmountStr: string,
  totalTaxRate: number | string,
  customerState: string,
  supplierState = "Karnataka"
): GstTaxBreakdown {
  const isInterState = customerState.trim().toLowerCase() !== supplierState.trim().toLowerCase();
  const rateNum = typeof totalTaxRate === "string" ? parseFloat(totalTaxRate) : totalTaxRate;

  if (isInterState) {
    const igstAmount = multiplyMoney(exclusiveAmountStr, rateNum);
    return {
      cgstRate: "0.0000",
      sgstRate: "0.0000",
      igstRate: rateNum.toFixed(4),
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount,
      totalTaxAmount: igstAmount,
      isInterState: true,
    };
  } else {
    const halfRate = rateNum / 2;
    const cgstAmount = multiplyMoney(exclusiveAmountStr, halfRate);
    const sgstAmount = multiplyMoney(exclusiveAmountStr, halfRate);
    const totalTax = formatPaise(parsePaise(cgstAmount) + parsePaise(sgstAmount));
    return {
      cgstRate: halfRate.toFixed(4),
      sgstRate: halfRate.toFixed(4),
      igstRate: "0.0000",
      cgstAmount,
      sgstAmount,
      igstAmount: "0.00",
      totalTaxAmount: totalTax,
      isInterState: false,
    };
  }
}
