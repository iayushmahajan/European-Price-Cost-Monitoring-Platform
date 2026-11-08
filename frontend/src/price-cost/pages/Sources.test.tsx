import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { fixtureResponse, pcFixture } from "../../test/price-cost-fixtures";
import Sources from "./Sources";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn() },
  errorMessage: () => "Request failed",
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url.endsWith("/sources")
      ? [
          {
            ...pcFixture.sources[0],
            synchronization_status: "failed",
            observation_freshness: "current",
          },
        ]
      : fixtureResponse(url),
  }));
});
it("separates fresh observations from a failed synchronization and exposes actual date fields", async () => {
  render(<Sources />);
  const row = await screen.findByRole("button", {
    name: /European Commission/,
  });
  expect(row).toHaveTextContent("current");
  expect(row).toHaveTextContent("failed");
  await userEvent.click(row);
  const d = await screen.findByRole("dialog");
  expect(within(d).getByText("Last successful sync")).toBeInTheDocument();
  expect(within(d).getByText("Artifact publication date")).toBeInTheDocument();
  await userEvent.click(within(d).getByText("Series coverage"));
  expect(await within(d).findByRole("table")).toHaveTextContent("Germany");
});

it("reports a successful check independently of stale observations", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url.endsWith("/sources")
      ? [
          {
            ...pcFixture.sources[0],
            synchronization_status: "stale",
            observation_freshness: "stale",
          },
        ]
      : fixtureResponse(url),
  }));
  render(<Sources />);
  const row = await screen.findByRole("button", {
    name: /European Commission/,
  });
  expect(row).toHaveTextContent("Observation freshnessstale");
  expect(row).toHaveTextContent("Synchronization healthSucceeded");
});
