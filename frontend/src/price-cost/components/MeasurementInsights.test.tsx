import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { pcFixture, fixtureResponse } from "../../test/price-cost-fixtures";
import { MeasurementInsightPanel } from "./MeasurementInsights";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn() },
  errorMessage: () => "Request failed",
}));
beforeEach(() => vi.clearAllMocks());
const metric =
  pcFixture.histories["fuel:DE:automotive_diesel:with_tax"].items.at(-1)!;
it("loads observation-specific history and a labelled purchase example without rounding source values", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: fixtureResponse(url),
  }));
  render(<MeasurementInsightPanel metric={metric} onClose={() => {}} />);
  expect(await screen.findByText("+6.60 EUR")).toBeInTheDocument();
  expect(screen.queryByText("Observed range")).not.toBeInTheDocument();
  expect(
    screen.getByText("How a 50-litre purchase changed"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("At the recent highest recorded price"),
  ).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith(
    `/v1/price-cost/insights/fuel/${metric.observation_id}`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("provides retry without inventing historical context after a request failure", async () => {
  vi.mocked(api.get)
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async (url) => ({ data: fixtureResponse(url) }));
  render(<MeasurementInsightPanel metric={metric} onClose={() => {}} />);
  await screen.findByText("Request failed");
  expect(screen.queryByText("+6.60 EUR")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
  expect(await screen.findByText("+6.60 EUR")).toBeInTheDocument();
});
