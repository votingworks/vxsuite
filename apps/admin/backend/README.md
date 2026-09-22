# VxAdmin Backend

This backend is used by the [VxAdmin frontend](../frontend) and isn't intended
to be run on its own. The best way to develop on the backend is by running the
frontend.

## Benchmarks

This backend includes benchmarks (modeled on
[`libs/ballot-interpreter`'s](../../../libs/ballot-interpreter/README.md#benchmarks))
for queries behind tally reports, ballot count reports, and the ballot
adjudication queue, measured against a synthetically seeded store at high CVR
volume. To run them:

```sh
pnpm benchmark
```

Results are compared against saved results from a previous run and fail on
regression. Each benchmark also carries an informational time goal describing
what the path should eventually meet at that scale — a run over its goal prints
a warning without failing, since several of these paths don't meet their goals
yet. The suite is not part of `test:run` or CI.

The seeded database (`DEFAULT_CVR_COUNT` in `benchmarks/seed.ts`, currently 1M
CVRs, ~3GB) is built once and cached under the OS temp dir; run with
`RESET_CACHED_STORE=1` to discard the cache and reseed, which is needed whenever
the seeded data shape or the store schema changes.

To run against saved results for a different environment, set
`BENCHMARKS_ENV=<name>`; to update saved results, set `UPDATE_BENCHMARKS=1`.
