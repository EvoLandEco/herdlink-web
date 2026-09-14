# Trade vs Distance

The panel describes the volume of recorded movements between regions at the
displayed date. Each dot is an allowed directed route. Distances are straight
line distances in kilometres between the COROP reference points in EPSG:28992.
Volume is the number of animals traded. Both axes use logarithmic scales.
The plot uses allowed interregional routes with positive finite distances
and volumes.

## Curve and interpretation

The fitted curve is

\[
V(d)=A\left(1+\frac{d}{\sigma}\right)^{-\nu},
\qquad A>0,\;\sigma>0,\;\nu>0.
\]

This is the untruncated Lévy-walk form discussed by
[Boender and Hagenaars (2023)](https://doi.org/10.1038/s41598-023-30230-w).
Their paper examines several disease transmission kernels, including an
exponential truncation of this form and the Cauchy kernel used in
[Boender et al. (2007)](https://doi.org/10.1371/journal.pcbi.0030071).
Here the shape describes distance decay in regional trade volume; its
parameters are fitted to the trade records. The cited disease studies estimate
transmission from outbreak data using their own likelihoods.

The curve describes the association between distance and typical volume among
observed routes. Distance is its sole predictor. Models of route occurrence,
regional supply and demand, or causal effects address further questions.
[Nicolas et al. (2018)](https://doi.org/10.1371/journal.pone.0199547) modelled
livestock route occurrence and volume separately, reporting different
predictive performance for the two outcomes.

## Estimation

The objective is the sum of squared residuals in natural log volume:

\[
\sum_i\left[\log v_i-\log A+
\nu\log\left(1+\frac{d_i}{\sigma}\right)\right]^2.
\]

Each recorded route has equal weight in the fit. Bubble sizes use regional
trade totals for visual emphasis. Log residuals measure proportional
differences, reducing the influence of large shipments. Exponentiating the
fitted log volume gives a geometric trend.

For a fixed scale, the log amplitude and decay exponent have an analytical
least squares solution. Variable projection reduces the numerical search to
the distance scale. A bounded Brent search runs on a transformed coordinate
that spans every positive scale. The search can converge to a local minimum. The
[NIST nonlinear least squares overview](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd142.htm)
explains iterative fitting and convergence.

The power-law and exponential limits are evaluated explicitly as the boundary
members of the same curve family. When a boundary has the lowest objective,
the panel draws it with the label “Power-law limit” or “Exponential limit”.
These limits have their own two parameter forms. Unresolved curvature,
inadequate distance data or failed convergence produces a fit status explaining
why the curve is unavailable. The fit uses every qualifying route, including
every route in the focused
region's combined, outgoing and incoming subsets.

The displayed path spans the observed distance range. It samples the
fitted function at 65 evenly spaced log distances, joins those points with
straight segments and clips to the plot area. Hovering over the fit label
shows the scale, exponent, route count and log RMSE. Log RMSE is the square
root of mean squared log residuals and describes error on the fitted records.

Fit labels use neon green indicators for finite distance curves, cyan for
exponential limits, yellow for power-law limits, and red for an unavailable fit.
White centers and colored halos give the indicators a luminous appearance.
Regional label text retains the color of its all, outgoing or incoming curve.

The summaries report route counts and the fitted decline across each observed
distance range. The decline is `-expm1(slope)`, where `slope` is the change in
fitted log volume between the shortest and longest routes. It describes the
fitted association with distance. Focus curves use thin strokes; the network
curve has a dark outline.

## Confidence band

The network band gives approximate 95% pointwise confidence intervals for
the fitted geometric trend. Coverage applies to the trend estimate at each
distance individually. The calculation applies the
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
small even when many routes are present. It assumes that routes involving
disjoint regions are independent and that the local fit is identifiable.
Singular systems and negative estimated variances produce “CI unavailable”;
the covariance is used as estimated.

The displayed curve form is treated as fixed. Exponential and power-law
limits use their two parameter log-linear forms; finite kernels use three
parameters. The band's uncertainty is conditional on that choice of form. Inference
that includes form selection requires a treatment of parameter boundaries:
ordinary bootstrap inference can fail there, as shown by
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

The median fitting differences were 1.491 ms for the network and 0.323 ms for
the region. These measurements describe the fitting step on this hardware.
The implementation uses the app's existing dependencies and calculates each
fit directly.

On the same hardware, the analytical confidence calculation over 65 distances
took 0.651 ms median and 1.135 ms at the 95th percentile across the 15 network
datasets. The network fit and band together took 2.307 ms median and 5.466 ms
at the 95th percentile. These measurements exclude SVG rendering. Thirteen
datasets supported a band; one had no curve and one had a negative dyadic
variance estimate with seven participating regions. Confidence bands are
calculated for the network plot.

Across 1,815 network and regional datasets, 146 produced finite kernels,
260 reached a power-law limit, 317 reached an exponential limit, 444 had no
decreasing fit and 648 had too little distance data. A separate SciPy check
of all 1,167 nonconstant datasets with enough distances found matching fit
classifications. The largest relative difference in residual sums of squares
was 3.45 × 10⁻¹⁵.

For finite kernels, the median reduction in log residual sum of squares
against an unrestricted, equally weighted log-log line was 0.516%. This is
an in-sample comparison with an extra shape parameter. Predictive performance
requires evaluation on held-out data. The curve offers an interpretable shape
and a connection to the stakeholder literature.
