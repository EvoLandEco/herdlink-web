# Trade vs Distance

The panel describes the volume of recorded movements between regions at the
displayed date. Each dot is an allowed directed route. Distances are straight
line distances in kilometres between the COROP reference points in EPSG:28992.
Volume is the number of animals traded. Both axes use logarithmic scales.
Movements within a region, blocked routes, nonpositive volumes and routes
without a positive finite distance are excluded.

## Curve and interpretation

The fitted curve is

\[
V(d)=A\left(1+\frac{d}{\sigma}\right)^{-\nu},
\qquad A>0,\;\sigma>0,\;\nu>0.
\]

This is the untruncated Lévy-walk form discussed by
[Boender and Hagenaars (2023)](https://doi.org/10.1038/s41598-023-30230-w).
Their paper also examines an exponential truncation term and distinguishes
this form from the Cauchy kernel used in earlier work. Calling one form a
universal WBVR “negative-binomial kernel” would misstate that evidence.

The mathematical shape provides a familiar way to describe distance decay.
Its parameters here describe regional trade volume. They are not estimates
of infection probability or farm transmission rates. The outbreak data and
likelihood used in the WBVR studies are different from these trade records.
The historical context is described in
[Boender et al. (2007)](https://doi.org/10.1371/journal.pcbi.0030071).

The curve describes typical volume conditional on an observed route. It does
not estimate whether a route exists, adjust for regional supply and demand,
or establish a causal effect of distance. These distinctions also matter in
livestock movement models: [Nicolas et al. (2018)](https://doi.org/10.1371/journal.pone.0199547)
modelled route occurrence and volume separately and found that good
predictions of route occurrence did not imply good predictions of volume.

## Estimation

The objective is the sum of squared residuals in natural log volume:

\[
\sum_i\left[\log v_i-\log A+
\nu\log\left(1+\frac{d_i}{\sigma}\right)\right]^2.
\]

Each recorded route has equal weight. Bubble sizes use regional trade totals
as visual emphasis; those totals are not precision
weights for the fit. Log residuals measure proportional differences and
prevent a few large shipments from determining the entire curve. The result
is a geometric trend, not an arithmetic mean volume prediction.

For a fixed scale, the log amplitude and decay exponent have an analytical
least squares solution. Variable projection reduces the numerical search to
the distance scale. A bounded Brent search runs on a transformed coordinate
that spans every positive scale. It is a local nonlinear optimizer; it does
not guarantee the global minimum for arbitrary data. The
[NIST nonlinear least squares overview](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd142.htm)
describes the role and limitations of iterative fitting.

The power-law and exponential limits are evaluated explicitly as the boundary
members of the same curve family. When a boundary has the lowest objective,
the panel draws it with the label “Power-law limit” or “Exponential limit”.
It does not assign finite scale and shape parameters to these limits.
Unresolved curvature, inadequate distance data or failed convergence produces
an explanation instead of a curve.
The fit uses every qualifying route, including every route in the focused
region's combined, outgoing and incoming subsets. It uses no random sampling.

The displayed path covers only the observed distance range. It samples the
fitted function at 65 evenly spaced log distances, joins those points with
straight segments and clips to the plot area. Hovering over the fit label
shows the scale, exponent, route count and log RMSE. Log RMSE is the square
root of mean squared log residuals; it is descriptive fit error, not predictive
validation.

Fit labels use neon green indicators for finite distance curves, cyan for
exponential limits, yellow for power-law limits, and red when no curve can be
fitted. White centers and colored halos give the indicators a luminous appearance.
Regional label text retains the color of its all, outgoing or incoming curve.

The summaries report route counts and the fitted decline across each observed
distance range. The decline is `-expm1(slope)`, where `slope` is the change in
fitted log volume between the shortest and longest routes. It describes the
fitted association with distance, not a causal effect. Focus curves use thin
strokes; the network curve has a dark outline.

## Confidence band

The network band gives approximate 95% pointwise confidence intervals for
the fitted geometric trend. It does not predict individual route volumes or
give simultaneous coverage of the whole curve. The calculation applies the
[delta method for fitted responses](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd511.htm)
in log space and transforms the interval back to volume.

Routes sharing either region can have correlated errors. The covariance uses
the [dyadic sandwich estimator of Aronow, Samii and Assenova (2015)](https://arxiv.org/html/1312.3398),
with the observed Hessian of the log least squares objective. For residual
`r`, gradient `J` and fitted log-volume Hessian `H`, the bread is
`B = sum(J Jᵀ - r H)`. Scores `r J` are summed by incident region and by
unordered region pair, including both trade directions. The meat is
`M = sum(regionScore regionScoreᵀ) - sum(pairScore pairScoreᵀ)`.
The covariance is `C = B⁻¹ M B⁻ᵀ`; each log interval is
`f(d) ± 1.959963984540054 sqrt(J(d)ᵀ C J(d))`.

This is an asymptotic calculation in the number of regions, which can be
small even when many routes are present. It assumes that routes with no
shared region are independent and that the local fit is identifiable.
Singular systems and negative estimated variances produce “CI unavailable”;
the calculation does not alter the covariance to force a band.

The displayed curve form is treated as fixed. Exponential and power-law
limits use their two parameter log-linear forms; finite kernels use three
parameters. The band excludes uncertainty from choosing among these forms.
Boundary inference needs this distinction: ordinary bootstrap inference can
also fail at a parameter boundary, as shown by
[Andrews (2000)](https://doi.org/10.1111/1468-0262.00114).

## Checks and profiling

Run the numerical checks and the production build with:

```sh
node --test tests/gravity-regression.test.js tests/distance-trade-confidence.test.js
npm run build
```

Run the reproducible fitter benchmark with:

```sh
node scripts/profile-distance-trade.js
```

The benchmark reads bundled daily, weekly, monthly and yearly trade records.
It reports median, 95th percentile and maximum elapsed time for a network
fit and for a region's three fits. CSV loading, route preparation and SVG
rendering are outside the timed sections. The reference revision can be
supplied as the first command argument.

On 14 September 2026, Apple M4 Max with Node 25.2.1, 15 representative dates
and 15 timed rounds gave these results:

| Panel | Reference median / p95 | Kernel median / p95 |
| --- | --- | --- |
| Network | 0.176 / 0.410 ms | 1.667 / 4.213 ms |
| Region, three fits | 0.015 / 0.057 ms | 0.338 / 0.935 ms |

The added median fitting cost was 1.491 ms for the network and 0.323 ms for
the region. These are local measurements of fitting only, not total frame
times or a guarantee for other hardware. No runtime dependency or fit cache
is required.

On the same hardware, the analytical confidence calculation over 65 distances
took 0.651 ms median and 1.135 ms at the 95th percentile across the 15 network
datasets. The network fit and band together took 2.307 ms median and 5.466 ms
at the 95th percentile. These measurements exclude SVG rendering. Thirteen
datasets supported a band; one had no curve and one had a negative dyadic
variance estimate with seven participating regions. Focus plots do not
calculate confidence bands.

Across 1,815 network and regional datasets, 146 produced finite kernels,
260 reached a power-law limit, 317 reached an exponential limit, 444 had no
decreasing fit and 648 had too little distance data. A separate SciPy check
of all 1,167 nonconstant datasets with enough distances found matching fit
classifications. The largest relative difference in residual sums of squares
was 3.45 × 10⁻¹⁵.

For finite kernels, the median reduction in log residual sum of squares
against an unrestricted, equally weighted log-log line was 0.516%. This is
an in-sample comparison with an extra shape parameter, not evidence of
better prediction. The reason to use the curve is its interpretable shape
and connection to the stakeholder literature; the data do not support
claiming a universal improvement.
