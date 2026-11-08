import { describe, expect, it } from "vitest";
import { decimal, numeric, safeExternal } from "./format";
import { priceCost } from "./api";
describe("exact source formatting", () => {
  it("rounds decimal digits without losing significant source digits to binary floats", () => {
    expect(decimal("9007199254740993.1235", 3)).toBe("9007199254740993.124");
    expect(decimal("-0.00001", 3)).toBe("0.000");
    expect(decimal("1.199644905107128294")).toBe("1.199644905107128294");
    expect(decimal("0.83358", 5)).toBe("0.83358");
    expect(decimal(null)).toBe("—");
    expect(decimal("1E-18")).toBe("0.000000000000000001");
    expect(decimal("1.2345E+3", 2)).toBe("1234.50");
    expect(numeric("")).toBeNull();
  });
  it("rejects non-finite chart coordinates and unsafe source links", () => {
    expect(numeric("1e999")).toBeNull();
    expect(safeExternal("javascript:alert(1)")).toBeUndefined();
    expect(safeExternal("https://data.ecb.europa.eu/")).toBe(
      "https://data.ecb.europa.eu/",
    );
    expect(() => priceCost.evidence("https://example.com/admin")).toThrow();
  });
});
