import { expect, it } from "vitest";
import { pcFixture } from "../test/price-cost-fixtures";
import { evidencePresentation } from "./evidence-presentation";
const raw = Object.values(pcFixture.evidence).find(
  (e) => e.domain === "inflation",
)!;
it.each([
  ["e", "Estimated"],
  ["p", "Provisional"],
  ["ep", "Estimated · Provisional"],
  ["unknown_e_flag", "Source annotation"],
  [null, "Status not supplied"],
])("interprets only verified Eurostat flags %s", (status, label) => {
  const e = {
    ...raw,
    original_values: {
      ...raw.original_values,
      status,
      source_status: status,
      measurement_type: "annual_rate",
      value: "2.800000000000",
    },
  };
  const original = JSON.stringify(e);
  const display = evidencePresentation(e, pcFixture.catalogue);
  expect(display.statusLabel).toBe(label);
  expect(display.measurement).toBe("Annual inflation rate");
  expect(display.value).toBe("2.80%");
  expect(JSON.stringify(e)).toBe(original);
});
it("does not apply Eurostat flag meanings to ECB values", () => {
  const e = structuredClone(
    Object.values(pcFixture.evidence).find(
      (e) => e.domain === "exchange-rates",
    )!,
  );
  e.original_values.status = "e";
  expect(evidencePresentation(e, pcFixture.catalogue).statusLabel).toBe(
    "Source annotation",
  );
});
