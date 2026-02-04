# VxDesign Backend

This backend is used by the [VxDesign frontend](../frontend) and isn't intended
to be run on its own. The best way to develop on the backend is by running the
frontend.

## CircleCI QA Integration

When an election package export completes, VxDesign can trigger a CircleCI
pipeline to run automated QA. The integration is disabled by default and
activates only when the required environment variables are set.

### Testing with the Mock Server

A mock CircleCI server is included for testing the QA status UI without a real
pipeline. It sends back a series of status updates that mimic a real QA run.

**Terminal 1** — start the mock server:

```bash
pnpm -C apps/design/backend mock-circleci-server
```

Options: `--delay <ms>` between updates (default 3000), `--fail` to simulate a
failure.

**Terminal 2** — start VxDesign pointed at the mock server:

```bash
./run-vxdesign-with-fake-circleci.sh
```

Then export an election in VxDesign and watch the status updates appear in the
Proofing Status UI.

### Testing with the vx-qa Serve Mode

The [vx-qa](https://github.com/votingworks/vx-qa) repo includes a `serve`
subcommand that acts as a CircleCI stand-in. Unlike the mock server above, this
runs the **real QA workflow** locally — it downloads the election package from
VxDesign, scans ballots, validates tallies, and sends real status updates back
via webhook.

Because the QA workflow starts VxAdmin and VxScan on port 3000, VxDesign must
run on a different port (e.g. 4000 via `FRONTEND_PORT`).

**Terminal 1** — start the vx-qa serve mode (from the vx-qa repo):

```bash
node dist/index.js serve --config serve-config.json
```

A
[`serve-config.json`](https://github.com/votingworks/vx-qa/blob/main/serve-config.json)
is included in the vx-qa repo. Edit `vxsuite.ref` to match the VxSuite version
you want to test against. The `election.source` field is ignored — it gets
overridden by the election package URL from VxDesign.

Options: `--port <port>` (default 9000), `--webhook-secret <secret>` (default
`test-secret`), `--no-headless` for headed mode, `--limit-ballots <n>` and
`--limit-manual-tallies <n>` for faster test runs.

**Terminal 2** — start VxDesign pointed at the vx-qa server:

```bash
CIRCLECI_API_TOKEN=test-token \
  CIRCLECI_PROJECT_SLUG=gh/test/repo \
  CIRCLECI_WEBHOOK_SECRET=test-secret \
  CIRCLECI_BASE_URL=http://localhost:9000 \
  FRONTEND_PORT=4000 \
  BASE_URL=http://localhost:4000 \
  pnpm -C apps/design/frontend start
```

Then export an election in VxDesign. The vx-qa server will pick up the export,
run the full QA workflow, and send status updates back to VxDesign as it
progresses.

### Testing with Real CircleCI

To run actual QA against a real CircleCI pipeline from your dev server, you need
to expose your local server via ngrok so CircleCI can call back with status
updates and download the election package.

**Terminal 1** — start ngrok:

```bash
ngrok http 3000
```

Note the `https://...ngrok-free.app` forwarding URL.

**Terminal 2** — start VxDesign with the CircleCI environment variables:

```bash
CIRCLECI_API_TOKEN=<your personal CircleCI API token> \
  CIRCLECI_PROJECT_SLUG=gh/votingworks/vx-qa-internal \
  CIRCLECI_WEBHOOK_SECRET=<webhook secret> \
  CIRCLECI_BRANCH=<branch to run, e.g. main> \
  BASE_URL=https://<your-subdomain>.ngrok-free.app \
  pnpm -C apps/design/frontend start
```

Where:

- **`CIRCLECI_API_TOKEN`** — found in the shared 1Password vault as "VxQA Admin
  API token"
  (`op read 'op://Software Eng/sa6u6uues7p6hqrje7x5lexalq/password'`).
- **`CIRCLECI_PROJECT_SLUG`** — `gh/votingworks/vx-qa-internal` is the internal
  version of vx-qa we use for QA of customer elections.
- **`CIRCLECI_WEBHOOK_SECRET`** — found in the shared 1Password vault as "VxQA
  CircleCI Webhook Secret"
  (`op read 'op://Software Eng/5nl3dggiufl6z7flk3e22oe7cy/password'`).
- **`CIRCLECI_BRANCH`** — the vx-qa branch to run (optional, defaults to the
  project default branch).
- **`BASE_URL`** — the ngrok forwarding URL (fetch automatically using
  `curl -sq http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'`).
  This is used both for webhook callbacks and for CircleCI to download the
  election package.
