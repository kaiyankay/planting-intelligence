import { useEffect, useState } from "react";
import type { LlmStatus, NegotiationAnalysis, SiteAssumptions, Stakeholder, Strategy } from "./types.ts";
import { DEFAULT_SITE, DEFAULT_STAKEHOLDERS } from "./knowledge/site.ts";
import { PLANTS, PRINCIPLES } from "./knowledge/index.ts";
import { fetchStatus, reviseStrategy, runNegotiation } from "./engine/run.ts";
import type { Ctx } from "./engine/strategies.ts";
import Panel01Intentions from "./components/Panel01Intentions.tsx";
import Panel02Negotiation from "./components/Panel02Negotiation.tsx";
import Panel03Strategies from "./components/Panel03Strategies.tsx";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus().then(setStatus);
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await runNegotiation(
        stakeholders.filter((s) => s.statement.trim()),
        site,
        status,
      );
      setAnalysis(r.analysis);
      setStrategies(r.strategies);
      setCtx(r.ctx);
      setNotices(r.notices);
      setSelected(r.strategies[0]?.id ?? null);
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
    try {
      const r = await reviseStrategy(ctx, s, feedback, status);
      setStrategies(strategies.map((x) => (x.id === id ? r.strategy : x)));
      if (r.notices.length) setNotices((n) => [...n, ...r.notices]);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRevising(false);
    }
  };

  const sourced = PRINCIPLES.filter((p) => p.type === "sourced_principle").length;

  return (
    <>
      <header className="masthead">
        <div>
          <h1>Planting Intelligence</h1>
          <div className="sub">Exploring knowledge-driven AI for planting design · a negotiation prototype</div>
        </div>
        <div className="right">
          <div className="kb">
            <span>
              <b>{PLANTS.length}</b> sourced plant records
            </span>
            <span>
              <b>{sourced}</b> sourced principles · <b>{PRINCIPLES.length - sourced}</b> heuristic
            </span>
          </div>
          <div className={`mode ${status.available ? "live" : ""}`}>
            <span className="dot" />
            {status.available ? `Live LLM · ${status.model}` : "Offline demonstration mode · no API key"}
          </div>
        </div>
      </header>
      <div className="layout">
        <aside className="rail">
          <Panel01Intentions stakeholders={stakeholders} onChange={setStakeholders} site={site} onSite={setSite} onRun={run} running={running} />
        </aside>
        <main className="main">
          <Panel02Negotiation analysis={analysis} stakeholders={stakeholders} status={status} notices={notices} error={error} running={running} />
          <Panel03Strategies strategies={strategies} analysis={analysis} selectedId={selected} onSelect={setSelected} onRevise={revise} revising={revising} status={status} />
        </main>
      </div>
    </>
  );
}
