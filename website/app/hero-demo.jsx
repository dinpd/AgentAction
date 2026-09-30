"use client";

import { useEffect, useRef, useState } from "react";
import { advance, initialState, planFor, scenarios, servers } from "../public/demo/engine.js";

const labels = { crm: "CRM", orders: "Orders", history: "History", payments: "Payments", messaging: "Messaging" };
const cleanups = { "customer.get": "Personal fields excluded", "order.get": "Untrusted instructions excluded", "claims.history": "Only relevant history retained", "charges.list": "Payment credentials redacted", "cases.read": "Untrusted case notes excluded", "email.send": "Internal identifiers removed" };

export function HeroDemo() {
  const [state, setState] = useState(() => advance(initialState()));
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef(null);
  const started = useRef(false);
  const inView = useRef(false);
  const event = state.events.at(-1);
  const plan = planFor(state.scenario);
  const complete = state.cursor === plan.length;
  const running = playing && visible && !complete;
  const history = state.facts.find(f => f.kind === "history");

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      setVisible(entry.isIntersecting && !document.hidden);
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
      }
    }, { threshold: 0.3 });
    observer.observe(root.current);
    const visibility = () => setVisible(inView.current && !document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setState(previous => advance(previous)), 2600);
    return () => clearInterval(timer);
  }, [running, state.scenario]);

  const reset = (scenario = state.scenario) => {
    setPlaying(false);
    setState(advance(initialState(scenario)));
  };
  const toggle = () => {
    if (complete) { setState(advance(initialState(state.scenario))); setPlaying(true); }
    else setPlaying(previous => !previous);
  };
  const inspect = index => {
    setPlaying(false);
    let next = initialState(state.scenario);
    while (next.cursor <= index) next = advance(next);
    setState(next);
  };

  return (
    <div className="hero-demo" ref={root} role="region" aria-label="Interactive multi-MCP authorization demo">
      <div className="hd-header"><span>authorization.sequence</span><span className="hd-simulation">Synthetic demo</span></div>
      <div className="hd-servers" aria-label="Five simulated MCP servers">
        {servers.map(server => (
          <div key={server.id} className={`hd-server${server.id === event.server ? " is-active" : ""}`} title={`${server.name} MCP server`}>
            <span className="hd-server-dot" aria-hidden="true" /><span>{labels[server.id]}</span>
          </div>
        ))}
      </div>
      <div className="hd-task"><span>Resolve a duplicate charge · $750</span><span>T+{state.now}s</span></div>
      <div className="hd-assessment" aria-live={running ? "off" : "polite"} aria-atomic="true">
        <div className="hd-tool"><code>{event.tool}</code><span className={`hd-verdict ${event.decision.toLowerCase()}`}>{event.decision}</span></div>
        <h2>{event.title}</h2>
        <p className="hd-reason">{event.reason}</p>
        <p className={`hd-boundary${event.sanitized ? " sanitized" : ""}`}>
          {event.sanitized ? `SANITIZE · ${cleanups[event.tool]}` : event.required.length ? `NEEDS · ${event.required.join(" + ")}` : event.executed ? "EXECUTED · Authority consumed for this charge" : "BLOCKED · Tool not executed"}
        </p>
        <div className="hd-context" aria-label="Accumulated authorization context">
          <span className="hd-context-label">context</span>
          {state.facts.map(fact => <span key={fact.kind} className={`hd-fact${fact.expiresAt !== null && fact.expiresAt <= state.now ? " stale" : ""}`} title={`Evidence from ${fact.source} · ${fact.subject}`}>{fact.kind}{fact.expiresAt !== null && fact.expiresAt <= state.now ? " expired" : ""}</span>)}
        </div>
        <p className="hd-history">{!history ? "HISTORY · Awaiting scoped customer records" : history.value.already_refunded ? "HISTORY · Same charge refunded yesterday" : history.value.recent_claims ? `HISTORY · ${history.value.recent_claims} recent claims${state.facts.some(f => f.kind === "corroboration") ? " · independently substantiated" : " · corroboration required"}` : "HISTORY · No conflicting refund found"}</p>
      </div>
      <div className="hd-sequence" aria-label="Tool sequence">
        <div className="hd-trace">
          {plan.map((call, index) => <button key={call.id} type="button" className={`hd-trace-step ${state.events[index]?.decision.toLowerCase() ?? "queued"}${index === state.cursor - 1 ? " current" : ""}`} disabled={index >= state.cursor} onClick={() => inspect(index)} aria-label={`Step ${index + 1}: ${call.server} ${call.tool}, ${state.events[index]?.decision ?? "upcoming"}`} aria-current={index === state.cursor - 1 ? "step" : undefined} />)}
        </div>
        <span>{state.cursor}/{plan.length}</span>
      </div>
      <div className="hd-controls">
        <label className="sr-only" htmlFor="hero-demo-scenario">Demo scenario</label>
        <select id="hero-demo-scenario" value={state.scenario} onChange={e => reset(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button type="button" onClick={toggle}>{complete ? "↺ Replay" : playing ? "Ⅱ Pause" : "▶ Play"}</button>
        <button type="button" disabled={complete} onClick={() => { setPlaying(false); setState(previous => advance(previous)); }} aria-label="Advance demo one step">→</button>
        <button type="button" onClick={() => reset()} aria-label="Reset hero demo">↺</button>
      </div>
      <div className="hd-footer"><span>One agent. Every next action reassessed.</span><a href="/demo">Expand demo ↗</a></div>
    </div>
  );
}
