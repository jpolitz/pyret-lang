# Cont-backend baseline timings (async-opt bench suite)

*Author: Claude (agent-written report). Measured 2026-08-30 on branch
`vm-bench-prep` at `6c558ba68` (js-numbers-hardening tip). This is the fixed
local baseline for the upcoming bytecode-VM work; do not compare against the
jpolitz/pyret monorepo lineage numbers (different tree).*

## Provenance

The `bench-*.arr` / `.tmpl` / `.py` programs and `run-bench-table.sh` /
`run-hybrid-table.sh` were copied **verbatim, unmodified** from the
jpolitz/pyret monorepo, branch `hybrid-vm`, commit `38880d5d`
(`lang/tests/async-opt/`). All 24 bench programs compile and run under this
tree's TS compiler with no changes.

## Environment

- 2-CPU VM (AMD EPYC 9554P), 7.7 GiB RAM, no swap; node v24.19.0
- Build: `make ts-compiler`, then per bench the stock `%.ts.jarr` pattern rule
  (shared `compiled-ts/` cache, `-no-check-mode`,
  `--require-config src/scripts/standalone-configA.json`)
- Timing: in-process `LOOP-MS` (driver loop only; jarr-load floor excluded),
  reported in seconds

## Method

Paired self-comparison: `run-hybrid-table.sh` with **both** jarr patterns
pointed at the cont build, N=5, run in two halves back to back:

```sh
cd lang/
P_JARR='tests/async-opt/%b.ts.jarr' H_JARR='tests/async-opt/%b.ts.jarr' \
  bash tests/async-opt/run-hybrid-table.sh 5 <benches...>
```

So each bench was run 10 times interleaved; the p/h split is arbitrary
(same binary), which makes the h/p column a direct measurement of box noise:
anything the future VM comparison shows inside this band on this box is not
signal.

## Results (loop seconds; both sides are cont)

```
benchmark                |    p_med    p_min |    h_med    h_min |    h/p  min_r | parity
bench-spell              |    3.090    2.986 |    3.095    2.949 |  1.002  0.988 | OK
bench-car-compute        |    2.644    2.599 |    2.705    2.596 |  1.023  0.999 | OK
bench-car-render         |    2.465    2.385 |    2.477    2.336 |  1.005  0.979 | OK
bench-lander             |    1.714    1.712 |    1.702    1.651 |  0.993  0.964 | OK
bench-orbital-compute    |    2.214    2.100 |    2.172    2.060 |  0.981  0.981 | OK
bench-orbital-ems        |    1.524    1.467 |    1.468    1.423 |  0.963  0.970 | OK
bench-orbital-render     |    2.713    2.581 |    2.751    2.623 |  1.014  1.016 | OK
bench-boids-compute      |    2.691    2.538 |    2.757    2.660 |  1.025  1.048 | OK
geomean h/p (medians): 1.001 over 8 benches

bench-boids-compute-data |    2.796    2.728 |    2.800    2.702 |  1.001  0.990 | OK
bench-boids-raster       |    2.529    2.456 |    2.480    2.459 |  0.981  1.001 | OK
bench-vec-methods        |    2.652    2.560 |    2.550    2.449 |  0.962  0.957 | OK
bench-matrix             |    3.077    2.992 |    2.966    2.923 |  0.964  0.977 | OK
bench-dtree              |    0.804    0.737 |    0.786    0.744 |  0.978  1.009 | OK
bench-kmeans             |    0.523    0.474 |    0.491    0.466 |  0.939  0.983 | OK
bench-plagiarism         |    1.291    1.276 |    1.319    1.298 |  1.022  1.017 | OK
bench-seam               |    0.326    0.318 |    0.323    0.303 |  0.991  0.953 | OK
geomean h/p (medians): 0.979 over 8 benches
```

Noise reading: benches with ≥1.3 s of loop show ±1–3% on medians; the short
ones (dtree 0.8 s, kmeans 0.5 s, seam 0.3 s) swing up to ±6% and should be
read accordingly (or given a larger N) in future comparisons. Combined
geomean of the self-ratio across all 16: 0.990 — i.e. the whole-suite geomean
itself carries roughly ±1–2% of noise at N=5 on this box.

## Output anchors

First stdout line of each bench (deterministic; any future backend must
reproduce these byte-exactly — this is the parity column's reference):

```
bench-spell 73
bench-car-compute 14829840
bench-car-render 400000
bench-lander 4800000
bench-orbital-compute 2959
bench-orbital-ems 390000
bench-orbital-render 180000
bench-boids-compute 236561
bench-boids-compute-data 236561
bench-boids-raster 250
bench-vec-methods 250590
bench-matrix 640615
bench-dtree 829
bench-kmeans 40568
bench-plagiarism 583869000
bench-seam 478707
```

## Notes

- All 24 `bench-*.arr` programs (16 curated above + 8 micro probes:
  anns, boids, flat, listsum, map, mutual, nontail, tco) build via
  `make tests/async-opt/<name>.ts.jarr`; only the curated 16 are timed here,
  matching the harness's default list.
- `run-bench-table.sh` (the original cont-vs-promise script) hardcodes
  `node22`; on this box use `run-hybrid-table.sh`, which takes `NODE`,
  `P_JARR`, `H_JARR` and pairs any two builds.
- To race a future VM build: build `<bench>.<vm-suffix>.jarr`s, then the same
  invocation with `H_JARR` pointed at the VM pattern.
