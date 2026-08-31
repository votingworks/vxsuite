# CVR send load test

`cvr-send-load-test.mjs` simulates N central scanners each sending M batches of
K cast vote records to a VxAdmin host over the real transfer protocol
(`startCvrTransfer` → one `application/zip` POST per CVR → `finishCvrTransfer`).
CVRs are cloned from the two-party-primary fixture export with each report's
`UniqueId` and `BatchId` rewritten per simulated ballot/batch (image and layout
files are hashed per file by the report, so they're reused unchanged — nothing
else needs rewriting; there is no whole-report hash on the network path).

## Running

Requires the workspace packages to be built (`pnpm build`). Run from
`apps/central-scan/backend`:

```sh
node script/cvr-send-load-test.mjs --host http://<admin-address>:<peer-port> \
  [--scanners N] [--batches M] [--cvrs K] \
  [--concurrency C] [--pipeline P] [--official] [--code-version dev]
```

- `--host` — the VxAdmin **peer** API origin (peer port = backend port + 1; e.g.
  `http://192.168.1.10:3002` in a standard install).
- `--scanners` — number of simulated scanners (`LOAD-01`…), default 1.
- `--batches` — batches per scanner, default 1.
- `--cvrs` — CVRs per batch, default the whole fixture batch (112). Larger
  values reuse fixture ballots with fresh ids.
- `--concurrency` — how many scanners send at once (default: all).
- `--pipeline` — uploads in flight per scanner (default 1 = serial, matching
  production `cvr_sync.ts` today; raise it to preview pipelining gains).
- `--official` — send with `isTestMode: false` (default sends test-mode).
- `--code-version` — must match the host's code version (default `dev`).

The host must be configured with the **two-party-primary** election
(`libs/fixtures` `electionTwoPartyPrimaryFixtures`) and be in a CVR file mode
compatible with the flag above. Each run uses a unique batch-id prefix, so
repeat runs add new batches rather than short-circuiting as already-complete.

Output: per-batch timings for the start/upload/finish phases with CVRs/s and
upload MB/s, then an aggregate summary. Non-zero exit if any batch failed.

## Local smoke host

`load-test-host.mjs` starts a minimal in-process VxAdmin peer API (throwaway
workspace, two-party-primary election) for verifying the tool without hardware —
localhost numbers say nothing about real wire throughput:

```sh
node script/load-test-host.mjs 3102   # then --host http://localhost:3102
```

Set `LOAD_TEST_WORKSPACE` to control where its workspace lives. It serves the
peer API only (no main app, no auth) and is not part of any production flow.
