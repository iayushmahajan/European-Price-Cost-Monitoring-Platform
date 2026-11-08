import { useEffect, useRef, useState } from "react";
import { ArrowUp, History } from "lucide-react";
import { period } from "../format";
import { priceCost, requestError, type Clarification } from "../api";
import type { AnalysisResponse } from "../contracts";
import { AnalystResult } from "../components/AnalystResult";
import { AnalysisHistory } from "../components/AnalysisHistory";
const examples = [
  "Compare diesel prices in Germany and France.",
  "How much has annual inflation changed in Germany?",
  "How many euros per pound?",
];
export default function AnalystPage() {
  const [question, setQuestion] = useState(""),
    [result, setResult] = useState<AnalysisResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clarification, setClarification] = useState(""),
    [history, setHistory] = useState(false),
    [restored, setRestored] = useState(false);
  const [lastRequest, setLastRequest] = useState<{
    question: string;
    clarification: Clarification[];
  } | null>(null);
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    input = useRef<HTMLTextAreaElement>(null),
    outcome = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  function cancel() {
    generation.current++;
    request.current?.abort();
    setBusy(false);
  }
  function edit(value: string) {
    cancel();
    setQuestion(value);
    setResult(null);
    setError("");
    setLastRequest(null);
    setClarification("");
    setRestored(false);
  }
  async function run(original = question, turns: Clarification[] = []) {
    if (!original.trim() || busy) return;
    const payload = { question: original.trim(), clarification: turns };
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 16000) {
      setError(
        "The question and clarification context are too long. Start a shorter question.",
      );
      return;
    }
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    const id = ++generation.current;
    setBusy(true);
    setResult(null);
    setError("");
    setRestored(false);
    setLastRequest(payload);
    try {
      const response = await priceCost.query(payload.question, turns, c.signal);
      if (c.signal.aborted || id !== generation.current) return;
      setResult(response);
      setClarification("");
    } catch (e) {
      if (!c.signal.aborted && id === generation.current)
        setError(requestError(e));
    } finally {
      if (!c.signal.aborted && id === generation.current) {
        setBusy(false);
        setTimeout(() => {
          if (id !== generation.current) return;
          (
            outcome.current?.querySelector<HTMLElement>("#pc-answer") ||
            outcome.current
          )?.focus();
        }, 0);
      }
    }
  }
  async function restore(id: number) {
    cancel();
    setHistory(false);
    const c = new AbortController();
    request.current = c;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    setLastRequest(null);
    try {
      const data = await priceCost.restore(id, c.signal);
      if (c.signal.aborted || version !== generation.current) return;
      setResult(data);
      setQuestion(data.question);
      setClarification("");
      setRestored(true);
    } catch (e) {
      if (!c.signal.aborted && version === generation.current)
        setError(requestError(e));
    } finally {
      if (!c.signal.aborted && version === generation.current) {
        setBusy(false);
        setTimeout(() => {
          if (version !== generation.current) return;
          (
            outcome.current?.querySelector<HTMLElement>("#pc-answer") ||
            outcome.current
          )?.focus();
        }, 0);
      }
    }
  }
  function follow(q: string) {
    edit(q);
    input.current?.focus();
    input.current?.scrollIntoView?.({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  return (
    <>
      <header className="pc-heading">
        <div>
          <span className="pc-kicker">AI Analyst</span>
          <h1>Start with your question.</h1>
        </div>
        <button className="pc-button" onClick={() => setHistory(true)}>
          <History />
          Recent analyses
        </button>
      </header>
      <div className={"pc-analyst-layout" + (result ? " pc-has-result" : "")}>
        <div className="pc-question-zone">
          <form
            className="pc-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="sr-only" htmlFor="pc-question">
              Your price or cost question
            </label>
            <textarea
              id="pc-question"
              ref={input}
              value={question}
              onChange={(e) => edit(e.target.value)}
              placeholder="Ask about a price, a country or a change…"
              maxLength={2000}
              rows={4}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void run();
                }
              }}
            />
            <div>
              <span className="pc-note">
                Official indicators.
                <br />
                Backend-verified calculations.
              </span>
              <button
                className="pc-button pc-primary"
                type="submit"
                aria-label="Analyze question"
                disabled={busy || !question.trim()}
              >
                <ArrowUp />
              </button>
            </div>
          </form>
          <div className="pc-example-questions">
            <span className="pc-note">Example questions</span>
            {examples.map((q) => (
              <button key={q} onClick={() => follow(q)} disabled={busy}>
                {q}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          {lastRequest && lastRequest.clarification.length > 0 && (
            <details>
              <summary>Clarifications supplied</summary>
              {lastRequest.clarification.map((t, i) => (
                <div key={i}>
                  <p>{t.question}</p>
                  <p>{t.answer}</p>
                </div>
              ))}
            </details>
          )}
        </div>
        <div
          className="pc-analysis-outcome"
          tabIndex={-1}
          ref={outcome}
          aria-busy={busy}
        >
          {busy && (
            <div className="pc-canvas pc-state" role="status">
              <h2>Working with verified observations…</h2>
              <p>Interpreting the question and reading the approved data.</p>
              <button className="pc-button" onClick={cancel}>
                Cancel request
              </button>
            </div>
          )}
          {error && (
            <div className="pc-canvas pc-state" role="alert">
              <h2>Analysis could not be completed</h2>
              <p>{error}</p>
              {lastRequest && (
                <button
                  className="pc-button pc-primary"
                  onClick={() =>
                    void run(lastRequest.question, lastRequest.clarification)
                  }
                >
                  Retry analysis
                </button>
              )}
            </div>
          )}
          {!busy && !error && !result && (
            <section className="pc-canvas pc-analyst-empty">
              <span className="pc-kicker">A question, a clear result</span>
              <h2>
                Find the number.
                <br />
                Understand its meaning.
              </h2>
              <p>
                Ask about fuel prices, consumer inflation or EUR reference
                rates. Answers include actual observation periods, sources and
                verified figures.
              </p>
              <p className="pc-note">
                Choose an example or write your own question. No answer has been
                generated yet.
              </p>
            </section>
          )}
          {!busy && result && result.status === "success" && (
            <AnalystResult
              key={result.request_id}
              result={result}
              restored={restored}
              onFollowUp={follow}
            />
          )}
          {!busy && result && result.status === "needs_clarification" && (
            <section className="pc-canvas pc-state" aria-live="polite">
              <h2>One detail to clarify</h2>
              <p>{result.clarification_question || result.answer}</p>
              {result.clarification.length < 3 &&
              result.clarification_question ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(result.question, [
                      ...result.clarification,
                      {
                        question: result.clarification_question!,
                        answer: clarification.trim(),
                      },
                    ]);
                  }}
                >
                  <label className="pc-field">
                    <span>Your clarification</span>
                    <input
                      value={clarification}
                      maxLength={2000}
                      onChange={(e) => setClarification(e.target.value)}
                    />
                  </label>
                  <button
                    className="pc-button pc-primary"
                    disabled={!clarification.trim()}
                  >
                    Continue analysis
                  </button>
                </form>
              ) : (
                <p>Start a new question with the details collected so far.</p>
              )}
            </section>
          )}
          {!busy &&
            result &&
            ["unavailable", "blocked", "failed"].includes(result.status) && (
              <section
                className="pc-canvas pc-state"
                role={result.status === "failed" ? "alert" : "status"}
              >
                <p className="pc-note">
                  {restored ? "Saved analysis · " : ""}Assessed{" "}
                  {period(result.assessment_date)}
                </p>
                <h2>
                  {result.status === "unavailable"
                    ? "No matching observations"
                    : result.status === "blocked"
                      ? "This request is outside the supported scope"
                      : "Analysis unavailable"}
                </h2>
                <p>
                  {result.answer ||
                    result.error?.message ||
                    "Try a supported question with a narrower scope."}
                </p>
                {result.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
                {result.explanation && <p>{result.explanation.what_changed}</p>}
              </section>
            )}
        </div>
      </div>
      {history && (
        <AnalysisHistory
          onClose={() => setHistory(false)}
          onRestore={(id) => void restore(id)}
        />
      )}
    </>
  );
}
