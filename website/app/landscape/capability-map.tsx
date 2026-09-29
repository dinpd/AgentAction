"use client";

import { useState } from "react";
import { coverage, entries, focuses, matchesFilters } from "./capabilities";

export function CapabilityMap() {
  const [focus, setFocus] = useState("all");
  const [maturity, setMaturity] = useState("all");
  const [offering, setOffering] = useState("all");
  const visible = entries.filter((entry) => matchesFilters(entry, focus, maturity, offering));
  const reset = () => { setFocus("all"); setMaturity("all"); setOffering("all"); };

  return (
    <section id="capability-map" className="section-shell capability-map" aria-labelledby="capability-title">
      <div className="section-heading">
        <div>
          <p className="section-index">Go deeper / Capability evidence</p>
          <h2 id="capability-title">Inspect the evidence.</h2>
        </div>
        <p>Eight representative approaches, not a leaderboard. Coverage and maturity are separate. Select any cell to inspect its evidence.</p>
      </div>
      <p className="capability-method">Sources reviewed September 29, 2026. Documentation review, not independent certification. A mark may cover only part of a column: read the qualification. “Not established” means the reviewed source does not demonstrate it, not that it is absent.</p>
      <ul className="capability-legend" aria-label="Capability evidence legend">
        {Object.entries(coverage).map(([key, value]) => <li key={key}><span className={`capability-mark coverage-${key}`} aria-hidden="true">{value.symbol}</span>{value.label}</li>)}
      </ul>
      <div className="capability-filters" role="group" aria-label="Filter the capability map">
        <label>Control focus<select aria-label="Control focus" value={focus} onChange={(event) => setFocus(event.target.value)}>
          <option value="all">All control areas</option>
          {focuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Maturity<select aria-label="Maturity" value={maturity} onChange={(event) => setMaturity(event.target.value)}>
          <option value="all">All maturity levels</option>
          {[...new Set(entries.map((entry) => entry.maturity))].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>Offering<select aria-label="Offering" value={offering} onChange={(event) => setOffering(event.target.value)}>
          <option value="all">All offering types</option>
          {[...new Set(entries.map((entry) => entry.offering))].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <button type="button" onClick={reset}>Reset filters</button>
      </div>
      <p className="capability-count" role="status">{visible.length} of {entries.length} approaches shown. Focus includes built-in, integration and announced coverage.</p>
      <p id="capability-scroll-hint" className="capability-scroll-hint">On smaller screens, scroll the map horizontally to compare all six control areas.</p>
      <div className="capability-scroll" role="region" aria-label="Capability comparison" aria-describedby="capability-scroll-hint" tabIndex={0}>
        <table className="capability-table">
          <caption>Control coverage by project — select a marker for qualification and source</caption>
          <thead><tr><th scope="col">Project / maturity</th>{focuses.map((item) => <th scope="col" key={item.id}>{item.label}<span>{item.question}</span></th>)}</tr></thead>
          <tbody>{visible.map((entry) => <tr key={entry.id} data-project={entry.id}>
            <th scope="row"><strong>{entry.name}</strong><span>{entry.org}</span><span className="capability-maturity">{entry.maturity}</span><span>{entry.offering}</span><time dateTime={entry.reviewed}>Reviewed {entry.reviewed}</time>
              <details className="capability-scope"><summary>Scope &amp; limits</summary><p>{entry.qualification}</p></details>
            </th>
            {focuses.map((item) => {
              const evidence = entry.cells[item.id];
              const key = `${entry.id}-${item.id}`;
              return <td key={key} className={`coverage-${evidence.state}`}>
                <details>
                  <summary aria-label={`${entry.name}: ${item.label} — ${coverage[evidence.state].label}`}>
                    <span className="capability-mark" aria-hidden="true">{coverage[evidence.state].symbol}</span>
                    <span>{coverage[evidence.state].label}</span>
                  </summary>
                  <p>{evidence.note}</p>
                  <a href={evidence.source} aria-label={`${entry.name}: ${item.label} source`}>Read source ↗</a>
                </details>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="capability-empty">No approaches match these filters. Try another combination or reset filters.</p>}
      <p className="capability-method">Built in describes the reviewed implementation, including early reference code. Announced describes a vendor claim in a reference design. Integration requires additional application or infrastructure work. Logs, identity tokens and action-bound receipts are evaluated separately. AgentAction is self-listed under the same criteria.</p>
    </section>
  );
}
