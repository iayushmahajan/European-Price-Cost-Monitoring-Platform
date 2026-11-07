import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
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
  await userEvent.type(screen.getByLabelText("What would you like to understand?"), result.question);
  await userEvent.click(screen.getByRole("button", { name: "Analyze market" }));
}

it("shows the single-source dashboard, answer and auditable result", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<App />);
  await submit();
  expect(await screen.findByText(result.analysis!.answer)).toBeInTheDocument();
  expect(screen.getByText("Eurostat · EU-27")).toBeInTheDocument();
  expect(screen.queryByText(/forecast/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/UCI/i)).not.toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(URL.createObjectURL).toHaveBeenCalled();
  click.mockRestore();
});

it("clears stale success when the next request fails", async () => {
  render(<App />);
  await submit();
  await screen.findByText(result.analysis!.answer);
  vi.mocked(api.post).mockRejectedValueOnce(new Error("offline"));
  await userEvent.click(screen.getByRole("button", { name: "Analyze market" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed.");
  expect(screen.queryByText(result.analysis!.answer)).not.toBeInTheDocument();
});

it("continues clarification with original context", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({ data: clarification }).mockResolvedValueOnce({ data: result });
  render(<App />);
  await submit();
  await screen.findByText("Which country and retail category should be compared?");
  await userEvent.type(screen.getByLabelText("Your clarification"), "Germany, total retail");
  await userEvent.click(screen.getByRole("button", { name: "Continue analysis" }));
  await screen.findByText(result.analysis!.answer);
  expect(api.post).toHaveBeenLastCalledWith("/query", {
    question: result.question,
    clarification: [{ question: "Which country and retail category should be compared?", answer: "Germany, total retail" }],
  });
});

it("scrolls to each completed result", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<App />);
  await submit();
  await screen.findByText(result.analysis!.answer);
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
});

it("restores snapshots without another model call", async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByText(/1 saved/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Recent analyses/ }));
  await userEvent.click(screen.getByRole("button", { name: new RegExp(result.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  await screen.findByText(result.analysis!.answer);
  expect(api.post).not.toHaveBeenCalled();
});

it("does not discard success when history refresh fails", async () => {
  render(<App />);
  await screen.findByText("European retail intelligence");
  vi.mocked(api.get).mockRejectedValue(new Error("history unavailable"));
  await submit();
  expect(await screen.findByText(/History could not refresh/)).toBeInTheDocument();
  expect(screen.getByText(result.analysis!.answer)).toBeInTheDocument();
});

it("announces initial load errors", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  render(<App />);
  expect(await screen.findByText(/Some workspace data could not load/)).toBeInTheDocument();
  expect(screen.getByText("Market dashboard unavailable")).toBeInTheDocument();
});

it("handles clipboard denial without losing SQL", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<App />);
  await submit();
  await screen.findByText(result.analysis!.answer);
  fireEvent.click(screen.getByText("Inspect SQL"));
  await userEvent.click(screen.getByRole("button", { name: "Copy SQL" }));
  expect(await screen.findByText(/Clipboard unavailable/)).toBeInTheDocument();
});
