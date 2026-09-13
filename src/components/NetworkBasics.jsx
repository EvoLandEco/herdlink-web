import { useId, useState } from "react";
import { faDiagramProject } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "../styles/network-basics.css";

const regions = [
  { id: "A", x: 49, y: 78 },
  { id: "B", x: 150, y: 118 },
  { id: "C", x: 251, y: 78 },
  { id: "D", x: 150, y: 39 },
];
const tradeLinks = [["A", "B"], ["B", "C"], ["B", "D"]];
const routeRegions = ["A", "B", "C", "D"];
const pathLinks = [["A", "B"], ["B", "C"], ["C", "D"]];

export function getNetworkExample(selectedRegion, bridgeOpen) {
  const partners = tradeLinks
    .filter((link) => link.includes(selectedRegion))
    .map((link) => link.find((region) => region !== selectedRegion));
  const routeLinks = bridgeOpen
    ? pathLinks
    : pathLinks.filter(([source, target]) => source !== "B" || target !== "C");
  const reachable = new Set(["A"]);
  const queue = ["A"];
  for (const region of queue) {
    for (const [source, target] of routeLinks) {
      if (source === region && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  return { partners, routeLinks, reachable };
}

export function NetworkBasics() {
  const volumeId = useId();
  const [selectedRegion, setSelectedRegion] = useState("B");
  const [volume, setVolume] = useState(80);
  const [bridgeOpen, setBridgeOpen] = useState(true);
  const { partners, routeLinks, reachable } = getNetworkExample(selectedRegion, bridgeOpen);

  return (
    <section className="network-basics" aria-labelledby="networkBasicsTitle">
      <header className="network-basics__header">
        <h3 id="networkBasicsTitle"><FontAwesomeIcon icon={faDiagramProject} aria-hidden="true" />Network Basics</h3>
      </header>

      <div className="network-basics__cards">
        <article className="network-lesson">
          <div className="network-lesson__heading">
            <span className="network-lesson__number">01</span>
            <h4>Places &amp; connections</h4>
          </div>
          <p className="network-lesson__description">
            A <strong>node</strong> is a region, grouping farms. A link (or <strong>edge</strong>) connects regions that trade animals.
          </p>
          <div className="network-lesson__scene network-lesson__scene--places">
            <span className="network-lesson__scene-label">Tap a region</span>
            <svg viewBox="0 0 300 180" aria-hidden="true">
              <path className="network-region-outline" d="M21 54 77 23 129 28 154 10 203 24 273 48 283 103 248 150 184 167 133 153 88 163 34 133Z" />
              <path className="network-region-divider" d="M77 23 104 81 34 133M104 81 133 153M104 81 188 87 203 24M188 87 248 150" />
              {tradeLinks.map(([source, target]) => {
                const start = regions.find((region) => region.id === source);
                const end = regions.find((region) => region.id === target);
                const active = source === selectedRegion || target === selectedRegion;
                return (
                  <line
                    key={`${source}-${target}`}
                    className={`network-trade-link${active ? " is-active" : ""}`}
                    x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  />
                );
              })}
            </svg>
            <div className="network-region-controls" role="group" aria-label="Choose a region to see its trading partners">
              {regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className={`network-region${partners.includes(region.id) ? " is-partner" : ""}`}
                  style={{ left: `${region.x / 3}%`, top: `${region.y / 1.8}%` }}
                  aria-label={`Region ${region.id}`}
                  aria-pressed={selectedRegion === region.id}
                  onClick={() => setSelectedRegion(region.id)}
                >
                  <span>{region.id}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="network-lesson__interaction network-lesson__legend">
            <span><i className="network-legend-dot" /> Region</span>
            <span><i className="network-legend-line" /> Trade link</span>
          </div>
          <div className="network-lesson__result" aria-live="polite" aria-atomic="true">
            <strong>Region {selectedRegion} · {partners.length} trading {partners.length === 1 ? "partner" : "partners"}</strong>
            <span>Connected to {partners.length === 1 ? "region" : "regions"} {partners.join(", ")}.</span>
          </div>
        </article>

        <article className="network-lesson">
          <div className="network-lesson__heading">
            <span className="network-lesson__number">02</span>
            <h4>Direction &amp; volume</h4>
          </div>
          <p className="network-lesson__description">
            An arrow follows the animals. A <strong>thicker link</strong> means more animals moved in a period.
          </p>
          <div className="network-lesson__scene">
            <span className="network-lesson__scene-label">Follow the arrow</span>
            <svg viewBox="0 0 300 180" aria-hidden="true">
              <circle className="network-orbit" cx="53" cy="87" r="34" />
              <circle className="network-orbit network-orbit--incoming" cx="247" cy="87" r="34" />
              <line className="network-volume-guide" x1="84" y1="87" x2="213" y2="87" />
              <line className="network-volume-link" x1="79" y1="87" x2="206" y2="87" strokeWidth={2 + volume / 20} />
              <path className="network-volume-arrow" d="M204 75 221 87 204 99Z" />
              <circle className="network-diagram-node" cx="53" cy="87" r="22" />
              <circle className="network-diagram-node network-diagram-node--incoming" cx="247" cy="87" r="22" />
              <text className="network-node-letter" x="53" y="92">A</text>
              <text className="network-node-letter network-node-letter--incoming" x="247" y="92">B</text>
              <text className="network-flow-label" x="53" y="140">OUTGOING</text>
              <text className="network-flow-label network-flow-label--incoming" x="247" y="140">INCOMING</text>
              <text className="network-volume-count" x="150" y="58">{volume} animals</text>
            </svg>
          </div>
          <div className="network-lesson__interaction network-volume-control">
            <label htmlFor={volumeId}>Animals moved <output htmlFor={volumeId}>{volume}</output></label>
            <input
              id={volumeId}
              type="range"
              min="20" max="200" step="20" value={volume}
              aria-valuetext={`${volume} animals from region A to region B`}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </div>
          <div className="network-lesson__result">
            <strong>A → B · {volume} animals</strong>
            <span>Outgoing for A. Incoming for B.</span>
          </div>
        </article>

        <article className="network-lesson">
          <div className="network-lesson__heading">
            <span className="network-lesson__number">03</span>
            <h4>Paths &amp; bridges</h4>
          </div>
          <p className="network-lesson__description">
            A <strong>path</strong> follows several links. Removing a <strong>bridge</strong> splits the network. Try the B → C link.
          </p>
          <div className="network-lesson__scene">
            <span className="network-lesson__scene-label">Start at region A</span>
            <svg viewBox="0 0 300 180" aria-hidden="true">
              <rect className={`network-bridge-zone${bridgeOpen ? " is-active" : ""}`} x="125" y="49" width="51" height="74" rx="10" />
              <text className="network-bridge-label" x="150" y="38">BRIDGE</text>
              {pathLinks.map(([source, target], index) => {
                const present = routeLinks.some((link) => link[0] === source && link[1] === target);
                const x = 35 + index * 77;
                return (
                  <g key={source} className={`network-route-link${present && reachable.has(source) ? " is-reachable" : ""}${present ? "" : " is-removed"}`}>
                    <line x1={x + 21} y1="87" x2={x + 49} y2="87" />
                    {present && <path d={`M${x + 46} 82 ${x + 55} 87 ${x + 46} 92Z`} />}
                  </g>
                );
              })}
              {routeRegions.map((region, index) => (
                <g key={region} className={`network-route-region${reachable.has(region) ? " is-reachable" : ""}`}>
                  <circle cx={35 + index * 77} cy="87" r="20" />
                  <text x={35 + index * 77} y="92">{region}</text>
                </g>
              ))}
              <text className="network-route-caption" x="150" y="148">
                {reachable.size - 1} downstream {reachable.size === 2 ? "region" : "regions"} reachable
              </text>
            </svg>
          </div>
          <div className="network-lesson__interaction">
            <button
              className="network-bridge-control"
              type="button"
              aria-pressed={bridgeOpen}
              aria-label="Bridge from region B to region C"
              onClick={() => setBridgeOpen((open) => !open)}
            >
              <span className="network-bridge-control__icon" aria-hidden="true"><i /><i /></span>
              <span>B → C bridge</span>
              <span className="network-bridge-control__state">{bridgeOpen ? "Connected" : "Removed"}</span>
            </button>
          </div>
          <div className="network-lesson__result" aria-live="polite" aria-atomic="true">
            <strong>{bridgeOpen ? "A → B → C → D" : "A → B / C → D"}</strong>
            <span>{bridgeOpen ? "A can reach C and D through B." : "From A, only B is reachable."}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
