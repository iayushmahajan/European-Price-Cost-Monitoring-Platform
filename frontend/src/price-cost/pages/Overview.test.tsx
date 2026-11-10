import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { fixtureResponse } from "../../test/price-cost-fixtures";
import type { Overview as OverviewResponse } from "../contracts";
import { CatalogueProvider } from "../catalogue";
import Overview from "./Overview";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn() },
  errorMessage: () => "Request failed",
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: fixtureResponse(url),
  }));
});
function open(query = "") {
  return render(
    <MemoryRouter initialEntries={["/app/overview" + query]}>
      <CatalogueProvider>
        <Overview />
      </CatalogueProvider>
    </MemoryRouter>,
  );
}
it("connects the selected fuel, dates, comparison, trend and Explore scope", async () => {
  open();
  expect(
    await screen.findByRole("heading", { name: "Diesel" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Week of 2 Nov 2026").length).toBeGreaterThan(0);
  expect(screen.getByText("€2.282")).toBeInTheDocument();
  expect(screen.getByText("Previous available week")).toBeInTheDocument();
  expect(screen.getByText(/Compared with/)).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", {
      name: "Diesel prices · 12 Oct–2 Nov 2026",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Investigate in Explore/ }),
  ).toHaveAttribute(
    "href",
    expect.stringContaining("product=automotive_diesel"),
  );
  expect(screen.queryByLabelText("Fuel product")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Petrol \(95\)/ }));
  expect(
    await screen.findByRole("heading", { name: "Petrol (95)" }),
  ).toBeInTheDocument();
  expect(screen.getByText("€2.128")).toBeInTheDocument();
});
it("switches supporting inflation indicators without introducing Explore controls", async () => {
  open();
  await userEvent.click(
    await screen.findByRole("button", { name: /^Annual inflation/ }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Annual inflation",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("2.80%")).toBeInTheDocument();
  expect(
    await screen.findByText(/same month one year earlier/),
  ).toBeInTheDocument();
  expect(screen.getByText(/percentage points/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: /^Monthly inflation/ }),
  );
  expect(
    await screen.findByRole("heading", {
      name: "Monthly inflation",
    }),
  ).toBeInTheDocument();
  expect(await screen.findByText(/preceding month/)).toBeInTheDocument();
});
it("keeps source problems distinct from dated observations and hides raw statuses", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const data = structuredClone(fixtureResponse(url));
    if (url.includes("/overview?")) {
      const r = data as OverviewResponse;
      const m = r.fuel.items[0];
      m.observation_freshness = "stale";
      m.status.source_status = "RAW_ANNOTATION";
      m.comparison.consecutive = false;
      m.comparison.elapsed_days = 21;
      m.comparison.reference_period = "2026-10-12";
      r.fuel.sources[0].synchronization_status = "failed";
    }
    return { data };
  });
  open();
  expect(
    await screen.findByText(/latest source check failed/),
  ).toBeInTheDocument();
  expect(screen.getByText(/21 days apart/)).toBeInTheDocument();
  expect(screen.getAllByText("Older than expected").length).toBeGreaterThan(0);
  expect(screen.getByText("Source annotation in evidence")).toBeInTheDocument();
  expect(screen.queryByText("RAW_ANNOTATION")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: /Inspect source evidence/ }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent("Exact values");
});
it("labels official EUR direction and keeps source dates in progressive disclosure", async () => {
  open("?domain=exchange-rates");
  expect(
    await screen.findByRole("heading", { name: "Euro to GBP" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/1 EUR ≈ 0.834 GBP/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Source dates & checks"));
  expect(screen.getByText("Last successful source check")).toBeInTheDocument();
  expect(
    screen.getByText("Latest source publication date"),
  ).toBeInTheDocument();
});
it("keeps index levels distinct and exposes a readable history table", async () => {
  open("?domain=inflation&measurement=index&view=table");
  expect(
    await screen.findByRole("heading", {
      name: "Consumer price index",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("103.80")).toBeInTheDocument();
  expect(await screen.findByText(/not percentage changes/)).toBeInTheDocument();
  const table = await screen.findByRole("region", {
    name: "Historical observations table",
  });
  expect(within(table).getByRole("table")).not.toHaveTextContent(
    "Source status:",
  );
  expect(within(table).getByRole("table")).toHaveTextContent("index points");
});
it("keeps source details collapsed and toggles them with keyboard without moving the footer content", async () => {
  open();
  const toggle = await screen.findByRole("button", {
    name: "Source dates & checks",
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  const details = document.getElementById(
    toggle.getAttribute("aria-controls")!,
  );
  expect(details).not.toBeVisible();
  expect(details).toHaveAttribute("hidden");
  toggle.focus();
  await userEvent.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(details).toBeVisible();
  expect(details).toHaveTextContent("Last successful source check");
  expect(toggle).toHaveFocus();
  await userEvent.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(details).not.toBeVisible();
  expect(toggle).toHaveFocus();
});
it("uses available monthly coverage rather than limiting inflation to three months", async () => {
  open("?domain=inflation");
  expect(
    await screen.findByRole("heading", {
      name: "Annual inflation rate · May–Oct 2026",
    }),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/Each monthly observation/)).toHaveLength(1);
  expect(
    screen.getByText(/6 monthly observations available/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Load more observations" }),
  ).not.toBeInTheDocument();
});
it("lazily shows same-month 2025/2026 index evidence without recalculating the annual rate", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const data = structuredClone(fixtureResponse(url));
    if (
      url.includes("/inflation/history?") &&
      new URL(url, "http://test").searchParams.get("measurement") === "index"
    ) {
      const r = data as import("../contracts").InflationResponse;
      r.items = [
        ...r.items.map((m, i) => ({
          ...m,
          period: m.period.replace("2026-", "2025-"),
          value: "90.123456789",
          observation_id: 20000 + i,
        })),
        ...r.items,
      ];
    }
    return { data };
  });
  open("?domain=inflation");
  await screen.findByRole("heading", {
    name: "Annual inflation rate · May–Oct 2026",
  });
  expect(
    vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => String(url).includes("measurement=index")),
  ).toHaveLength(0);
  await userEvent.click(screen.getByText("Inspect matching HICP index months"));
  const region = await screen.findByRole("region", {
    name: "Matching HICP index months",
  });
  expect(
    within(region).getByRole("columnheader", { name: "2025 index" }),
  ).toBeInTheDocument();
  expect(
    within(region).getByRole("columnheader", { name: "2026 index" }),
  ).toBeInTheDocument();
  expect(within(region).getAllByText("90.12")).toHaveLength(6);
  expect(screen.getByText("2.80%")).toBeInTheDocument();
  expect(screen.getByText(/no rate is recalculated/)).toBeInTheDocument();
  await userEvent.click(
    within(region).getByRole("button", {
      name: "Inspect May 2026 index evidence",
    }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent("Exact values");
});
it("shows missing matching index months as unavailable rather than zero", async () => {
  open("?domain=inflation");
  await screen.findByRole("heading", {
    name: "Annual inflation rate · May–Oct 2026",
  });
  await userEvent.click(screen.getByText("Inspect matching HICP index months"));
  const region = await screen.findByRole("region", {
    name: "Matching HICP index months",
  });
  expect(within(region).getAllByText("Not available")).toHaveLength(6);
  expect(
    screen.getByText(/Some matching index months are not available/),
  ).toBeInTheDocument();
});
