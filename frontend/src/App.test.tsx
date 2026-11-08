import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { api } from "./lib/api";
import { clarification, result, retailOverview } from "./test/fixtures";

vi.mock("./lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: () => "Request failed.",
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url === "/retail/overview"
      ? retailOverview
      : url.startsWith("/history/")
        ? result
        : url === "/history"
          ? [{ id: 1, question: result.question, dataset: "eurostat", status: "success", row_count: 1, created_at: result.created_at }]
          : [],
  }));
  vi.mocked(api.post).mockResolvedValue({ data: result });
});

async function submit() {
  await userEvent.type(screen.getByLabelText("Ask a question about European retail"), result.question);
  await userEvent.click(screen.getByRole("button", { name: "Ask analyst" }));
}

function renderApp(path = "/analyst") {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

it("shows the single-source dashboard, answer and auditable result", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  renderApp();
  await submit();
  expect(await screen.findByText(result.analysis!.answer)).toBeInTheDocument();
  expect(screen.queryByText(/Eurostat (data )?connected/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/forecast/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/UCI/i)).not.toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(URL.createObjectURL).toHaveBeenCalled();
  click.mockRestore();
});

it("clears stale success when the next request fails", async () => {
  renderApp();
  await submit();
  await screen.findByText(result.analysis!.answer);
  vi.mocked(api.post).mockRejectedValueOnce(new Error("offline"));
  await userEvent.click(screen.getByRole("button", { name: "Ask analyst" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed.");
  expect(screen.queryByText(result.analysis!.answer)).not.toBeInTheDocument();
});

it("continues clarification with original context", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({ data: clarification }).mockResolvedValueOnce({ data: result });
  renderApp();
  await submit();
  await screen.findByText("Which country and retail category should be compared?");
  await userEvent.type(screen.getByLabelText("Your clarification"), "Germany, total retail");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText(result.analysis!.answer);
  expect(api.post).toHaveBeenLastCalledWith("/query", {
    question: result.question,
    clarification: [{ question: "Which country and retail category should be compared?", answer: "Germany, total retail" }],
  });
});

it("scrolls to each completed result", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  renderApp();
  await submit();
  await screen.findByText(result.analysis!.answer);
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
});

it("restores snapshots without another model call", async () => {
  renderApp();
  await waitFor(() => expect(screen.getByText(/1 saved/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Recent analyses/ }));
  await userEvent.click(screen.getByRole("button", { name: new RegExp(result.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  await screen.findByText(result.analysis!.answer);
  expect(api.post).not.toHaveBeenCalled();
});

it("does not discard success when history refresh fails", async () => {
  renderApp();
  await screen.findByText("Ask the market");
  vi.mocked(api.get).mockRejectedValue(new Error("history unavailable"));
  await submit();
  expect(await screen.findByText(/History could not refresh/)).toBeInTheDocument();
  expect(screen.getByText(result.analysis!.answer)).toBeInTheDocument();
});

it("announces initial load errors", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  renderApp("/overview");
  expect(await screen.findByText("Market data unavailable")).toBeInTheDocument();
});

it("handles clipboard denial without losing SQL", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  renderApp();
  await submit();
  await screen.findByText(result.analysis!.answer);
  fireEvent.click(screen.getByText("Inspect SQL"));
  await userEvent.click(screen.getByRole("button", { name: "Copy SQL" }));
  expect(await screen.findByText(/Clipboard unavailable/)).toBeInTheDocument();
});

it("shows purposeful loading feedback while analysis is pending", async () => {
  vi.mocked(api.post).mockImplementationOnce(() => new Promise(() => {}));
  renderApp();
  await userEvent.type(screen.getByLabelText("Ask a question about European retail"), result.question);
  await userEvent.click(screen.getByRole("button", { name: "Ask analyst" }));
  expect(screen.getByRole("button", { name: /Working through the data/ })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Building a query, checking its safety");
});

it("explains an empty successful result without fabricating findings", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({ data: { ...result, columns: [], rows: [], row_count: 0, analysis: null } });
  renderApp();
  await submit();
  expect(await screen.findByText("No matching records were returned.")).toBeInTheDocument();
});

it("leads with a deterministic finding and preserves a long full explanation", async () => {
  const full = "From September 2025 to August 2026, Germany decreased from 100.40 to 99.90 while EU-27 increased from 103.90 to 105, including the validated point and relative changes for both series across the complete comparison window.";
  const conclusion = "In August 2026, Germany was 5.10 index points below EU-27.";
  vi.mocked(api.post).mockResolvedValueOnce({ data: { ...result, analysis: { ...result.analysis!, answer: full, findings: [conclusion, "Germany was below EU-27 in every comparable month."] } } });
  renderApp();
  await submit();
  expect(await screen.findByRole("heading", { name: conclusion })).toBeInTheDocument();
  expect(screen.getByText(full)).not.toBeVisible();
  await userEvent.click(screen.getByText("Evidence & methodology"));
  expect(screen.getByText(full)).toBeVisible();
});
