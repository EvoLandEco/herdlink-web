# GPT Pro review: HerdLink network disease simulation

Please review the scientific model, numerical implementation and parameter semantics in this document. The central question is whether literature-supported **disease simulation parameter presets** can be applied directly to the application's Simulation Controls. These are disease and natural-history settings, **not intervention presets** such as movement restrictions, targeting strategies or response delays.

Give an independent assessment. Identify fundamental flaws and implementation errors even when tests pass or documentation describes the behavior. Separate defects, deliberate modeling assumptions, missing empirical support and limits imposed by the available data. Explain which findings prevent a biological interpretation and which only limit particular uses.

This document contains the model specification, control settings, data summary, validation evidence and source excerpts. Review it without assuming access to a local checkout. The excerpts are production source with indentation removed, not a proposed implementation. If additional files or disease observations are necessary for a conclusion, identify them and explain why.

## Questions to answer

1. **Can published disease parameter sets be entered directly?** Give a verdict for each control: direct use, mathematical translation, empirical calibration, or incompatible without a model change. Specify the conditions behind each verdict. Matching symbols or numeric ranges is insufficient evidence of matching meaning.
2. **Which literature can support simulation presets for this model?** Find primary studies relevant to pig disease transmission through livestock movements. Choose a small number of defensible examples and state their disease, host, epidemiological unit, scale and intended use. No target pathogen has been specified. Explain when SIR, SIS, SEIR or SEIRS is unsuitable for a candidate disease. Keep pathogen-specific evidence distinct from a generic sensitivity scenario.
3. **How should translation or calibration be implemented?** Provide equations, data requirements, an estimation and validation procedure, and concrete changes to the engine, controls and saved settings. If the available movement ledger alone cannot identify parameters, say which parameters remain unidentified and what evidence is missing. Distinguish calibration to observations from a scenario matched to a chosen theoretical target.
4. **Are there fundamental flaws or errors?** Review the recurrence, units, population construction, movement interpretation, timing, initialization and reported metrics. Include small numerical counterexamples or analytical arguments. Do not limit the review to the concerns listed below.

Search and verify the literature. For each recommended value or range, cite the original source with a DOI or stable URL and the relevant table, equation or section. Report the source value, units, uncertainty, source model and study population. Distinguish quantities estimated from data from assumptions or borrowed values. Do not treat a paper on network targeting, a trade-distance fit, or another species as validation of these disease defaults. If a source cannot be verified, mark the claim as unverified.

Recommend a coherent mathematical model. Do not propose arbitrary rescaling, clipping, ad hoc correction factors, smoothing, or post-processing to make trajectories appear plausible. A parameter conversion must follow from the model definitions. An empirical calibration must have an explicit target, observation model and assessment of identifiability.

## Implementation snapshot

| Item | Value |
| --- | --- |
| Project | HerdLink Web, version 0.9.6 |
| Review snapshot | 16 September 2026 |
| Git revision | `b3acea904bb244fdfc54b1bd6323fb25021f1e3b` |
| Main source | `src/runtime/herdlink-runtime.js` |
| Main source SHA-256 | `eaecb8b04a07ae0628dccd68e2ff30672ae58a95a43eb1ca7bb1daaf497281ac` |
| UI | React application with a JavaScript simulation runtime |
| Engine | Deterministic, synchronous regional compartment recurrence |
| Nodes | 40 Netherlands COROP regions, `CR01` through `CR40` |
| Network | Observed directed pig movement volumes; local records are retained |
| Model choices | SIR, SIS, SEIR, SEIRS |
| Default display data | Weekly aggregation |

The engine replays observed movements; it does not generate a synthetic trade network. Compartments are fractional model population units. There are no random infection draws, stochastic fadeout, demographic turnover, explicit farms, age groups, disease deaths, diagnostic observations or physical relocation of compartment members along edges. No fitted disease parameter set or literature provenance for the numeric defaults was identified in the inspected implementation.

The application also contains seven intervention presets: Open trade, Seed containment, Trace Ring, Community Cordon, Hubs, Bridges and Standstill. They preserve disease controls and configure movement restrictions. Their scientific targeting rationale is outside the requested parameter-preset review. Restriction semantics matter here only where they interact with the disease engine.

## Data and simulation clock

The bundled CSV columns are `time`, `COROP_LEV` (source), `COROP_AFN` (recipient), and `AANTAL` (recorded animal movement count), plus a row index. Each record aggregates a directed region pair within its time bin; individual shipment times, batch identities and farm identities are absent from these files.

| Dataset | Raw records | Distinct displayed dates | First label | Last label | Spacing between labels |
| --- | ---: | ---: | --- | --- | --- |
| Daily | 143,373 | 1,201 | 2019-01-01 | 2022-04-15 | 1 day |
| Weekly | 54,504 | 172 | 2018-12-30 | 2022-04-10 | 7 days |
| Monthly | 17,683 | 40 | 2019-01-01 | 2022-04-01 | 28–31 days |
| Yearly | 2,698 | 4 | 2019-01-01 | 2022-01-01 | 365 or 366 days |

All four raw datasets sum to 215,533,552 animal movements; 72,857,195 are local records with identical source and recipient. The daily file contains 20 records involving the missing-region label `NA`, totaling 71 movements. The engine excludes records with a missing or `NA` endpoint, a nonfinite weight, or a nonpositive weight. The accepted daily total is 215,533,481 movements across 143,353 records. There are no duplicate date/source/recipient keys within any bundled aggregation.

`uniqueDates` is the sorted set of dates present in the selected CSV. The disease engine performs **one complete update per displayed date**, including the introduction frame. It does not compute elapsed calendar time or insert missing dates. The canonical daily history is separately checked for consecutive calendar days, but loading it for population setup does not make the disease engine run daily when the display is weekly, monthly or yearly.

All route loads within one frame use the compartments at the start of that frame. Compartment changes are committed together. A recipient infected during one frame cannot transmit those new infections along a second route within that frame. There is no ordering of shipments within an aggregate bin.

The introduction date defaults to the first daily-history date plus 365 days, bounded by the selected display timeline. With the bundled data this date is 2020-01-01. Infection is seeded at the first displayed date on or after introduction. Frame compartments are recorded **after** that frame's transitions; there is no separately stored pre-update seed frame. Coarse bins and a partial final bin require particular scrutiny when interpreting these dates biologically.

## Controls and saved state

| UI control / settings key | Default | Allowed range; UI increment | Mathematical use |
| --- | --- | --- | --- |
| Model / `model` | SEIR | SEIR, SIR, SIS, SEIRS | Selects compartment transitions |
| Seed region / `seedRegion` | CR35 | Region roster | One region receives infectious units |
| Introduction date / `introductionDate` | 2020-01-01 for bundled data | Displayed date range | First eligible frame receives the seed |
| Initial % / `initialPct` | 1 | 0.05–20; 0.05 | Seed is `min(N, max(1, initialPct * N / 100))` |
| Contact beta / `beta` | 0.32 | 0–2; 0.01 | Local integrated hazard contribution `beta * I / N` per record |
| Movement beta / `movementBeta` | 0.08 | 0–2; 0.01 | Multiplies recorded animal volume and source infectious share |
| Latency / `sigma` | 0.22 | 0–1; 0.01 | Fraction of existing exposed units progressing each record |
| Recovery / `gamma` | 0.15 | 0–1; 0.01 | Fraction of existing infectious units recovering each record |
| SEIRS waning | 0.02 | Fixed in source; no control | Fraction of existing recovered units returning to S per record |

`sigma` is used only for SEIR and SEIRS. All models seed `I`, not `E`. The UI label “Latency” represents a transition fraction, not a duration. `movementBeta` can exceed 1, so its meaning cannot be assumed to be a probability. The controls do not declare physical units, a pathogen, a duration distribution or a calendar integration interval.

Scenario snapshots contain `schemaVersion: 1`, `datasetKey`, the exact displayed ISO date list, `settings`, and two restriction schedules. Settings contain the model, seed, initial percentage, the four numeric disease controls, and can contain introduction date and `holdings`. `holdings` is the stored regional population vector, not a count of observed farms. Three scenario slots are stored in the browser.

`validateScenario` requires the same dataset aggregation and displayed date sequence. It restricts stored population values to 450–10,000, while the core trajectory function accepts any positive finite regional population. There are no fields for disease-preset identity, parameter units, citations, source-model semantics, conversion method, calibration data, fitted uncertainty or waning. Advise which fields a scientifically interpretable preset needs and how validation and comparison identity should use them.

## Population and initial state

The normal UI execution path loads daily history and constructs populations from the available portion of the 365 calendar days before introduction. The same vector is used by restricted and unrestricted comparisons and is held fixed throughout each trajectory.

For region i, let T_i be outgoing animal volume plus 0.7 times incoming animal volume in that history. A local movement contributes to both terms. Define x_i = log(1 + T_i), and let a and b be the smallest and largest positive x_i. For positive activity with b > a:

```text
N_i = round(450 + 9550 * (x_i - a) / (b - a))
```

Zero activity receives 450 units. If every positive activity is equal, every region receives 450 units. The 0.7 weight and 450–10,000 population scale are modeling assumptions. A direct trajectory call without `settings.holdings` derives populations from all supplied records, including records outside its requested frame list; assess the implications for chronological experiments and reproducibility.

For introduction on 2020-01-01, a direct calculation from the bundled daily history gives total synthetic population 275,758 and `N_CR35 = 10,000`. The default 1% seed therefore inserts 100 infectious units into CR35 before its first eligible frame. Every other region starts fully susceptible. There is no preexisting immunity or exposed population.

The application has a separate CBS pig-census map layer. The disease engine does not use those counts. The repository's population documentation describes census counts attributed to business main addresses and geographic alignment requirements. The review must establish whether a candidate population source represents animal locations, businesses, farms or another unit before proposing to substitute it for N_i.

## Exact disease recurrence

Use x_ij(t) for allowed recorded animal volume from region i to j during one displayed step. The sum includes local movements x_ii. Let p_i = I_i / N_i at step start, b = `beta`, and m = `movementBeta`.

```text
route pressure:       L_ij = m * x_ij * p_i
movement hazard:      h_move,j = sum_i(L_ij) / N_j
local hazard:         h_local,j = b * p_j, or 0 if the local route is disabled
total hazard:         h_j = h_local,j + h_move,j
new infection entries D_j = min(S_j, S_j * (1 - exp(-h_j)))
```

For the allowed control range the hazard is nonnegative. No factor for elapsed time appears in these equations. Neither source population nor recipient population changes because animals move. The modeled effect of movement is infection pressure on resident susceptible units.

Let P = sigma * E and C = gamma * I. Each quantity uses the state at step start. Let W = 0.02 * R for SEIRS. The source also limits each transition by its source compartment and applies nonnegative bounds to the resulting compartments.

| Model | S at step end | E at step end | I at step end | R at step end |
| --- | --- | --- | --- | --- |
| SIR | S − D | 0 | I + D − C | R + C |
| SIS | S − D + C | 0 | I + D − C | 0 |
| SEIR | S − D | E + D − P | I + P − C | R + C |
| SEIRS | S − D + W | E + D − P | I + P − C | R + C − W |

Newly exposed units do not become infectious until a later update. Units entering I through a compartment transition do not recover during their entry update. The initial infectious seed is inserted before the update and can transmit and recover in its introduction frame. Newly recovered units do not lose immunity during their entry update. Review the residence-time implications, the synchronous approximation and what happens when bins span many biological transition times.

A date-specific route restriction disables only that date's route. Node import/export restrictions persist until a later permission event and affect cross-region routes. A local route restriction disables both local movement pressure and the contact-beta term. Node import/export restrictions leave both local terms active. All permissions are sampled at the displayed frame date.

## Reported quantities

`newInfections` is D, including entries into E for SEIR/SEIRS. `cumulativeInfections` sums D across frames, excludes the initial seed, and counts reinfections in SIS/SEIRS. Prevalence is the end-of-step infectious population divided by N. Global totals sum the regional compartments.

`incomingExposure` sums L_ij only for i != j. `outgoingPressure` sums L_ij only for i != j in the opposite direction. Both describe step-start movement pressure; neither directly counts recipient infections. Recipient susceptibility and nonlinear saturation act later through D.

For visualization, cross-region `linkStates.riskLoad` equals L_ij. A local link combines the local movement pressure L_jj with the attributed contact term:

```text
local attributed infections = D_j * h_local,j / h_j  when h_j > 0
local riskLoad = L_jj + local attributed infections
```

This same edge field therefore combines a movement-pressure quantity and an attributed infection-entry quantity on local links. Assess whether edge comparisons, totals, exposure shares and downstream displays have a defensible interpretation.

The internal field `rtProxy` is `outgoingPressure / max(1, endOfStepI)`. Its visible hotspot label is “Pressure per Infectious”; the UI does not call it an estimated reproduction number. It combines a step-start numerator with a step-end denominator. Assess this metric without assuming it represents R_t. The raw trade-matrix spectral radius is a network statistic, not an implemented disease next-generation calculation.

## Specific issues to investigate

These are review leads, not a predetermined verdict. Verify the causal significance of each and identify additional problems.

| Topic | Evidence in this implementation | Requested assessment |
| --- | --- | --- |
| Calendar time | One update per displayed date; no elapsed-time factor | Can a disease preset have stable biological meaning across the four aggregations? Should disease integration use a canonical daily or finer clock with separate display aggregation? How should empty days and partial bins be handled? |
| Hazard versus fraction | Infection uses an exponential survival expression; progression and recovery use linear fractions | Derive valid conversions from published hazards, probabilities or durations. Explain the difference between `1 - exp(-r * dt)`, `dt / D`, and a geometric mean duration measured in steps. State when none reproduces the source model. |
| Residence-time distributions | One E and one I compartment with synchronous updates | Are exponential/geometric assumptions suitable for each proposed disease? When are staged compartments, an infection-age model or a different solver required? |
| Epidemiological unit | Raw animal movements feed synthetic populations derived from trade activity | Is a dimensional interpretation possible? Can one fitted scalar reconcile these scales, or does region-specific population distortion alter transmission structure? Address individual, herd and regional parameter transfers separately. |
| Movement mechanism | Source I is not depleted; recipient N is fixed; source prevalence weights every movement | Is this defensible as a contact-pressure model for the intended use? Which processes require movement of S/E/I/R, demographic turnover, selection of animals for shipment, or shipment-level transmission? |
| Local transmission | Local records contribute movement pressure in addition to beta; both share the local route checkbox | Are these distinct pathways or double counting? State what data and model definition would distinguish them. |
| Network aggregation | Regional totals conceal farms, batches and event order | Can published farm-level or within-herd parameters be transferred to homogeneous COROP compartments? Can coarse aggregation create reachability or growth artifacts that rate conversion cannot fix? |
| Introduction | Fractional states; seed floor of one; seed always enters I; frame stored after update | Evaluate seed-size distortion, imported latent infections, threshold/peak timing, and whether initialization should be a separate state. |
| Waning and model choice | SEIRS uses fixed 0.02 per displayed record | Can a literature preset be complete without an explicit immunity model and parameter? Are disease deaths, lifelong immunity or endemic processes missing for the chosen examples? |
| Deterministic invasion | Arbitrarily small positive E/I can persist and seed other regions | Assess the validity of arrival, extinction and outbreak-probability claims. State when a deterministic expectation is adequate and when a stochastic model is required. |
| Reporting | Mixed local edge units; external pressure differs from infection incidence; seed excluded from cumulative entries | Identify misleading comparisons, unit labels or endpoint definitions and provide mathematically consistent alternatives. |
| Input boundary | UI clamps controls; import validation and core population rules differ | Check accepted settings, nonfinite input handling, and whether preset values outside UI limits are rejected with a scientifically meaningful explanation. |
| Reproduction target | No disease next-generation operator is implemented | If calibration uses R_0 or growth rate, derive the appropriate object for this recurrence and the temporal network. Explain why a homogeneous `beta / gamma` shortcut may or may not apply. |

## Requested translation and calibration design

Provide a mapping table with one row per proposed preset parameter: literature quantity; source model and unit; source estimate and uncertainty; applicable engine control; direct applicability verdict; conversion equation or calibration requirement; remaining assumption; verification check. Include initialization and immunity, not just beta and recovery.

For a calendar model, define the unit of each transmission coefficient and distinguish animal **counts during a bin** from animal **flow rates per day**. Explain where a time increment belongs so that shipment volume is not multiplied by time twice. Address whether transforming each scalar parameter can reproduce a coupled nonlinear epidemic across a coarse bin, including progression and multiple generations of transmission.

For calibration, specify:

1. The epidemiological unit and movement mechanism, a compatible population dataset, geographic/time alignment and a provenance record.
2. The disease observations required: for example infection incidence, prevalence, outbreak timing, detection delays or farm outbreaks, with an observation model connecting them to the modeled state. Explain whether the bundled movement data and census context suffice.
3. Which parameters can be fixed from natural-history studies, which need a prior or uncertainty distribution, and which must be fitted. Discuss confounding among contact beta, movement beta, population scale, initial prevalence and underreporting.
4. A concrete likelihood or other justified estimation objective, optimizer or sampling method, uncertainty treatment, and tests for structural and practical identifiability. State how a target R_0 or early growth rate would be handled if observations are unavailable, and what scientific claims that permits.
5. Validation on held-out times, regions or outbreaks; sensitivity to population and aggregation; uncertainty propagation; and clear criteria for rejecting an unsupported preset. Distinguish matching calibration targets from independent validation.
6. A minimal implementation sequence tied to the source functions below, with pseudocode or JavaScript interfaces for the mathematical changes. Include parameter schema, control labels and units, saved scenario provenance, comparison pairing and cache identity. Avoid a large framework unless the chosen model requires it.

If there is a defensible near-term exploratory preset, specify its exact scope and label. If there is no support for direct numeric presets, state that plainly and describe the smallest scientifically justified route to implementing them.

## Validation evidence and limits

The following command was executed with Node v25.2.1 for this snapshot:

```sh
node --test tests/simulation-links.test.js tests/simulation-lifecycle.test.js tests/simulation-timeline.test.js tests/scenario-runtime.test.js tests/comparison-data.test.js tests/network-presets.test.js tests/intervention-presets.test.js
```

Result: **105 tests passed, 0 failed**. These tests cover compartment conservation and nonnegativity, zero-rate behavior, restricted links, introduction timing, fixed populations across paired runs, comparison isolation, scenario persistence and historical intervention selectors. They are not a demonstration of parameter identifiability, empirical calibration, biological validity or accuracy against a continuous-time reference model. Many tests extract production functions into a Node VM with UI dependencies represented by test objects; they are not a full browser or field validation.

Three small probes also executed the production trajectory functions in a Node VM:

| Probe | Inputs | Observed output |
| --- | --- | --- |
| Calendar spacing | N = 1,000 in every region; seed CR01 at 1%; default SEIR controls; CR01 → CR02 volume 100 at each of two frames. Compare dates Jan 1/Jan 2 with Jan 1/Jan 8, 2020, seeding at the first frame. | Node states match exactly for both date sequences. CR01 I is `[8.5, 7.920846052527436]`; E is `[3.1629366023974406, 5.147640162190757]`. This isolates the absence of elapsed-time scaling; it does not equate aggregated weekly volume with daily volume. |
| Minimum seed | N_seed = 450; Initial % = 0.05; transmission and transition controls zero. | The requested percentage corresponds to 0.225 units, but I = 1 and prevalence = 0.222222%. Cumulative infections = 0. |
| Local edge quantity | N = 1,000; initial I = 100; S = 900; beta = 0.3; movementBeta = 0.2; local movement volume = 500; gamma = 0; SIR. | Local hazard = 0.03; movement hazard = 0.01; new infections = 35.28950476290914. Local `riskLoad` = 36.467128572181856, combining movement pressure 10 and contact-attributed infection entries 26.467128572181856. |

The broader evaluation command:

```sh
node scripts/evaluate-scenario-presets.js /tmp/herdlink-review-audit --suite primary --seeds CR35 --scales broad
```

exits with `ReferenceError: getPresetSettings is not defined`, called through `getNetworkPresetGraph` at script line 230. The headless harness omits runtime dependencies, and its metadata describes full-dataset populations and an intervention absent from the runtime catalog. Treat this as a reproducibility defect in the evaluation harness, not evidence that the browser trajectory engine fails or that policy outcomes are validated.

## Response format

Please return:

1. A clear verdict on direct use of literature-supported simulation presets, separating what the engine permits numerically from what is scientifically justified.
2. A prioritized findings table: severity, verified defect or conditional concern, source function/line, mathematical or numerical evidence, effect on conclusions, proposed correction and a test that would detect the problem.
3. The literature-to-control mapping table, with verifiable primary citations and uncertainties.
4. A concrete translation/calibration implementation plan, ordered by dependency, including the equations and data that each step requires.
5. A short set of decisive validation experiments with expected outcomes: isolated-region dynamics, a directed two-region network, no-transmission limits, duration distributions, mass/positivity, a chosen reference solver or exact limit, temporal aggregation and identifiable-parameter recovery where appropriate.
6. The remaining questions that require disease scope or external data. State which conclusions can already be reached from the supplied code.

Keep recommendations proportional to the intended claim. An exploratory visualization and a quantitative livestock epidemic model have different evidence requirements; make the supported scope explicit.

## Source map

Line numbers refer to the snapshot above. The numerical functions and settings boundaries are reproduced in the appendix.

| File | Relevant functions or content |
| --- | --- |
| `src/runtime/herdlink-runtime.js` | `ensureSimulationControls` (666), `readSimulationSettings` (936), `collectSimulationRegionIds` (1169), `buildSimulationLedger` (1192), `estimateSimulationHoldings` (1223), `buildSimulationTrajectory` (1257), `getComparisonMetricDefinitions` (1537), `getOriginalSimulationSeries` (1595), `getPresetSettings` (1662), `getSimulationPopulationForDate` (1718), `validateScenario` (1801), `captureScenario` (1868), `loadPreset` (1934), `applySimulationFrame` (2077), `recomputeSimulationTrajectory` (4589), `getHotspotDefinitions` (7666) |
| `src/App.jsx` | Simulation Controls help, `richTips.simulationControls` (103) |
| `src/components/LeftPanel.jsx` | Default weekly display and pig dataset selection |
| `src/scenarioStorage.js` | Saved scenario identity and three browser slots |
| `docs/simulation-population.md` | Synthetic population assumptions and census alignment requirements |
| `docs/network-scenarios.md` | Intervention catalog and per-record disease clock |
| `tests/simulation-links.test.js` | Core recurrence, conservation, zero-rate behavior and link semantics |
| `tests/scenario-runtime.test.js` | Introduction, population persistence, saved state and preset boundaries |
| `tests/comparison-data.test.js` | Paired scenarios and comparison isolation |
| `scripts/evaluate-scenario-presets.js` | Evaluation harness with the failure described above |

## Source appendix

The following excerpts preserve the source statements. Common leading indentation is removed. The surrounding application supplies the datasets, date arrays, maps, D3 utilities and DOM controls referenced by these functions.

### A. Control definitions and population setup

`src/runtime/herdlink-runtime.js:666–734` — `ensureSimulationControls`

```javascript
function ensureSimulationControls() {
  let panel = document.getElementById("simulationControls");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "simulationControls";
  panel.className = "simulation-controls-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="simulation-controls-title">
      <span class="simulation-controls-heading-text">
        <i class="fa-solid fa-flask"></i> Simulation Controls
      </span>
      <button
        class="panel-info-button simulation-controls-info has-tip"
        type="button"
        data-tip-key="simulationControls"
        data-tip-placement="left"
        aria-label="Simulation settings guide"
      >
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      </button>
    </div>
    <div class="simulation-control-grid">
      <label>
        Model
        <select id="simulationModel">
          <option value="SEIR">SEIR</option>
          <option value="SIR">SIR</option>
          <option value="SIS">SIS</option>
          <option value="SEIRS">SEIRS</option>
        </select>
      </label>
      <label class="simulation-seed-region">
        Seed region
        <select id="simulationSeedRegion">
          <option value="CR35">CR35</option>
        </select>
      </label>
      <label class="simulation-introduction-date">
        Introduction date
        <input id="simulationIntroductionDate" type="date" aria-label="Simulation introduction date" title="Infection starts on this date. Load a preset to build its response schedule from this date.">
      </label>
      <label>
        Initial %
        <input id="simulationInitialPct" type="number" min="0.05" max="20" step="0.05" value="1">
      </label>
      <label>
        Contact beta
        <input id="simulationBeta" type="number" min="0" max="2" step="0.01" value="0.32">
      </label>
      <label>
        Movement beta
        <input id="simulationMovementBeta" type="number" min="0" max="2" step="0.01" value="0.08">
      </label>
      <label>
        Latency
        <input id="simulationSigma" type="number" min="0" max="1" step="0.01" value="0.22">
      </label>
      <label>
        Recovery
        <input id="simulationGamma" type="number" min="0" max="1" step="0.01" value="0.15">
      </label>
    </div>
  `;

  document.getElementById("col3")?.appendChild(panel);
  return panel;
}
```

`src/runtime/herdlink-runtime.js:936–977` — `readSimulationSettings`

```javascript
function readSimulationSettings() {
  ensureSimulationControls();
  syncSimulationIntroductionControl();
  const regionSelect = document.getElementById("simulationSeedRegion");
  const seedRegion = regionSelect.value;
  d3.select(regionSelect).selectAll("option")
    .data(collectSimulationRegionIds(loadedCSVData || [])).join("option")
    .attr("value", (id) => id)
    .text((id) => `${id} · ${getStatnaam(id)}`);
  regionSelect.value = seedRegion;
  return {
    introductionDate: getPresetSettings().introductionDate,
    ...(simulationPresetHoldings ? { holdings: { ...simulationPresetHoldings } } : {}),
    model: document.getElementById("simulationModel")?.value || "SEIR",
    seedRegion,
    initialPct: clampNumber(
      +(document.getElementById("simulationInitialPct")?.value || 1),
      0.05,
      20,
    ),
    beta: clampNumber(
      +(document.getElementById("simulationBeta")?.value || 0.32),
      0,
      2,
    ),
    movementBeta: clampNumber(
      +(document.getElementById("simulationMovementBeta")?.value || 0.08),
      0,
      2,
    ),
    sigma: clampNumber(
      +(document.getElementById("simulationSigma")?.value || 0.22),
      0,
      1,
    ),
    gamma: clampNumber(
      +(document.getElementById("simulationGamma")?.value || 0.15),
      0,
      1,
    ),
  };
}
```

`src/runtime/herdlink-runtime.js:1662–1674` — `getPresetSettings`

```javascript
function getPresetSettings() {
  const first = uniqueDates[0]?.getTime() ?? 0;
  const last = uniqueDates.at(-1)?.getTime() ?? first;
  const dateLabel = (time) => new Date(time).toISOString().slice(0, 10);
  const defaultTime = Math.max(first, Math.min((presetDailyDates[0] ?? first) + 365 * 86400000, last));
  return {
    introductionDate: simulationIntroductionDate || dateLabel(defaultTime),
    minIntroductionDate: dateLabel(first), maxIntroductionDate: dateLabel(last),
    targetBudget: presetTargetBudget, historyDays: 365,
    responseDays: presetResponseDays, standstillDays: presetStandstillDays,
    ready: Boolean(presetDailyData) && !presetDailyDataError,
  };
}
```

`src/runtime/herdlink-runtime.js:1709–1716` — `syncSimulationIntroductionControl`

```javascript
function syncSimulationIntroductionControl() {
  const input = document.getElementById("simulationIntroductionDate");
  if (!input) return;
  const settings = getPresetSettings();
  input.value = settings.introductionDate;
  input.min = settings.minIntroductionDate;
  input.max = settings.maxIntroductionDate;
}
```

`src/runtime/herdlink-runtime.js:1718–1724` — `getSimulationPopulationForDate`

```javascript
function getSimulationPopulationForDate(introductionDate) {
  const introduction = Date.parse(introductionDate);
  const history = presetDailyData.filter((row) => row.time.getTime() >= introduction - 365 * 86400000 && row.time.getTime() < introduction);
  const ids = collectSimulationRegionIds(loadedCSVData);
  const { totals } = buildSimulationLedger(history, ids, []);
  return Object.fromEntries(estimateSimulationHoldings(ids, totals));
}
```

### B. Route and permission helpers

`src/runtime/herdlink-runtime.js:221–223` — `getNodeId`

```javascript
function getNodeId(value) {
  return typeof value === "object" ? value.id : value;
}
```

`src/runtime/herdlink-runtime.js:225–227` — `getLinkKey`

```javascript
function getLinkKey(source, target) {
  return `${getNodeId(source)}-${getNodeId(target)}`;
}
```

`src/runtime/herdlink-runtime.js:255–257` — `getSimulationLinkAvailability`

```javascript
function getSimulationLinkAvailability(date, interventions = simulationLinkInterventions) {
  return new Set(date ? interventions.get(date.getTime())?.keys() : []);
}
```

`src/runtime/herdlink-runtime.js:291–301` — `applySimulationNodePermissions`

```javascript
function applySimulationNodePermissions(permissions, changes, time) {
  for (const [id, directions] of changes) {
    const permission = permissions.get(id) || { exports: true, imports: true };
    for (const [direction, allowed] of Object.entries(directions)) {
      if (permission[direction] === allowed) continue;
      permission[direction] = allowed;
      permission[`${direction}Since`] = time;
    }
    permissions.set(id, permission);
  }
}
```

`src/runtime/herdlink-runtime.js:351–363` — `getDisabledLinkKeys`

```javascript
function getDisabledLinkKeys(date, ids, permissions = getSimulationNodePermissions(date), linkInterventions = simulationLinkInterventions) {
  const disabledKeys = getSimulationLinkAvailability(date, linkInterventions);
  if (!permissions.size) return disabledKeys;
  ids = ids || collectSimulationRegionIds(loadedCSVData || []);
  for (const [id, permission] of permissions) {
    for (const partner of ids) {
      if (id === partner) continue;
      if (!permission.exports) disabledKeys.add(getLinkKey(id, partner));
      if (!permission.imports) disabledKeys.add(getLinkKey(partner, id));
    }
  }
  return disabledKeys;
}
```

### C. Population, ledger and complete trajectory calculation

`src/runtime/herdlink-runtime.js:1169–1190` — `collectSimulationRegionIds`

```javascript
function collectSimulationRegionIds(data) {
  if (simulationRegionIdsByDataset.has(data)) {
    return simulationRegionIdsByDataset.get(data);
  }
  const ids = new Set();
  for (let i = 1; i <= 40; i++) {
    ids.add("CR" + (i < 10 ? "0" + i : i));
  }
  data.forEach((row) => {
    const source = row.COROP_LEV;
    const target = row.COROP_AFN;
    if (source && source.toUpperCase() !== "NA") ids.add(source);
    if (target && target.toUpperCase() !== "NA") ids.add(target);
  });
  const sortedIds = Array.from(ids).sort((a, b) => {
    const aNum = parseInt(String(a).replace("CR", ""));
    const bNum = parseInt(String(b).replace("CR", ""));
    return aNum - bNum;
  });
  simulationRegionIdsByDataset.set(data, sortedIds);
  return sortedIds;
}
```

`src/runtime/herdlink-runtime.js:1192–1221` — `buildSimulationLedger`

```javascript
function buildSimulationLedger(data, ids, dates = uniqueDates) {
  const ledgerByDate = new Map(
    dates.map((date) => [date.getTime(), []]),
  );
  const totals = new Map(ids.map((id) => [id, 0]));

  data.forEach((row) => {
    const source = row.COROP_LEV;
    const target = row.COROP_AFN;
    const weight = +row.AANTAL;
    if (
      !source ||
      !target ||
      source.toUpperCase() === "NA" ||
      target.toUpperCase() === "NA" ||
      !Number.isFinite(weight) || weight <= 0
    ) {
      return;
    }

    const dateKey = row.time instanceof Date ? row.time.getTime() : null;
    if (ledgerByDate.has(dateKey)) {
      ledgerByDate.get(dateKey).push({ source, target, weight });
    }
    totals.set(source, (totals.get(source) || 0) + weight);
    totals.set(target, (totals.get(target) || 0) + weight * 0.7);
  });

  return { ledgerByDate, totals };
}
```

`src/runtime/herdlink-runtime.js:1223–1239` — `estimateSimulationHoldings`

```javascript
function estimateSimulationHoldings(ids, totals) {
  const positive = ids
    .map((id) => Math.log1p(totals.get(id) || 0))
    .filter((value) => value > 0);
  const minLog = d3.min(positive) || 0;
  const maxLog = d3.max(positive) || 1;
  const span = maxLog - minLog || 1;
  const holdings = new Map();

  ids.forEach((id) => {
    const score = Math.log1p(totals.get(id) || 0);
    const scaled = score > 0 ? (score - minLog) / span : 0;
    holdings.set(id, Math.round(450 + scaled * 9550));
  });

  return holdings;
}
```

`src/runtime/herdlink-runtime.js:1241–1255` — `getSimulationFrameSummary`

```javascript
function getSimulationFrameSummary(nodeStates) {
  const summary = { S: 0, E: 0, I: 0, R: 0, N: 0, newInfections: 0, cumulativeInfections: 0 };
  Object.values(nodeStates).forEach((state) => {
    summary.S += state.S;
    summary.E += state.E;
    summary.I += state.I;
    summary.R += state.R;
    summary.N += state.N;
    summary.newInfections += state.newInfections || 0;
    summary.cumulativeInfections += state.cumulativeInfections || 0;
  });
  summary.prevalence = summary.N ? summary.I / summary.N : 0;
  summary.exposedShare = summary.N ? summary.E / summary.N : 0;
  return summary;
}
```

`src/runtime/herdlink-runtime.js:1257–1498` — `buildSimulationTrajectory`

```javascript
function buildSimulationTrajectory(settings, inputs = {}) {
  const {
    data = loadedCSVData,
    dates = uniqueDates,
    nodeInterventions = simulationNodeInterventions,
    linkInterventions = simulationLinkInterventions,
  } = inputs;
  if (!data || !dates.length) return null;

  const ids = collectSimulationRegionIds(data);
  const { ledgerByDate, totals } = buildSimulationLedger(
    data,
    ids,
    dates,
  );
  const holdings = settings.holdings
    ? new Map(ids.map((id) => [id, settings.holdings[id]]))
    : estimateSimulationHoldings(ids, totals);
  const seedIds = [settings.seedRegion];
  let current = new Map();

  ids.forEach((id) => {
    const N = holdings.get(id);
    if (!Number.isFinite(N) || N <= 0) {
      throw new Error(`Model population for ${id} must be a positive finite number.`);
    }
    current.set(id, { S: N, E: 0, I: 0, R: 0, N });
  });

  const introductionTime = settings.introductionDate ? Date.parse(settings.introductionDate) : dates[0].getTime();
  let introduced = false;

  const frameByKey = {};
  const frames = [];
  const boundaryIndices = [];
  const cumulativeInfections = new Map(ids.map((id) => [id, 0]));
  const nodeEvents = Array.from(nodeInterventions).sort(([a], [b]) => a - b);
  const permissions = new Map();
  let interventionIndex = 0;
  let previousAvailability;
  let previousDisabledKeys = new Set();

  dates.forEach((date, frameIndex) => {
    if (!introduced && date.getTime() >= introductionTime) {
      seedIds.forEach((id) => {
        const state = current.get(id);
        if (!state) return;
        const seeded = Math.min(state.N, Math.max(1, settings.initialPct / 100 * state.N));
        state.I = seeded;
        state.S = state.N - seeded;
      });
      introduced = true;
    }
    let permissionsChanged = false;
    while (interventionIndex < nodeEvents.length && nodeEvents[interventionIndex][0] <= date.getTime()) {
      const [time, changes] = nodeEvents[interventionIndex++];
      applySimulationNodePermissions(permissions, changes, time);
      permissionsChanged = true;
    }
    const availability = linkInterventions.get(date.getTime());
    if (permissionsChanged || availability !== previousAvailability) {
      const disabledKeys = getDisabledLinkKeys(date, ids, permissions, linkInterventions);
      if (frameIndex > 0 && (disabledKeys.size !== previousDisabledKeys.size ||
        Array.from(disabledKeys).some((key) => !previousDisabledKeys.has(key)))) {
        boundaryIndices.push(frameIndex);
      }
      previousDisabledKeys = disabledKeys;
    }
    previousAvailability = availability;
    const records = ledgerByDate.get(date.getTime()) || [];
    const incomingLoad = new Map(ids.map((id) => [id, 0]));
    const externalIncomingLoad = new Map(ids.map((id) => [id, 0]));
    const outgoingLoad = new Map(ids.map((id) => [id, 0]));
    const newInfectionByNode = new Map(ids.map((id) => [id, 0]));
    const linkStates = new Map();

    records.forEach((record) => {
      const key = getLinkKey(record.source, record.target);
      if (availability?.has(key) || (record.source !== record.target &&
        (permissions.get(record.source)?.exports === false || permissions.get(record.target)?.imports === false))) return;
      const sourceState = current.get(record.source);
      const targetState = current.get(record.target);
      if (!sourceState || !targetState || !sourceState.N || !targetState.N) {
        return;
      }
      const sourcePrev = sourceState.I / sourceState.N;
      const targetPrev = targetState.I / targetState.N;
      const riskLoad = record.weight * sourcePrev * settings.movementBeta;
      const existing = linkStates.get(key) || {
        source: record.source,
        target: record.target,
        local: record.source === record.target,
        ledgerWeight: 0,
        riskLoad: 0,
        sourcePrevalence: sourcePrev,
        targetPrevalence: targetPrev,
      };
      existing.ledgerWeight += record.weight;
      existing.riskLoad += riskLoad;
      existing.sourcePrevalence = sourcePrev;
      existing.targetPrevalence = targetPrev;
      linkStates.set(key, existing);
      incomingLoad.set(
        record.target,
        (incomingLoad.get(record.target) || 0) + riskLoad,
      );
      if (record.source !== record.target) {
        externalIncomingLoad.set(
          record.target,
          (externalIncomingLoad.get(record.target) || 0) + riskLoad,
        );
        outgoingLoad.set(
          record.source,
          (outgoingLoad.get(record.source) || 0) + riskLoad,
        );
      }
    });

    const next = new Map();
    ids.forEach((id) => {
      const state = current.get(id);
      const N = state.N;
      const prevalence = state.I / N;
      const localForce = availability?.has(getLinkKey(id, id))
        ? 0
        : settings.beta * prevalence;
      const movementForce = (incomingLoad.get(id) || 0) / N;
      const force = localForce + movementForce;
      const entering = Math.min(
        state.S,
        state.S * (1 - Math.exp(-force)),
      );
      newInfectionByNode.set(id, entering);
      const localShare = force > 0 ? localForce / force : 0;
      const localLoad = entering * localShare;
      const exposedStep =
        settings.model === "SEIR" || settings.model === "SEIRS";
      const toInfectious = exposedStep
        ? Math.min(state.E, state.E * settings.sigma)
        : entering;
      const toExposed = exposedStep ? entering : 0;
      const recovered = Math.min(state.I, state.I * settings.gamma);
      const waning =
        settings.model === "SIS"
          ? recovered
          : settings.model === "SEIRS"
            ? Math.min(state.R, state.R * 0.02)
            : 0;

      const S = Math.max(0, state.S - entering + waning);
      const E = Math.max(
        0,
        exposedStep ? state.E + toExposed - toInfectious : 0,
      );
      const I = Math.max(0, state.I + toInfectious - recovered);
      const R =
        settings.model === "SIS"
          ? 0
          : Math.max(0, state.R + recovered - waning);
      next.set(id, { S, E, I, R, N });

      if (localLoad > 0) {
        const key = getLinkKey(id, id);
        const localMovement = linkStates.get(key);
        linkStates.set(key, {
          source: id,
          target: id,
          ledgerWeight: localMovement?.ledgerWeight || 0,
          riskLoad: (localMovement?.riskLoad || 0) + localLoad,
          sourcePrevalence: prevalence,
          targetPrevalence: prevalence,
          local: true,
        });
      }
    });

    current = next;

    const nodeStates = {};
    const nodeMetrics = {};
    ids.forEach((id) => {
      const state = current.get(id);
      const incoming = externalIncomingLoad.get(id) || 0;
      const outgoing = outgoingLoad.get(id) || 0;
      const prevalence = state.N ? state.I / state.N : 0;
      const exposedShare = state.N ? state.E / state.N : 0;
      const recoveredShare = state.N ? state.R / state.N : 0;
      const newInfections = newInfectionByNode.get(id) || 0;
      cumulativeInfections.set(id, cumulativeInfections.get(id) + newInfections);
      nodeStates[id] = {
        ...state,
        prevalence,
        exposedShare,
        recoveredShare,
        incomingExposure: incoming,
        outgoingPressure: outgoing,
        newInfections: Math.max(0, newInfections),
        cumulativeInfections: cumulativeInfections.get(id),
        rtProxy: outgoing / Math.max(1, state.I),
      };
      nodeMetrics[id] = {
        inDegree: incoming,
        outDegree: outgoing,
        betweenness: prevalence,
        pageRank: state.I,
        eigenvector: outgoing / Math.max(1, state.I),
      };
    });

    const summary = getSimulationFrameSummary(nodeStates);
    const frame = {
      date,
      key: date.toISOString(),
      nodeStates,
      linkStates,
      nodeMetrics,
      summary,
      seedIds,
    };
    frameByKey[frame.key] = frame;
    frames.push(frame);
  });

  const metricMax = {};
  metricNames.forEach((metric) => {
    metricMax[metric] =
      d3.max(frames, (frame) =>
        d3.max(Object.values(frame.nodeMetrics), (node) => node[metric]),
      ) || 1;
  });

  return {
    settings,
    ids,
    holdings,
    seedIds,
    frames,
    frameByKey,
    metricMax,
    boundaryIndices,
  };
}
```

### D. Saved settings and paired reference trajectory

`src/runtime/herdlink-runtime.js:1801–1866` — `validateScenario`

```javascript
function validateScenario(snapshot) {
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const keysAre = (value, keys) => object(value) && Object.keys(value).every((key) => keys.includes(key));
  const fail = (message) => { throw new Error(message); };
  if (!keysAre(snapshot, ["schemaVersion", "datasetKey", "dates", "settings", "nodeInterventions", "linkInterventions"]) || Object.keys(snapshot).length !== 6 ||
    snapshot.schemaVersion !== 1) fail("This scenario format is not supported.");
  if (snapshot.datasetKey !== currentTimeSpan || !Array.isArray(snapshot.dates) ||
    snapshot.dates.length !== uniqueDates.length || uniqueDates.some((date, index) => snapshot.dates[index] !== date.toISOString())) {
    fail("This scenario belongs to a different trade dataset or recorded date range.");
  }
  const ids = collectSimulationRegionIds(loadedCSVData);
  const settings = snapshot.settings;
  const ranges = { initialPct: [0.05, 20], beta: [0, 2], movementBeta: [0, 2], sigma: [0, 1], gamma: [0, 1] };
  if (!keysAre(settings, ["model", "seedRegion", "introductionDate", "holdings", ...Object.keys(ranges)]) || ![7, 8, 9].includes(Object.keys(settings).length) ||
    !["SIR", "SIS", "SEIR", "SEIRS"].includes(settings.model) || !ids.includes(settings.seedRegion)) {
    fail("The scenario model or seed region is invalid.");
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) {
      fail(`The scenario setting ${key} must be between ${min} and ${max}.`);
    }
  }
  if (settings.introductionDate !== undefined || settings.holdings !== undefined) {
    const time = Date.parse(settings.introductionDate);
    if (typeof settings.introductionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(settings.introductionDate) ||
      !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== settings.introductionDate ||
      time < uniqueDates[0].getTime() || time > uniqueDates.at(-1).getTime() ||
      (settings.holdings !== undefined && (!object(settings.holdings) || Object.keys(settings.holdings).length !== ids.length ||
      !ids.every((id) => Number.isFinite(settings.holdings[id]) && settings.holdings[id] >= 450 && settings.holdings[id] <= 10000)))) {
      fail("The scenario introduction date or model population is invalid.");
    }
  }
  const linkKeys = new Set(ids.flatMap((source) => ids.map((target) => getLinkKey(source, target))));
  const schedules = {};
  for (const kind of ["nodeInterventions", "linkInterventions"]) {
    if (!Array.isArray(snapshot[kind])) fail("Scenario restrictions must be dated lists.");
    const schedule = new Map();
    for (const entry of snapshot[kind]) {
      if (!Array.isArray(entry) || entry.length !== 2) fail("A scenario restriction entry is invalid.");
      const [time, entries] = entry;
      if (!Number.isSafeInteger(time) || Math.abs(time) > 8640000000000000 || schedule.has(time) ||
        !Array.isArray(entries) || !entries.length) fail("A scenario restriction date is invalid or duplicated.");
      const changes = new Map();
      for (const change of entries) {
        if (!Array.isArray(change) || change.length !== 2) fail("A scenario restriction is invalid.");
        const [id, value] = change;
        if (changes.has(id)) fail("A scenario restriction contains duplicate regions or routes.");
        if (kind === "nodeInterventions") {
          if (!ids.includes(id) || !keysAre(value, ["exports", "imports"]) || !Object.keys(value).length ||
            !Object.values(value).every((allowed) => typeof allowed === "boolean")) {
            fail("A scenario regional permission is invalid.");
          }
          changes.set(id, { ...value });
        } else {
          if (!linkKeys.has(id) || value !== true) fail("A scenario route restriction is invalid.");
          changes.set(id, true);
        }
      }
      schedule.set(time, changes);
    }
    schedules[kind] = schedule;
  }
  return { settings: { ...settings,
    introductionDate: settings.introductionDate || uniqueDates[0].toISOString().slice(0, 10),
    ...(settings.holdings ? { holdings: { ...settings.holdings } } : {}) }, ...schedules };
}
```

`src/runtime/herdlink-runtime.js:1868–1879` — `captureScenario`

```javascript
function captureScenario() {
  if (areScenarioControlsDisabled()) throw new Error("Wait for the current network operation to finish before saving a scenario.");
  const snapshot = {
    schemaVersion: 1, datasetKey: currentTimeSpan,
    dates: uniqueDates.map((date) => date.toISOString()), settings: readSimulationSettings(),
    nodeInterventions: Array.from(simulationNodeInterventions, ([time, changes]) =>
      [time, Array.from(changes, ([id, directions]) => [id, { ...directions }])]),
    linkInterventions: Array.from(simulationLinkInterventions, ([time, changes]) => [time, Array.from(changes)]),
  };
  validateScenario(snapshot);
  return snapshot;
}
```

`src/runtime/herdlink-runtime.js:1595–1612` — `getOriginalSimulationSeries`

```javascript
function getOriginalSimulationSeries(settings, originalTrajectory = null) {
  const datesKey = uniqueDates.map((date) => date.toISOString()).join(",");
  const settingsKey = JSON.stringify(settings);
  let cache = comparisonDataCache.get("simulation");
  if (!cache || cache.data !== loadedCSVData || cache.datesKey !== datesKey || cache.settingsKey !== settingsKey) {
    cache = { data: loadedCSVData, datesKey, settingsKey };
    comparisonDataCache.set("simulation", cache);
  }
  if (!cache.original) {
    const trajectory = originalTrajectory || buildSimulationTrajectory(settings, {
        data: loadedCSVData, dates: uniqueDates,
        nodeInterventions: new Map(), linkInterventions: new Map(),
      });
    cache.original = buildComparisonSeries(uniqueDates, trajectory.ids, getComparisonMetricDefinitions("simulation"),
      (key) => trajectory.frameByKey[key]?.summary, (key) => trajectory.frameByKey[key]?.nodeStates);
  }
  return cache.original;
}
```
