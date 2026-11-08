import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Bot, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "./lib/api";
import type { ClarificationTurn, ExampleItem, HistoryItem, QueryResponse, RetailOverview } from "./types/query";
import { QueryInputCard } from "./components/QueryInputCard";
import { HistoryCard } from "./components/HistoryCard";
import { AnalysisResult } from "./components/AnalysisResult";
import { AppShell } from "./components/AppShell";

const OverviewWorkspace = lazy(() => import("./components/MarketWorkspaces").then((module) => ({ default: module.OverviewWorkspace })));
const ExploreWorkspace = lazy(() => import("./components/MarketWorkspaces").then((module) => ({ default: module.ExploreWorkspace })));
const DataWorkspace = lazy(() => import("./components/MarketWorkspaces").then((module) => ({ default: module.DataWorkspace })));

function App() {
  const [question, setQuestion] = useState("");
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState("");
  const [overview, setOverview] = useState<RetailOverview | null>(null);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController(); const config = { signal: controller.signal };
    void Promise.allSettled([api.get<ExampleItem[]>("/examples", config), api.get<HistoryItem[]>("/history", config), api.get<RetailOverview>("/retail/overview", config)]).then(([ex, hist, retail]) => {
      if (controller.signal.aborted) return;
      if (ex.status === "fulfilled") setExamples(ex.value.data);
      if (hist.status === "fulfilled") setHistory(hist.value.data);
      if (retail.status === "fulfilled") setOverview(retail.value.data); else setDashboardFailed(true);
      if ([ex, hist].some((item) => item.status === "rejected")) setNotice("Some workspace data could not load. Your analysis tools are still available.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (result || error) outcomeRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [result, error]);

  async function refreshHistory() { try { setHistory((await api.get<HistoryItem[]>("/history")).data); } catch { setNotice("History could not refresh. Your current analysis is still available."); } }
  async function run(originalQuestion = question, clarification: ClarificationTurn[] = []) {
    if (busy || !originalQuestion.trim()) return;
    setBusy(true); setResult(null); setError(""); setNotice(""); setAnswer("");
    try { setResult((await api.post<QueryResponse>("/query", { question: originalQuestion.trim(), clarification })).data); }
    catch (err: unknown) { setError(errorMessage(err)); }
    finally { setBusy(false); }
    await refreshHistory();
  }
  async function restore(item: HistoryItem) {
    if (busy) return;
    navigate("/analyst"); setBusy(true); setResult(null); setError(""); setNotice(""); setAnswer("");
    try { const response = await api.get<QueryResponse>(`/history/${item.id}`); setResult(response.data); setQuestion(response.data.question); }
    catch (err: unknown) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  const clarificationQuestion = result?.plan?.clarification_question;

  const analyst = <div className="workspace-page analyst-page page-enter">
    <header className="analyst-intro"><div className="analyst-orb" aria-hidden="true"><Bot/></div><div><h1>Ask the market</h1><p>Turn a business question into verified data, a clear answer and inspectable evidence.</p></div><HistoryCard history={history} isLoading={busy} onRefresh={() => void refreshHistory()} onSelectHistoryItem={(item) => void restore(item)}/></header>
    <QueryInputCard question={question} examples={examples} isLoading={busy} onQuestionChange={setQuestion} onSubmit={() => void run()} onClear={() => { setResult(null); setError(""); setAnswer(""); }}/>
    {(notice || error || result) && <div className="query-outcome" ref={outcomeRef}>
      {notice && <p role="status" className="inline-notice"><AlertTriangle/> {notice}</p>}
      {error && <section role="alert" className="error-state"><AlertTriangle/><div><strong>Analysis could not be completed</strong><p>{error}</p></div></section>}
      <div aria-live="polite" aria-busy={busy}>
        {result?.status === "needs_clarification" && <section className="clarification-state" aria-label="Clarification required"><span className="clarification-icon">?</span><div><h2>One detail will make this accurate</h2><p>{clarificationQuestion}</p><small>No query has been executed yet.</small>{result.clarification.length >= 3 ? <p>Please start a new question with the details gathered so far.</p> : <form onSubmit={(event) => { event.preventDefault(); if (clarificationQuestion) void run(result.question, [...result.clarification, { question: clarificationQuestion, answer }]); }}><label className="sr-only" htmlFor="clarification">Your clarification</label><input id="clarification" className="input" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={2000} placeholder="Add the missing detail…"/><button className="clarification-submit" disabled={busy || !answer.trim()}>Continue <ArrowRight/></button></form>}</div></section>}
        {(result?.status === "blocked" || result?.status === "failed") && <section role="alert" className="error-state"><ShieldCheck/><div><strong>{result.status === "blocked" ? "Request not executed" : "Analysis unavailable"}</strong><p>{result.error?.message ?? result.plan?.explanation}</p></div></section>}
        {result?.status === "success" && <AnalysisResult key={result.request_id} result={result} onFollowUp={(next) => { setQuestion(next); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={busy}/>}
      </div>
    </div>}
  </div>;

  return <AppShell><Suspense fallback={<div className="page-state is-loading"><span/><strong>Opening workspace…</strong></div>}><Routes><Route path="/overview" element={<OverviewWorkspace overview={overview} failed={dashboardFailed}/>}/><Route path="/explore" element={<ExploreWorkspace overview={overview} failed={dashboardFailed}/>}/><Route path="/analyst" element={analyst}/><Route path="/data" element={<DataWorkspace overview={overview} failed={dashboardFailed}/>}/><Route path="/" element={<Navigate to="/overview" replace/>}/><Route path="*" element={<Navigate to="/overview" replace/>}/></Routes></Suspense></AppShell>;
}
export default App;
