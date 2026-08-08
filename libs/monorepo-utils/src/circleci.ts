import { basename, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { iter, Optional } from '@votingworks/basics';
import { PnpmPackageInfo } from './types';

function jobIdForPackage(pkg: PnpmPackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

const RUST_CRATES_JOB_ID = 'test-rust-crates';

const POSTGRES_PACKAGES: string[] = ['apps/design/backend'];
// The following packages are only tested when there is a change to its directory.
const PACKAGES_ONLY_TEST_ON_CHANGES = ['apps/pollbook/backend'];

function findImageSnapshotDirsRelativeToSrc(pkgPath: string): string[] {
  const srcPath = join(pkgPath, 'src');
  if (!existsSync(srcPath)) return [];
  return (readdirSync(srcPath, { recursive: true }) as string[]).filter(
    (entry) => basename(entry) === '__image_snapshots__'
  );
}

function generateTestJobForNodeJsPackage(
  pkg: PnpmPackageInfo,
  isConditional?: boolean
): Optional<string[]> {
  if (!pkg.packageJson?.scripts?.['test']) {
    // exclude packages without tests
    return;
  }

  const hasPlaywrightTests = existsSync(`${pkg.path}/playwright.config.ts`);
  const snapshotDirs = findImageSnapshotDirsRelativeToSrc(pkg.path);
  const hasSnapshotTests = snapshotDirs.length > 0;
  const needsPostgres = POSTGRES_PACKAGES.includes(pkg.relativePath);

  const lines = [
    `# ${pkg.name}`,
    `${jobIdForPackage(pkg)}:`,
    `  executor: ${needsPostgres ? 'nodejs_postgres' : 'nodejs'}`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install:`,
    `        is_node_package: true`,
    ...(hasPlaywrightTests
      ? [
          `    - run:`,
          `        name: Install Browser`,
          `        command: |`,
          `          pnpm --dir ${pkg.relativePath} exec playwright install-deps`,
          `          pnpm --dir ${pkg.relativePath} exec playwright install chromium`,
        ]
      : []),
    `    - run:`,
    `        name: Build`,
    `        command: |`,
    `          pnpm --dir ${pkg.relativePath} build`,
    `    - run:`,
    `        name: Lint`,
    `        command: |`,
    `          pnpm --dir ${pkg.relativePath} lint`,
    ...(isConditional
      ? [
          `    - when:`,
          `        condition: << pipeline.parameters.run-job >>`,
          `        steps:`,
          `          - run:`,
          `              name: Test`,
          `              command: |`,
          `                pnpm --dir ${pkg.relativePath} test`,
          `              environment:`,
          `                JEST_JUNIT_OUTPUT_DIR: ./reports/`,
          `          - store_test_results:`,
          `              path: ${pkg.relativePath}/${
            /* istanbul ignore next */
            hasPlaywrightTests ? 'test-results' : 'reports'
          }/`,
        ]
      : [
          `    - run:`,
          `        name: Test`,
          `        command: |`,
          `          pnpm --dir ${pkg.relativePath} test`,
          `        environment:`,
          `          JEST_JUNIT_OUTPUT_DIR: ./reports/`,
          `    - store_test_results:`,
          `        path: ${pkg.relativePath}/${
            hasPlaywrightTests ? 'test-results' : 'reports'
          }/`,
        ]),
  ];

  if (hasSnapshotTests || hasPlaywrightTests) {
    const indent = isConditional ? '          ' : '    ';
    for (const snapshotDir of snapshotDirs) {
      lines.push(`${indent}- store_artifacts:`);
      lines.push(
        `${indent}    path: ${pkg.relativePath}/src/${snapshotDir}/__diff_output__/`
      );
    }
    if (hasPlaywrightTests) {
      lines.push(`${indent}- store_artifacts:`);
      lines.push(`${indent}    path: ${pkg.relativePath}/test-results/`);
      // On `main` only, upload screenshots to S3 so the GitHub Actions
      // screenshot-gallery workflow can build a browseable gallery. AWS
      // credentials and bucket name come from the `screenshots-publishing`
      // CircleCI context.
      const appName = pkg.relativePath
        .replace(/^apps\//, '')
        .replace(/\/integration-testing$/, '');
      lines.push(`${indent}- when:`);
      lines.push(`${indent}    condition:`);
      lines.push(`${indent}      equal: [ main, << pipeline.git.branch >> ]`);
      lines.push(`${indent}    steps:`);
      lines.push(`${indent}      - aws-cli/setup`);
      lines.push(`${indent}      - run:`);
      lines.push(`${indent}          name: Upload screenshots to S3`);
      lines.push(`${indent}          command: |`);
      lines.push(
        `${indent}            if [ -d "${pkg.relativePath}/test-results/screenshots" ]; then`
      );
      lines.push(
        `${indent}              aws s3 sync ${pkg.relativePath}/test-results/screenshots/ \\`
      );
      lines.push(
        `${indent}                "s3://$SCREENSHOT_BUCKET/screenshots/${appName}/" \\`
      );
      lines.push(
        `${indent}                --exclude "*" --include "*.png" --delete`
      );
      lines.push(`${indent}            fi`);
    }
  }

  return lines;
}

const NOTIFY_GALLERY_JOB_ID = 'notify-gallery';

// Screenshots are uploaded to S3 by each app's integration-testing job (see
// the upload step in `generateTestJobForNodeJsPackage`). The gallery itself
// is assembled by a GitHub Actions workflow
// (.github/workflows/screenshot-gallery.yml) so that the image-processing work
// stays off the CircleCI critical path. This job does nothing but signal
// GitHub, via a repository dispatch, once all screenshots have been uploaded.
// The GitHub token comes from the `screenshots-publishing` CircleCI context.
function generateNotifyGalleryJob(): string[] {
  return [
    `${NOTIFY_GALLERY_JOB_ID}:`,
    `  executor: nodejs`,
    `  resource_class: small`,
    `  steps:`,
    `    - run:`,
    `        name: Trigger screenshot gallery build on GitHub Actions`,
    `        command: |`,
    `          curl --fail --silent --show-error -X POST \\`,
    `            -H "Authorization: Bearer $GALLERY_DISPATCH_TOKEN" \\`,
    `            -H "Accept: application/vnd.github+json" \\`,
    `            -H "X-GitHub-Api-Version: 2022-11-28" \\`,
    `            "https://api.github.com/repos/votingworks/vxsuite/dispatches" \\`,
    `            -d '{"event_type":"build-screenshot-gallery","client_payload":{"ref":"<< pipeline.git.branch >>","tag":"<< pipeline.git.tag >>","sha":"<< pipeline.git.revision >>"}}'`,
  ];
}

// Rust crates are split across independent Cargo workspaces:
// - Root workspace (daemons/logging): Cargo.toml
// - ballot-interpreter: libs/ballot-interpreter/Cargo.toml (types-rs is a path dep)
// - types-rs: libs/types-rs/Cargo.toml
// - pdi-scanner: libs/pdi-scanner/Cargo.toml
const RUST_WORKSPACE_DIRS = [
  '.',
  'libs/ballot-interpreter',
  'libs/types-rs',
  'libs/pdi-scanner',
];

function generateTestJobForRustCrates(): string[] {
  function cargoCommandLines(command: string): string[] {
    return RUST_WORKSPACE_DIRS.map(
      (dir) => `          ${command} --manifest-path ${dir}/Cargo.toml`
    );
  }

  // cargo fmt doesn't support --manifest-path reliably, so use cd
  function cargoFmtCommandLines(): string[] {
    return RUST_WORKSPACE_DIRS.map(
      (dir) => `          (cd ${dir} && cargo fmt --check)`
    );
  }

  return [
    `${RUST_CRATES_JOB_ID}:`,
    // Executors are either nodejs or nodejs-browser. Both have Rust deps installed.
    `  executor: 'nodejs'`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install:`,
    `        is_node_package: false`,
    `    - run:`,
    `        name: Check Formatting`,
    `        command: |`,
    ...cargoFmtCommandLines(),
    `    - run:`,
    `        name: Build`,
    `        command: |`,
    ...cargoCommandLines('cargo build'),
    `    - run:`,
    `        name: Lint`,
    `        command: |`,
    ...cargoCommandLines('cargo clippy --all-targets'),
    `    - run:`,
    `        name: Test`,
    `        command: |`,
    ...cargoCommandLines('cargo test'),
  ];
}

function generateTestJobForPackage(
  pkg: PnpmPackageInfo,
  isConditional?: boolean
): Optional<string[]> {
  /* istanbul ignore else */
  if (pkg.packageJson) {
    return generateTestJobForNodeJsPackage(pkg, isConditional);
  }

  /* istanbul ignore next */
  throw new Error(`Unsupported package type: ${pkg.relativePath}`);
}

/**
 * Path to the CircleCI config file.
 */
export const CIRCLECI_CONFIG_PATH = join(
  __dirname,
  '../../../.circleci/config.yml'
);

function generateCircleCiAppLevelConfigPath(pkg: PnpmPackageInfo): string {
  return join(pkg.relativePath, '.circleci', 'config.yml');
}

function generateJobFilterForPackage(pkg: PnpmPackageInfo): string[] {
  return [
    `    - path-filtering/filter:`,
    `        name: check-updated-files-for-test-filter`,
    `        base-revision: main`,
    `        mapping: |`,
    `          ${pkg.relativePath}/.* run-job true`,
    `        config-path: ${generateCircleCiAppLevelConfigPath(pkg)}`,
  ];
}

function generateCircleCiFilteredAppConfigForPackage(
  pkg: PnpmPackageInfo
): string[] {
  const jobLines = generateTestJobForPackage(pkg, true); // Pass true for conditional
  /* istanbul ignore next */
  if (!jobLines) {
    return [];
  }

  return [
    'version: 2.1',
    '',
    'parameters:',
    `  run-job:`,
    '    type: boolean',
    '    default: false',
    '',
    'executors:',
    '  nodejs:',
    '    docker:',
    '      - image: votingworks/cimg-debian12:4.6.0',
    '        auth:',
    '          username: $VX_DOCKER_USERNAME',
    '          password: $VX_DOCKER_PASSWORD',
    '',
    'commands:',
    '  checkout-and-install:',
    '    description: Get the code and install dependencies.',
    '    parameters:',
    '      is_node_package:',
    '        type: boolean',
    '    steps:',
    '      - run:',
    '          name: Ensure Rust tooling is in PATH',
    '          command: |',
    '            echo \'export PATH="/root/.cargo/bin:$PATH"\' >> $BASH_ENV',
    '      - run:',
    '          name: Fix node-gyp gyp entrypoint permissions',
    '          command: |',
    '            # TODO: Remove once we upgrade past pnpm 11.10, which ships',
    '            # node-gyp with the gyp entrypoints executable.',
    '            # See https://github.com/pnpm/pnpm/issues/12455',
    '            chmod +x "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp" "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp_main.py"',
    '      - checkout',
    '      # Edit this comment somehow in order to invalidate the CircleCI cache.',
    '      # Since the contents of this file affect the cache key, editing only a',
    '      # comment will invalidate the cache without changing the behavior.',
    '      # last edited by Kofi 2024-09-19',
    '      - when:',
    '          condition: << parameters.is_node_package >>',
    '          steps:',
    '            - restore_cache:',
    '                name: Restore Node.js Cache',
    '                key:',
    '                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum',
    '                  "pnpm-lock.yaml" }}',
    '            - run:',
    '                name: Pre-install Node.js headers for node-gyp',
    '                command: |',
    '                  # Concurrent native-module builds during `pnpm install`',
    '                  # race to download and extract the Node headers into the',
    '                  # shared node-gyp devdir, intermittently corrupting the',
    '                  # header tree (builds then fail with errors inside the v8',
    '                  # headers). Extract the headers once up front so the',
    '                  # concurrent builds only ever read them.',
    '                  node "$(npm root -g)/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js" install',
    '            - run:',
    '                name: Install Node.js Dependencies',
    '                command: pnpm install --frozen-lockfile',
    '            - save_cache:',
    '                name: Save Node.js Cache',
    '                key:',
    '                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum',
    '                  "pnpm-lock.yaml" }}',
    '                paths:',
    '                  - /root/.local/share/pnpm/store/v10',
    '                  - /root/.cache/ms-playwright',
    '      - restore_cache:',
    '          name: Restore Cargo Cache',
    '          key:',
    '            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}',
    '      - run:',
    '          name: Install Rust Dependencies',
    '          command: pnpm --recursive install:rust-addon',
    '      - save_cache:',
    '          name: Save Cargo Cache',
    '          key:',
    '            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}',
    '          paths:',
    '            - /root/.cargo',
    '',
    'jobs:',
    `  # ${pkg.name} (conditional - only runs test when backend files change)`,
    ...jobLines.map((line) => `  ${line}`),
    '',
    'workflows:',
    `  test-${pkg.name.replace('@votingworks/', '')}:`,
    '    jobs:',
    `      - ${jobIdForPackage(pkg)}`,
  ];
}

// The moon binary version installed in CI. Keep in sync with the version the
// team develops against (and eventually bake into the CI Docker image).
const MOON_VERSION = '2.4.6';

// Experimental job that runs the whole affected task graph via `moon ci` (which
// is affected-by-default), sharded across containers. It reuses
// `checkout-and-install` for pnpm + rust-addon setup/caching, installs the
// pinned moon binary, and persists moon's own output cache across runs with
// CircleCI save_cache.
//
// Remote cache is env-gated: moon reads `MOON_REMOTE_HOST` (see the host-less
// `remote:` block in .moon/workspace.yml — absent host = off) and, if the cache
// is authenticated, `MOON_REMOTE_AUTH_TOKEN`. Set `MOON_REMOTE_HOST` as a
// CircleCI project/context env var (e.g. `grpc://<cache-ip>:9092`) to turn it
// on. CircleCI does NOT expose project env vars to forked-PR builds, so external
// contributors' PRs run with the remote off and build normally — the desired
// conditional behavior. Sharding is only sound WITH the remote cache: `moon ci
// --job` slices the flat affected-target list positionally and assumes a task's
// cross-shard build deps are hydrated from the shared cache, so without it a
// test can land on a shard lacking a dependency's build output.
// Collect every package's `reports/junit.xml` (written by vitest when CI) into
// one uniquely-named-per-package dir and hand it to store_test_results. Tasks
// that were cache hits didn't re-run and so contribute no fresh junit — that's
// fine, they passed unchanged. Shared by both moon jobs; placed before the
// exit-code propagation so results upload even when a task failed.
function moonTestResultsSteps(): string[] {
  return [
    `    - run:`,
    `        name: Collect JUnit reports`,
    `        command: |`,
    `          mkdir -p /tmp/test-results`,
    `          find . -path '*/reports/junit.xml' -not -path '*/node_modules/*' | while read -r f; do`,
    `            name=$(echo "$f" | sed -e 's|^\\./||' -e 's|/reports/junit.xml$||' -e 's|/|_|g')`,
    `            cp "$f" "/tmp/test-results/\${name}.xml"`,
    `          done`,
    `    - store_test_results:`,
    `        path: /tmp/test-results`,
  ];
}

function generateMoonCiJob(): string[] {
  return [
    `moon-ci:`,
    `  executor: nodejs`,
    `  resource_class: xlarge`,
    // Shard the affected task graph across 3 containers (CircleCI sets
    // CIRCLE_NODE_INDEX / CIRCLE_NODE_TOTAL; \`moon ci --job/--job-total\`
    // partitions positionally). Beyond faster cold wall, spreading the ~50 test
    // suites across containers keeps each box's RAM/CPU load down — a single
    // xlarge running them all at MOON_CONCURRENCY=4 hit contention timeouts
    // (e.g. a heavy ballot-interpreter test). Cross-shard build deps hydrate from
    // the remote cache (MOON_REMOTE_HOST); without it shared deps rebuild per shard.
    `  parallelism: 3`,
    `  environment:`,
    `    # cores/2 for an xlarge (8 vCPU); see MOON_NOTES.md.`,
    `    MOON_CONCURRENCY: '4'`,
    `  steps:`,
    `    - checkout-and-install:`,
    `        is_node_package: true`,
    `    - run:`,
    `        name: Install moon`,
    `        command: |`,
    `          curl -fsSL https://moonrepo.dev/install/moon.sh | MOON_VERSION=${MOON_VERSION} bash`,
    `          echo 'export PATH="$HOME/.moon/bin:$PATH"' >> "$BASH_ENV"`,
    // Cache keys are namespaced by shard index so parallel shards don't clobber
    // each other's save_cache (and a shard only restores its own prior cache).
    `    - restore_cache:`,
    `        keys:`,
    `          - moon-{{ .Environment.CIRCLE_NODE_INDEX }}-{{ .Branch }}-{{ .Revision }}`,
    `          - moon-{{ .Environment.CIRCLE_NODE_INDEX }}-{{ .Branch }}-`,
    `          - moon-{{ .Environment.CIRCLE_NODE_INDEX }}-main-`,
    // Capture moon's exit code rather than failing the step immediately, so the
    // cache save and per-task log upload below always run (even on test failure).
    `    - run:`,
    `        name: moon ci`,
    `        command: |`,
    `          set +e`,
    // Make the remote-cache state obvious in the log. moon picks up
    // MOON_REMOTE_HOST from the environment automatically, but a stray quote or
    // trailing newline in the CircleCI env value makes moon reject the URI
    // ("invalid uri character") and silently disable the cache — so trim
    // surrounding whitespace/quotes and echo the value bracketed to expose any
    // residual junk (\`[grpc://host:9092 ]\` reveals a trailing space).
    `          if [ -n "\${MOON_REMOTE_HOST:-}" ]; then`,
    `            MOON_REMOTE_HOST="$(printf '%s' "$MOON_REMOTE_HOST" | sed -e 's/^[[:space:]"'"'"']*//' -e 's/[[:space:]"'"'"']*$//')"`,
    `            export MOON_REMOTE_HOST`,
    `            echo "remote cache: ENABLED, host=[$MOON_REMOTE_HOST]"`,
    `          else`,
    `            echo "remote cache: disabled (MOON_REMOTE_HOST unset — shards rebuild shared deps)"`,
    `          fi`,
    // \`--downstream none\`: moon ci defaults to also pulling each task's DIRECT
    // dependents in for regression checks, but the affected set already includes
    // them as primaries, so the fan-out just replicates heavy tests into every
    // shard. Dropping it makes each task a primary on exactly one shard.
    `          moon ci --job "$CIRCLE_NODE_INDEX" --job-total "$CIRCLE_NODE_TOTAL" --downstream none --summary`,
    `          echo $? > /tmp/moon-exit-code`,
    `          # Echo any vitest-failed task's captured log to this step's tail, so`,
    `          # the failure survives CircleCI's head-truncation of long step logs`,
    `          # (moon's per-task logs are also uploaded as artifacts below).`,
    `          for d in $(find .moon/cache/states -mindepth 2 -maxdepth 2 -type d); do`,
    `            o="$d/stdout.log"`,
    `            if [ -f "$o" ] && grep -qE "[0-9]+ failed" "$o"; then`,
    `              echo "===== FAILED TASK: $d ====="; tail -120 "$o"`,
    `              echo "--- stderr ---"; tail -60 "$d/stderr.log" 2>/dev/null`,
    `            fi`,
    `          done`,
    `          exit 0`,
    `    - save_cache:`,
    `        key: moon-{{ .Environment.CIRCLE_NODE_INDEX }}-{{ .Branch }}-{{ .Revision }}`,
    `        paths:`,
    `          - .moon/cache/hashes`,
    `          - .moon/cache/outputs`,
    // moon writes each task's stdout/stderr under .moon/cache/states/<proj>/<task>/.
    // Upload them so failures are inspectable even when CircleCI truncates the
    // step log (early-finishing tasks otherwise lose their output).
    `    - store_artifacts:`,
    `        path: .moon/cache/states`,
    `        destination: moon-task-logs`,
    ...moonTestResultsSteps(),
    `    - run:`,
    `        name: Propagate moon ci exit code`,
    `        command: |`,
    `          code=$(cat /tmp/moon-exit-code)`,
    `          echo "moon ci exit code: $code"`,
    `          exit "$code"`,
  ];
}

// Apps whose Playwright integration-testing suite is wired into moon (as a
// `runInCI: false` e2e task). Extend as more apps are wired. (mark-scan's e2e
// needs hardware daemons via `make`, so it is intentionally not here.)
const MOON_E2E_APPS = [
  'admin',
  'central-scan',
  'mark',
  'scan',
  'print',
  'mark-scan',
];

// One "non-required" e2e job PER app (parallel across CircleCI containers), so
// the total e2e wall is the slowest single suite rather than the sum. Each app's
// Playwright suite is excluded from `moon ci` (its task is `runInCI: false`), so
// this runs it explicitly with `moon run`; the remote cache is kept ON so the app
// builds the suite depends on hydrate instead of rebuilding (only the e2e task
// itself is uncached, `cache: false`). Mark every `moon-e2e-*` job NON-required
// in GitHub branch protection so flaky/slow e2e doesn't block merges.
function generateMoonE2eAppJob(app: string): string[] {
  const dir = `apps/${app}/integration-testing`;
  return [
    `moon-e2e-${app}:`,
    `  executor: nodejs`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install:`,
    `        is_node_package: true`,
    `    - run:`,
    `        name: Install moon`,
    `        command: |`,
    `          curl -fsSL https://moonrepo.dev/install/moon.sh | MOON_VERSION=${MOON_VERSION} bash`,
    `          echo 'export PATH="$HOME/.moon/bin:$PATH"' >> "$BASH_ENV"`,
    `    - run:`,
    `        name: Install Playwright Chromium`,
    `        command: |`,
    `          pnpm --dir ${dir} exec playwright install-deps`,
    `          pnpm --dir ${dir} exec playwright install chromium`,
    // mark-scan's suite drives the accessible-controller/PAT daemons, which the
    // moon dep builds don't produce; build them (and the app) via make, matching
    // the per-package integration-testing job.
    ...(app === 'mark-scan'
      ? [
          `    - run:`,
          `        name: Build mark-scan app + hardware daemons (make)`,
          `        no_output_timeout: 20m`,
          `        command: make -C ${dir} build`,
        ]
      : []),
    `    - run:`,
    `        name: moon run e2e (non-required)`,
    `        no_output_timeout: 20m`,
    `        command: |`,
    `          set +e`,
    `          if [ -n "\${MOON_REMOTE_HOST:-}" ]; then`,
    `            MOON_REMOTE_HOST="$(printf '%s' "$MOON_REMOTE_HOST" | sed -e 's/^[[:space:]"'"'"']*//' -e 's/[[:space:]"'"'"']*$//')"`,
    `            export MOON_REMOTE_HOST`,
    `          fi`,
    // The e2e task is `runInCI: false` so `moon ci` (required lane) skips it.
    // moon 2.4.6 has no `--ignore-ci-checks` on `moon run`, and it honors runInCI
    // in a CI env (would report "No tasks found"). moon detects CI via the
    // CI/CI_NAME/AZURE_PIPELINES env vars, so unset CI for just this command to
    // let the explicit `moon run` execute it. Dep builds still hydrate from the
    // remote cache (MOON_REMOTE_HOST exported above).
    `          env -u CI moon run ${app}-integration-testing:test`,
    `          echo $? > /tmp/moon-exit-code`,
    `          exit 0`,
    `    - store_test_results:`,
    `        path: ${dir}/test-results`,
    `    - store_artifacts:`,
    `        path: ${dir}/test-results`,
    `        destination: e2e-test-results`,
    `    - run:`,
    `        name: Propagate moon run exit code`,
    `        command: |`,
    `          code=$(cat /tmp/moon-exit-code)`,
    `          echo "moon run exit code: $code"`,
    `          exit "$code"`,
  ];
}

// PROTOTYPE ONLY: a slim config that runs *just* the experimental `moon-ci` job,
// so we don't spend compute on the ~60 per-package jobs while iterating on the
// moon migration. Regenerate the full config by running the generator without
// MOON_CI_PROTOTYPE. `checkout-and-install` is intentionally duplicated from the
// main config here to leave the normal generation path untouched; the two get
// unified when moon graduates from prototype.
function generateMoonPrototypeConfig(): string {
  return `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`MOON_CI_PROTOTYPE=1 pnpm -w generate-circleci-config\` to regenerate it.
#
# PROTOTYPE: runs ONLY the experimental \`moon-ci\` job. Regenerate without
# MOON_CI_PROTOTYPE to restore the full per-package config.

version: 2.1

executors:
  nodejs:
    docker:
      - image: votingworks/cimg-debian12:4.6.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

jobs:
${generateMoonCiJob()
  .map((line) => `  ${line}`)
  .join('\n')}
${MOON_E2E_APPS.map((app) =>
  generateMoonE2eAppJob(app)
    .map((line) => `  ${line}`)
    .join('\n')
).join('\n')}

workflows:
  moon-experiment:
    jobs:
      - moon-ci:
          context:
            - screenshots-publishing
      # NON-REQUIRED lane (one job per app) — mark every moon-e2e-* job's status
      # non-required in branch protection so slow/flaky e2e doesn't block merges.
${MOON_E2E_APPS.map(
  (app) =>
    `      - moon-e2e-${app}:\n          context:\n            - screenshots-publishing`
).join('\n')}

commands:
  checkout-and-install:
    description: Get the code and install dependencies.
    parameters:
      is_node_package:
        type: boolean
    steps:
      - run:
          name: Ensure Rust tooling is in PATH
          command: |
            echo 'export PATH="/root/.cargo/bin:$PATH"' >> $BASH_ENV
      - run:
          name: Fix node-gyp gyp entrypoint permissions
          command: |
            chmod +x "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp" "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp_main.py"
      - checkout
      - when:
          condition: << parameters.is_node_package >>
          steps:
            - restore_cache:
                name: Restore Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
            - run:
                name: Pre-install Node.js headers for node-gyp
                command: |
                  # Concurrent native-module builds during \`pnpm install\`
                  # race to download and extract the Node headers into the
                  # shared node-gyp devdir, intermittently corrupting the
                  # header tree (builds then fail with errors inside the v8
                  # headers). Extract the headers once up front so the
                  # concurrent builds only ever read them.
                  node "$(npm root -g)/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js" install
            - run:
                name: Install Node.js Dependencies
                command: pnpm install --frozen-lockfile
            - save_cache:
                name: Save Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
                paths:
                  - /root/.local/share/pnpm/store/v10
                  - /root/.cache/ms-playwright
      - restore_cache:
          name: Restore Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}
      - run:
          name: Install Rust Dependencies
          command: pnpm --recursive install:rust-addon
      - save_cache:
          name: Save Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}
          paths:
            - /root/.cargo
`.trim();
}

/**
 * Generates all CircleCI config files.
 */
export function generateAllConfigs(
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>,
  options: { moonPrototype?: boolean; moonJobsMainOnly?: boolean } = {}
): Map<string, string> {
  if (options.moonPrototype) {
    return new Map([[CIRCLECI_CONFIG_PATH, generateMoonPrototypeConfig()]]);
  }

  const [jobsToRunOnChanges, jobsToAlwaysRun] = iter(
    pnpmPackages.values()
  ).partition((pkg) =>
    PACKAGES_ONLY_TEST_ON_CHANGES.includes(pkg.relativePath)
  );

  const pnpmJobs = jobsToAlwaysRun.reduce((memo, pkg) => {
    const jobLines = generateTestJobForPackage(pkg);
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PnpmPackageInfo, string[]>());
  const pnpmJobsToFilter = jobsToRunOnChanges.reduce((memo, pkg) => {
    const jobLines = generateJobFilterForPackage(pkg);
    /* istanbul ignore next */
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PnpmPackageInfo, string[]>());

  const rustJobLines = generateTestJobForRustCrates();

  const integrationTestingJobIds = iter(pnpmPackages.values())
    .filter((pkg) =>
      /^apps\/[^/]+\/integration-testing$/.test(pkg.relativePath)
    )
    .map(jobIdForPackage)
    .toArray();

  const pnpmJobIds = [...pnpmJobs.keys()].map(jobIdForPackage);
  const allJobIds = [
    ...pnpmJobIds,
    // hardcoded jobs
    'shellcheck',
    'validate-monorepo',
    RUST_CRATES_JOB_ID,
  ];

  const notifyGalleryWorkflowEntry = [
    `      - ${NOTIFY_GALLERY_JOB_ID}:`,
    `          context:`,
    `            - screenshots-publishing`,
    `          requires:`,
    ...integrationTestingJobIds.map((id) => `            - ${id}`),
    `          filters:`,
    `            branches:`,
    `              only: main`,
  ].join('\n');

  // The experimental moon jobs, added as NON-BLOCKING additions to the real CI
  // to watch/learn from. They re-run the same tests the per-package jobs do until
  // those are retired. Mark each moon-* job's status non-required in branch
  // protection.
  //
  // `moonJobsMainOnly` gates whether they carry a `branches: only: main` filter.
  // While we're still iterating on moon config it defaults to false so the jobs
  // run on every branch (including the experiment branch) and we get feedback on
  // each push. Flip it to true (env `MOON_JOBS_MAIN_ONLY=1` when regenerating)
  // once the config is stable and we only want them watching `main` to avoid
  // adding cost to every PR.
  const moonJobsMainOnly = options.moonJobsMainOnly ?? false;
  const moonJobBlocks = [
    generateMoonCiJob(),
    ...MOON_E2E_APPS.map((app) => generateMoonE2eAppJob(app)),
  ]
    .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
    .join('\n\n');

  const moonBranchFilter = moonJobsMainOnly
    ? '\n          filters:\n            branches:\n              only: main'
    : '';
  const moonWorkflowEntries = [
    'moon-ci',
    ...MOON_E2E_APPS.map((app) => `moon-e2e-${app}`),
  ]
    .map(
      (jobId) =>
        `      - ${jobId}:\n          context:\n            - screenshots-publishing${moonBranchFilter}`
    )
    .join('\n');

  const baseConfig = `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.

version: 2.1

setup: true

orbs:
  path-filtering: circleci/path-filtering@2
  aws-cli: circleci/aws-cli@5

executors:
  nodejs:
    docker:
      - image: votingworks/cimg-debian12:4.6.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

  nodejs_postgres:
    docker:
      - image: votingworks/cimg-debian12:4.6.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

      - image: cimg/postgres:16.6
        environment:
          POSTGRES_USER: postgres

jobs:
${[...pnpmJobs.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}

${rustJobLines.map((line) => `  ${line}\n`).join('')}

  shellcheck:
    executor: nodejs
    resource_class: medium
    steps:
      - checkout
      - run:
          name: Install shellcheck
          command: |
            apt-get update -qq && apt-get install -y --no-install-recommends shellcheck
      - run:
          name: Shellcheck
          command: |
            script/shellcheck

  validate-monorepo:
    executor: nodejs
    resource_class: xlarge
    steps:
      - checkout-and-install:
          is_node_package: true
      - run:
          name: Build
          command: |
            pnpm --dir script build
      - run:
          name: Validate
          command: |
            ./script/validate-monorepo

${generateNotifyGalleryJob()
  .map((line) => `  ${line}`)
  .join('\n')}

${moonJobBlocks}

workflows:
  test:
    jobs:

${[...pnpmJobsToFilter.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}
${allJobIds
  .map(
    (jobId) =>
      `      - ${jobId}:\n          context:\n            - screenshots-publishing`
  )
  .join('\n')}
${notifyGalleryWorkflowEntry}
${moonWorkflowEntries}

commands:
  checkout-and-install:
    description: Get the code and install dependencies.
    parameters:
      is_node_package:
        type: boolean
    steps:
      - run:
          name: Ensure Rust tooling is in PATH
          command: |
            echo 'export PATH="/root/.cargo/bin:$PATH"' >> $BASH_ENV
      - run:
          name: Fix node-gyp gyp entrypoint permissions
          command: |
            # TODO: Remove once we upgrade past pnpm 11.10, which ships
            # node-gyp with the gyp entrypoints executable.
            # See https://github.com/pnpm/pnpm/issues/12455
            chmod +x "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp" "$(npm root -g)/pnpm/dist/node_modules/node-gyp/gyp/gyp_main.py"
      - checkout
      # Edit this comment somehow in order to invalidate the CircleCI cache.
      # Since the contents of this file affect the cache key, editing only a
      # comment will invalidate the cache without changing the behavior.
      # last edited by Kofi 2024-09-19
      - when:
          condition: << parameters.is_node_package >>
          steps:
            - restore_cache:
                name: Restore Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
            - run:
                name: Pre-install Node.js headers for node-gyp
                command: |
                  # Concurrent native-module builds during \`pnpm install\`
                  # race to download and extract the Node headers into the
                  # shared node-gyp devdir, intermittently corrupting the
                  # header tree (builds then fail with errors inside the v8
                  # headers). Extract the headers once up front so the
                  # concurrent builds only ever read them.
                  node "$(npm root -g)/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js" install
            - run:
                name: Install Node.js Dependencies
                command: pnpm install --frozen-lockfile
            - save_cache:
                name: Save Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
                paths:
                  - /root/.local/share/pnpm/store/v10
                  - /root/.cache/ms-playwright
      - restore_cache:
          name: Restore Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}
      - run:
          name: Install Rust Dependencies
          command: pnpm --recursive install:rust-addon
      - save_cache:
          name: Save Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/Cargo.lock" }}
          paths:
            - /root/.cargo
`.trim();
  const configs = new Map();
  configs.set(CIRCLECI_CONFIG_PATH, baseConfig);
  for (const pkg of jobsToRunOnChanges) {
    const filteredConfigLines =
      generateCircleCiFilteredAppConfigForPackage(pkg);
    /* istanbul ignore else */
    if (filteredConfigLines.length > 0) {
      const filteredConfigPath = join(
        __dirname,
        '../../..',
        generateCircleCiAppLevelConfigPath(pkg)
      );
      configs.set(filteredConfigPath, filteredConfigLines.join('\n').trim());
    }
  }
  return configs;
}
