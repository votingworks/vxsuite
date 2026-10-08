# VxDesign Backend

This backend is used by the [VxDesign frontend](../frontend) and isn't intended
to be run on its own. The best way to develop on the backend is by running the
frontend.

## Automated QA

When an election package export completes, VxDesign can trigger a CircleCI
pipeline in the [vx-qa](https://github.com/votingworks/vx-qa) project to run
automated QA against the exported package. The integration is off by default and
turns on only when the environment is configured.

All of the configuration is read in [`src/qa_config.ts`](./src/qa_config.ts),
which is the single source of truth for these variables.

### Environment Variables

| Variable                  | Required | Description                                                                                                                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CIRCLECI_API_TOKEN`      | Yes      | CircleCI API token authorizing pipeline triggers. In 1Password as "VxQA Admin API token" (`op read 'op://Software Eng/sa6u6uues7p6hqrje7x5lexalq/password'`).                              |
| `CIRCLECI_BASE_URL`       | No       | CircleCI API root. Defaults to `https://circleci.com`; point it at a stand-in server to test locally.                                                                                      |
| `CIRCLECI_BRANCH`         | No       | The vx-qa branch to run. Defaults to the project's default branch.                                                                                                                         |
| `CIRCLECI_PROJECT_SLUG`   | Yes      | The vx-qa CircleCI project, e.g. `gh/votingworks/vx-qa-internal` — the internal version of vx-qa we use for QA of customer elections.                                                      |
| `CIRCLECI_QA_ORG_IDS`     | No       | Comma-separated allowlist of organization IDs to run QA for. Empty or unset means no organizations, i.e. QA off. Use `pnpm list-organizations` to look up IDs.                             |
| `CIRCLECI_WEBHOOK_SECRET` | Yes      | Shared secret CircleCI presents when calling back with status updates. In 1Password as "VxQA CircleCI Webhook Secret" (`op read 'op://Software Eng/5nl3dggiufl6z7flk3e22oe7cy/password'`). |

The QA flow also uses `BASE_URL` (shared with the rest of the backend), both for
the webhook callback URL and, outside of production, as the URL CircleCI
downloads the election package from.

### How It Turns On and Off

The three required variables are all-or-nothing. Set all of them to configure
the integration, or none of them to disable it. A partial configuration throws
at startup rather than silently disabling QA. The backend logs a one-line
summary of the resulting configuration when it starts.

`CIRCLECI_QA_ORG_IDS` then decides which organizations QA actually runs for. For
elections belonging to any other organization, QA is neither triggered on export
nor returned by the API, so the proofing status UI shows no QA status.

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
pnpm -C apps/design/backend start-with-mock-circleci
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

**Terminal 2** — start VxDesign pointed at the vx-qa server. The same launcher
as above works, with the ports overridden:

```bash
FRONTEND_PORT=4000 BASE_URL=http://localhost:4000 \
  pnpm -C apps/design/backend start-with-mock-circleci
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
  CIRCLECI_QA_ORG_IDS=<organization IDs to run QA for> \
  BASE_URL=https://<your-subdomain>.ngrok-free.app \
  pnpm -C apps/design/frontend start
```

Where `BASE_URL` is the ngrok forwarding URL and the `CIRCLECI_*` variables are
as described in [Environment Variables](#environment-variables) above.

Fetch the ngrok URL automatically with
`curl -sq http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'`.
