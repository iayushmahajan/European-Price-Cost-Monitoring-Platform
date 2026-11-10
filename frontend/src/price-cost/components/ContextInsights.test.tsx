import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ContextInsights } from "./ContextInsights";
import type { ContextInsight } from "../contracts";
const factual: ContextInsight = {
  kind: "factual",
  title: "Recorded price context",
  detail: "The available observations show no price movement.",
  value: null,
  unit: null,
  reference_period: "2026-10-01",
  period: "2026-11-01",
  evidence_paths: ["/v1/price-cost/evidence/fuel/1"],
  estimated: false,
  provisional: false,
};
it("shows a factual fallback without inventing a numerical change or statistical list", () => {
  render(<ContextInsights insights={[factual]} onEvidence={() => {}} />);
  expect(screen.getByText(factual.detail)).toBeInTheDocument();
  expect(
    screen.queryByText(/Average|Observed range|0.00/),
  ).not.toBeInTheDocument();
});
it("uses shared signed formatting and keeps supporting evidence and source annotations accessible", async () => {
  const open = vi.fn();
  render(
    <ContextInsights
      insights={[
        {
          ...factual,
          kind: "conversion_change",
          title: "What changed for 100 GBP",
          value: "-0.0001234567",
          unit: "EUR",
          estimated: true,
          provisional: true,
        },
      ]}
      onEvidence={open}
    />,
  );
  expect(screen.getByText("−0.000123 EUR")).toBeInTheDocument();
  expect(screen.getByText(/estimated and provisional/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Supporting source" }),
  );
  expect(open).toHaveBeenCalledWith(factual.evidence_paths[0]);
});
it("keeps a longer evidence list available through a native disclosure", async () => {
  render(
    <ContextInsights
      insights={[{ ...factual, evidence_paths: ["/one", "/two", "/three"] }]}
      onEvidence={() => {}}
    />,
  );
  const summary = screen.getByText("Supporting evidence (3)");
  await userEvent.click(summary);
  expect(summary.parentElement).toHaveAttribute("open");
  expect(
    screen.getByRole("button", { name: "Source observation 3" }),
  ).toBeVisible();
});
