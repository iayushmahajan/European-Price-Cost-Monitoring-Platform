import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./lib/api";
import type {
  ClarificationTurn,
  ExampleItem,
  HistoryItem,
  QueryResponse,
  RetailOverview,
} from "./types/query";
import { QueryInputCard } from "./components/QueryInputCard";
import { HistoryCard } from "./components/HistoryCard";
import { AnalysisResult } from "./components/AnalysisResult";
import { AppShell } from "./components/AppShell";

const RetailDashboard = lazy(() =>
  import("./components/RetailDashboard").then((module) => ({
    default: module.RetailDashboard,
  })),
);

function App() {
  const [question, setQuestion] = useState("");
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState("");
  const outcomeRef = useRef<HTMLDivElement>(null);
  const [overview, setOverview] = useState<RetailOverview | null>(null);
  const [dashboardFailed, setDashboardFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const config = { signal: controller.signal };
    void Promise.allSettled([
      api.get<ExampleItem[]>("/examples", config),
      api.get<HistoryItem[]>("/history", config),
      api.get<RetailOverview>("/retail/overview", config),
    ]).then(([ex, hist, retail]) => {
      if (controller.signal.aborted) return;
      if (ex.status === "fulfilled") setExamples(ex.value.data);
      if (hist.status === "fulfilled") setHistory(hist.value.data);
      if (retail.status === "fulfilled") setOverview(retail.value.data);
      else setDashboardFailed(true);
      if ([ex, hist].some((item) => item.status === "rejected"))
        setNotice(
          "Some workspace data could not load. You can retry history below or reload the page.",
        );
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (result || error) {
      outcomeRef.current?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [result, error]);

  async function refreshHistory() {
    try {
      setHistory((await api.get<HistoryItem[]>("/history")).data);
    } catch {
      setNotice(
        "History could not refresh. Your current analysis is still available.",
      );
    }
  }
  async function run(
    originalQuestion = question,
    clarification: ClarificationTurn[] = [],
  ) {
    if (busy || !originalQuestion.trim()) return;
    setBusy(true);
    setResult(null);
    setError("");
    setNotice("");
    setAnswer("");
    try {
      const response = await api.post<QueryResponse>("/query", {
        question: originalQuestion.trim(),
        clarification,
      });
      setResult(response.data);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
    await refreshHistory();
  }
  async function restore(item: HistoryItem) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    setNotice("");
    setAnswer("");
    try {
      const response = await api.get<QueryResponse>(`/history/${item.id}`);
      setResult(response.data);
      setQuestion(response.data.question);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const clarificationQuestion = result?.plan?.clarification_question;
  return (
    <AppShell>
      <Suspense fallback={<div className="dashboard-empty">Loading market dashboard…</div>}>
        <RetailDashboard overview={overview} failed={dashboardFailed} />
      </Suspense>
      <section className="analyst-section workspace-section" id="analyst"><div className="analyst-heading"><p className="eyebrow">DATA ANALYST</p><h2>Ask the retail market data</h2><p>Ask about countries, categories, trends, volatility or unusual movements, then inspect the result and generated SQL.</p></div>
      <div className="space-y-5">
        <QueryInputCard
          question={question}
          examples={examples}
          isLoading={busy}
          onQuestionChange={setQuestion}
          onSubmit={() => void run()}
          onClear={() => {
            setResult(null);
            setError("");
            setAnswer("");
          }}
        />
        {(notice || error || result) && <div className="query-outcome" ref={outcomeRef}>
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div aria-live="polite" aria-busy={busy}>
          {result?.status === "needs_clarification" && (
            <section
              className="panel border-amber-300"
              aria-label="Clarification required"
            >
              <h2 className="text-lg font-semibold">
                One detail before we query
              </h2>
              <p className="mt-2 text-slate-700">{clarificationQuestion}</p>
              <p className="mt-1 text-xs text-slate-500">
                Original question: {result.question} · No SQL has been executed.
              </p>
              {result.clarification.length >= 3 ? (
                <p className="mt-4 text-amber-800">
                  Please start a new question with the details gathered so far.
                </p>
              ) : (
                <form
                  className="mt-4 flex flex-col gap-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (clarificationQuestion)
                      void run(result.question, [
                        ...result.clarification,
                        { question: clarificationQuestion, answer },
                      ]);
                  }}
                >
                  <label className="sr-only" htmlFor="clarification">
                    Your clarification
                  </label>
                  <input
                    id="clarification"
                    className="input"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    maxLength={2000}
                  />
                  <button
                    className="primary shrink-0"
                    disabled={busy || !answer.trim()}
                  >
                    Continue analysis
                  </button>
                </form>
              )}
            </section>
          )}
          {(result?.status === "blocked" || result?.status === "failed") && (
            <section role="alert" className="panel border-amber-300">
              <h2 className="font-semibold">
                {result.status === "blocked"
                  ? "Request not executed"
                  : "Analysis unavailable"}
              </h2>
              <p className="mt-2 text-slate-700">
                {result.error?.message ?? result.plan?.explanation}
              </p>
            </section>
          )}
          {result?.status === "success" && (
            <AnalysisResult
              key={result.request_id}
              result={result}
              onFollowUp={setQuestion}
              disabled={busy}
            />
          )}
        </div>
        </div>}
        <HistoryCard
          history={history}
          isLoading={busy}
          onRefresh={() => void refreshHistory()}
          onSelectHistoryItem={(item) => void restore(item)}
        />
      </div>
      </section>
      <footer className="app-footer">Source: Eurostat monthly retail trade volume indices, seasonally and calendar adjusted, 2021=100. Dashboard metrics and natural-language queries use the same imported observations. Do not enter personal or confidential information.</footer>
    </AppShell>
  );
}
export default App;
