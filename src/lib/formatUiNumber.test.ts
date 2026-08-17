import { describe, expect, it } from "vitest";
import { formatUiNumber } from "./formatUiNumber";

describe("formatUiNumber", () => {
  it("shows at most two decimal places without trailing zeroes", () => {
    expect(formatUiNumber(189.99999999999974)).toBe("190");
    expect(formatUiNumber(0.7899999999999978)).toBe("0.79");
    expect(formatUiNumber(120.5)).toBe("120.5");
  });

  it("rounds decimal edge cases and normalizes negative zero", () => {
    expect(formatUiNumber(1.005)).toBe("1.01");
    expect(formatUiNumber(-1.005)).toBe("-1.01");
    expect(formatUiNumber(-0.0001)).toBe("0");
  });

  it("caps requested precision and handles non-finite values", () => {
    expect(formatUiNumber(1.2345, 8)).toBe("1.23");
    expect(formatUiNumber(Number.NaN)).toBe("—");
    expect(formatUiNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
