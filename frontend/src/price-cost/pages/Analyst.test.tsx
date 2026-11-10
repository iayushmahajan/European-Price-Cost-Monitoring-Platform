import { analystAnswer } from "../analyst-presentation";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { fixtureResponse, pcFixture } from "../../test/price-cost-fixtures";
import Analyst from "./Analyst";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: () => "Request failed",
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: fixtureResponse(url),
  }));
  vi.mocked(api.post).mockResolvedValue({ data: pcFixture.analysis });
});
async function ask(q = "Compare diesel prices in Germany and France.") {
  await userEvent.type(screen.getByLabelText("Your price or cost question"), q);
  await userEvent.click(
    screen.getByRole("button", { name: "Analyze question" }),
  );
}
it("starts empty and renders backend findings, exact table and follow-ups only after submission", async () => {
  render(<Analyst />);
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByText("Try a question")).toBeInTheDocument();
  await ask();
  expect(
    await screen.findByRole("heading", {
      name: analystAnswer(pcFixture.analysis),
    }),
  ).toBeInTheDocument();
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Analysis presentation" }),
    ).getByRole("button", { name: "Table" }),
  );
  const readable = screen.getByRole("region", {
    name: "Verified analysis table",
  });
  expect(within(readable).getByRole("table")).toHaveTextContent("2.282 EUR/L");
  expect(within(readable).queryByText("Source status")).not.toBeInTheDocument();
  expect(screen.queryByText("Try a question")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Sources, evidence & details"));
  await userEvent.click(screen.getByText("Full data & source precision"));
  expect(
    within(
      screen.getByRole("region", { name: "Full analysis data" }),
    ).getByRole("table"),
  ).toHaveTextContent("Source status");
  await userEvent.click(
    screen.getByRole("button", {
      name: pcFixture.analysis.follow_up_questions[0],
    }),
  );
  expect(screen.getByLabelText("Your price or cost question")).toHaveValue(
    pcFixture.analysis.follow_up_questions[0],
  );
  expect(api.post).toHaveBeenCalledTimes(1);
});
it("continues clarification with original question and all answers", async () => {
  const clarification = {
    ...pcFixture.analysis,
    status: "needs_clarification",
    question: "Compare fuel prices",
    answer: "",
    findings: [],
    evidence: [],
    verified_data: null,
    table: { rows: [], columns: [] },
    row_count: 0,
    plan: { status: "needs_clarification", reason: "countries" },
    clarification: [],
    clarification_question: "Which countries should be compared?",
  };
  vi.mocked(api.post).mockResolvedValueOnce({ data: clarification });
  render(<Analyst />);
  await ask("Compare fuel prices");
  await screen.findByText("Which countries should be compared?");
  await userEvent.type(
    screen.getByLabelText("Your clarification"),
    "Germany and France",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Continue analysis" }),
  );
  await screen.findByRole("heading", {
    name: analystAnswer(pcFixture.analysis),
  });
  expect(api.post).toHaveBeenLastCalledWith(
    "/v1/price-cost/analyst/query",
    {
      question: "Compare fuel prices",
      clarification: [
        {
          question: "Which countries should be compared?",
          answer: "Germany and France",
        },
      ],
    },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("does not replace a provider failure with a fabricated result", async () => {
  vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 429 } });
  render(<Analyst />);
  await ask();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "too many requests",
  );
  expect(
    screen.queryByText(analystAnswer(pcFixture.analysis)),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Your price or cost question")).toHaveValue(
    pcFixture.analysis.question,
  );
});
it("restores price-cost history without making a model call", async () => {
  render(<Analyst />);
  await userEvent.click(
    screen.getByRole("button", { name: "Recent analyses" }),
  );
  const d = await screen.findByRole("dialog");
  await userEvent.click(
    await within(d).findByRole("button", {
      name: new RegExp(pcFixture.analysis.question.replace(/[.]/g, "\\.")),
    }),
  );
  await screen.findByRole("heading", {
    name: analystAnswer(pcFixture.analysis),
  });
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByText(/Saved analysis · assessed/)).toBeInTheDocument();
});
it("rejects malformed/wrong-domain analytical responses", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({
    data: { ...pcFixture.analysis, dataset: "eurostat" },
  });
  render(<Analyst />);
  await ask();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be verified",
  );
  expect(
    screen.queryByText(analystAnswer(pcFixture.analysis)),
  ).not.toBeInTheDocument();
});
it("ignores late answers after the composer changes", async () => {
  let complete!: (v: unknown) => void;
  vi.mocked(api.post).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  render(<Analyst />);
  await ask();
  const config = vi.mocked(api.post).mock.calls[0][2]!;
  await userEvent.type(
    screen.getByLabelText("Your price or cost question"),
    " New scope",
  );
  expect(config.signal?.aborted).toBe(true);
  await act(async () => complete({ data: pcFixture.analysis }));
  expect(
    screen.queryByText(analystAnswer(pcFixture.analysis)),
  ).not.toBeInTheDocument();
});
it.each(["unavailable", "blocked", "failed"] as const)(
  "renders backend %s without presenting numerical success",
  async (status) => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        ...pcFixture.analysis,
        status,
        answer:
          status === "failed"
            ? ""
            : "No supported observations for this request.",
        verified_data: null,
        table: { rows: [], columns: [] },
        findings: [],
        evidence: [],
        error:
          status === "failed"
            ? { code: "provider_unavailable", message: "Provider unavailable." }
            : null,
      },
    });
    render(<Analyst />);
    await ask();
    expect(
      await screen.findByText(
        status === "unavailable"
          ? "No matching observations"
          : status === "blocked"
            ? "This request is outside the supported scope"
            : "Analysis unavailable",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(analystAnswer(pcFixture.analysis)),
    ).not.toBeInTheDocument();
  },
);
it("handles unsupported saved versions without calling the model", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url.endsWith("/history/1")) throw { response: { status: 409 } };
    return { data: fixtureResponse(url) };
  });
  render(<Analyst />);
  await userEvent.click(
    screen.getByRole("button", { name: "Recent analyses" }),
  );
  const d = await screen.findByRole("dialog");
  await userEvent.click(
    await within(d).findByRole("button", {
      name: new RegExp("Compare diesel"),
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "cannot be restored",
  );
  expect(api.post).not.toHaveBeenCalled();
});

it.each([
  [502, "invalid_model_output", "couldn’t safely interpret"],
  [503, "provider_unavailable", "unavailable"],
  [429, "provider_rate_limited", "temporarily rate-limited"],
] as const)(
  "retries HTTP %s with the original payload and can clear the composer",
  async (status, code, message) => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        status,
        data: { error: { code, message: "Untrusted provider detail" } },
      },
    });
    render(<Analyst />);
    expect(screen.queryByText(/Ctrl or/)).not.toBeInTheDocument();
    await ask();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Untrusted provider detail",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry analysis" }),
    );
    await screen.findByRole("heading", {
      name: analystAnswer(pcFixture.analysis),
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.post).mock.calls[1][1]).toEqual(
      vi.mocked(api.post).mock.calls[0][1],
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear question" }),
    );
    expect(screen.getByLabelText("Your price or cost question")).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Your price or cost question")).toHaveFocus();
    expect(screen.getByText("Try a question")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  },
);
