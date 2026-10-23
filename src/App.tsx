import { useEffect, useState } from "react";
import type { LlmStatus, NegotiationAnalysis, SiteAssumptions, Stakeholder, Strategy } from "./types.ts";
import { DEFAULT_SITE, DEFAULT_STAKEHOLDERS } from "./knowledge/site.ts";
import { PLANTS, PRINCIPLES } from "./knowledge/index.ts";
import { fetchStatus, reviseStrategy, runNegotiation } from "./engine/run.ts";
import type { Ctx } from "./engine/strategies.ts";
import Panel01Intentions from "./components/Panel01Intentions.tsx";
import NegotiationSummary from "./components/NegotiationSummary.tsx";
import StrategyCards from "./components/StrategyCards.tsx";
import Feedback from "./components/Feedback.tsx";

export default function App() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(DEFAULT_STAKEHOLDERS);
  const [site, setSite] = useState<SiteAssumptions>(DEFAULT_SITE);
  const [status, setStatus] = useState<LlmStatus>({ available: false, mode: "offline_demonstration" });
  const [analysis, setAnalysis] = useState<NegotiationAnalysis | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [revising, setRevising] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [feedbackNotices, setFeedbackNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus().then(setStatus);
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    setFeedbackNotices([]);
    try {
      const r = await runNegotiation(stakeholders.filter((s) => s.statement.trim()), site, status);
      setAnalysis(r.analysis);
      setStrategies(r.strategies);
      setCtx(r.ctx);
      setNotices(r.notices);
      setSelected(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const revise = async (id: string, feedback: string) => {
    if (!ctx) return;
    const s = strategies.find((x) => x.id === id);
    if (!s) return;
    setRevising(true);
    setFeedbackNotices([]);
    try {
      const r = await reviseStrategy(ctx, s, feedback, status);
      setStrategies(strategies.map((x) => (x.id === id ? r.strategy : x)));
      setFeedbackNotices(r.notices);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRevising(false);
    }
  };

  const sourced = PRINCIPLES.filter((p) => p.type === "sourced_principle").length;
  const stage = !analysis ? 1 : selected ? 4 : 2;
  const selectedStrategy = strategies.find((s) => s.id === selected) ?? null;

  return (
    <>
      <header className="masthead">
        <div>
          <h1>Planting Intelligence</h1>
          <div className="sub">
            Knowledge-driven AI for planting design · {PLANTS.length} sourced plant records, {sourced} sourced principles, {PRINCIPLES.length - sourced} heuristic ·{" "}
            <a href="https://github.com/kaiyankay/planting-intelligence/blob/main/docs/IMAGE-CREDITS.md" target="_blank" rel="noreferrer">
              image credits
            </a>
          </div>
        </div>
        <div className="flow" aria-label="How it works">
          {["Different intentions", "Common ground and trade-offs", "Alternative strategies", "Your feedback"].map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              <span className={`step ${stage >= i + 1 ? "on" : ""}`}>
                <b>{i + 1}</b>
                {t}
              </span>
              {i < 3 && <span className="sep">—</span>}
            </span>
          ))}
        </div>
        <div className={`mode ${status.available ? "live" : ""}`} title={status.available ? "Statements and feedback are read by a live model; plant facts are still checked by code." : "No API key on the server: statements are read by a transparent rule parser and explanatory text is template-based. Plant facts are checked by code either way."}>
          <span className="dot" />
          {status.available ? `Live model · ${status.model}` : "Offline demonstration mode"}
        </div>
      </header>
      <div className="layout">
        <aside className="rail">
          <Panel01Intentions stakeholders={stakeholders} onChange={setStakeholders} site={site} onSite={setSite} onRun={run} running={running} />
        </aside>
        <main className="main">
          <NegotiationSummary analysis={analysis} stakeholders={stakeholders} status={status} notices={notices} error={error} running={running} />
          <StrategyCards strategies={strategies} analysis={analysis} selectedId={selected} onSelect={setSelected} />
          <Feedback strategy={selectedStrategy} analysis={analysis} onRevise={revise} revising={revising} status={status} notices={feedbackNotices} />
        </main>
      </div>
    </>
  );
}
