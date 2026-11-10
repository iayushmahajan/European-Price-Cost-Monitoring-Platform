import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { pcFixture } from "../../test/price-cost-fixtures";
import { CatalogueContext } from "../catalogue-context";
import EvidencePanel from "./Evidence";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn() },
  errorMessage: () => "Request failed",
}));
beforeEach(() => vi.clearAllMocks());
it("prioritizes readable evidence and preserves exact values/publication availability in compact disclosures", async () => {
  const e = structuredClone(
    Object.values(pcFixture.evidence).find((e) => e.domain === "inflation")!,
  );
  e.original_values = {
    ...e.original_values,
    value: "2.800000000000",
    status: "e",
    measurement_type: "annual_rate",
  };
  e.observation_publication_date = null;
  e.artifact.publication_date = null;
  vi.mocked(api.get).mockResolvedValue({ data: e });
  render(
    <MemoryRouter>
      <CatalogueContext.Provider value={pcFixture.catalogue}>
        <EvidencePanel
          path="/v1/price-cost/evidence/inflation/900"
          onClose={() => {}}
        />
      </CatalogueContext.Provider>
    </MemoryRouter>,
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByRole("heading", {
      name: "Annual inflation rate",
    }),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("2.80%")).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Eurostat marks this observation as an estimated value.",
    ),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByText("Observation publication date"),
  ).not.toBeVisible();
  const exact = within(dialog).getByText("Exact values", { exact: true });
  expect(
    dialog.querySelector(".pc-evidence-disclosures details"),
  ).not.toHaveAttribute("open");
  exact.focus();
  await userEvent.click(exact);
  expect(within(dialog).getByText(/2.800000000000/)).toBeVisible();
  await userEvent.click(
    within(dialog).getByText("Methodology & provenance", { exact: true }),
  );
  expect(
    within(dialog).getAllByText("Not available in this record"),
  ).toHaveLength(2);
  expect(within(dialog).getByText(e.artifact.sha256)).toBeVisible();
  await userEvent.click(
    within(dialog).getByText("Revisions (1)", { exact: true }),
  );
  expect(
    within(dialog).getByText(/"previous":/),
  ).toBeVisible();
});
