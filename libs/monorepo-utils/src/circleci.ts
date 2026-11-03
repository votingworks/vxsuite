import { basename, join, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { iter, type Optional } from '@votingworks/basics';
import type { PnpmPackageInfo } from './types.js';

function jobIdForPackage(pkg: PnpmPackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

const RUST_CRATES_JOB_ID = 'test-rust-crates';

const DOCKER_IMAGE = 'votingworks/cimg-debian12:4.9.0';

// Turbo's on-disk cache lives at `<repo root>/.turbo/cache`. CI persists it so
// a job restores its dependency chain instead of rebuilding it.
//
// Only `main` writes the cache; branch jobs are read-only against it. CircleCI
// cache keys are immutable, so a key has to rotate per revision to stay fresh,
// and letting all ~60 jobs write on every push to every branch would pile up
// an archive per job per push. Branches still restore main's baseline, which
// is where nearly all of the reuse is.
//
// The key is scoped to the job (dozens of jobs sharing one key would keep only
// whichever finished first, and per-job archives stay small) and to the config
// checksum, which covers the executor image — an image bump can't replay
// artifacts built by a different toolchain.
const TURBO_CACHE_PATH = '.turbo/cache';
const TURBO_CACHE_KEY_PREFIX =
  'turbo-cache-{{ .Environment.CIRCLE_JOB }}-{{ checksum ".circleci/continue_config.yml" }}-main';

function turboCacheRestoreSteps(indent: string): string[] {
  return [
    `${indent}- restore_cache:`,
    `${indent}    name: Restore Turbo Cache`,
    `${indent}    keys:`,
    // An exact hit only happens when re-running a job on the same `main`
    // commit; everything else falls back to the newest `main` archive.
    `${indent}      - ${TURBO_CACHE_KEY_PREFIX}-{{ .Revision }}`,
    `${indent}      - ${TURBO_CACHE_KEY_PREFIX}-`,
  ];
}

// Branches that write the Turbo cache. Normally just `main` — add a branch
// here temporarily to exercise the prune/save path on it before merging.
const CACHE_WRITING_BRANCHES = ['main'];

// Always an `or:`, even for a single branch: special-casing one branch to a
// bare `equal:` would leave whichever form is currently unused uncovered.
function cacheWritingBranchCondition(indent: string): string[] {
  return [
    `${indent}  or:`,
    ...CACHE_WRITING_BRANCHES.map(
      (branch) =>
        `${indent}    - equal: [ ${branch}, << pipeline.git.branch >> ]`
    ),
  ];
}

function turboCacheSaveSteps(indent: string): string[] {
  return [
    `${indent}- when:`,
    `${indent}    condition:`,
    ...cacheWritingBranchCondition(`${indent}    `),
    `${indent}    steps:`,
    `${indent}      - run:`,
    `${indent}          name: Prune Turbo Cache`,
    // Save even when the job failed: the build artifacts are still valid and
    // worth reusing, and turbo never caches a failing task anyway.
    `${indent}          when: always`,
    `${indent}          command: |`,
    `${indent}            ./script/prune-turbo-cache`,
    `${indent}      - save_cache:`,
    `${indent}          name: Save Turbo Cache`,
    `${indent}          when: always`,
    `${indent}          key: ${TURBO_CACHE_KEY_PREFIX}-{{ .Revision }}`,
    `${indent}          paths:`,
    `${indent}            - ${TURBO_CACHE_PATH}`,
  ];
}

const POSTGRES_PACKAGES: string[] = ['apps/hub/backend'];

function findImageSnapshotDirsRelativeToSrc(pkgPath: string): string[] {
  const srcPath = join(pkgPath, 'src');
  if (!existsSync(srcPath)) return [];
  return (readdirSync(srcPath, { recursive: true }) as string[]).filter(
    (entry) => basename(entry) === '__image_snapshots__'
  );
}

function generateTestJobForNodeJsPackage(
  pkg: PnpmPackageInfo
): Optional<string[]> {
  if (!pkg.packageJson?.scripts?.['test']) {
    // exclude packages without tests
    return;
  }

  const hasPlaywrightTests = existsSync(`${pkg.path}/playwright.config.ts`);
  const snapshotDirs = findImageSnapshotDirsRelativeToSrc(pkg.path);
  const hasSnapshotTests = snapshotDirs.length > 0;
  const needsPostgres = POSTGRES_PACKAGES.includes(pkg.relativePath);
  // CI runs each package's `test:run` (vitest once; coverage enforced via the
  // shared config's `CI` gate), falling back to `test` for packages without one
  // (the Playwright integration-testing suites). VxHub keeps a dedicated
  // `test:ci` for its Postgres/migration CI steps; prefer it when present.
  const testScript = pkg.packageJson?.scripts?.['test:ci']
    ? 'test:ci'
    : pkg.packageJson?.scripts?.['test:run']
      ? 'test:run'
      : 'test';

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
    `    - run:`,
    `        name: Test`,
    `        command: |`,
    `          pnpm --dir ${pkg.relativePath} ${testScript}`,
    `        environment:`,
    `          JEST_JUNIT_OUTPUT_DIR: ./reports/`,
    `    - store_test_results:`,
    `        path: ${pkg.relativePath}/${
      hasPlaywrightTests ? 'test-results' : 'reports'
    }/`,
  ];

  if (hasSnapshotTests || hasPlaywrightTests) {
    const indent = '    ';
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

  lines.push(...turboCacheSaveSteps('    '));

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
// - ballot-interpreter: libs/ballot-interpreter/rust/Cargo.toml (types-rs is a path dep)
// - types-rs: libs/types-rs/Cargo.toml
// - pdi-scanner: libs/pdi-scanner/rust/Cargo.toml
const RUST_WORKSPACE_DIRS = [
  '.',
  'libs/ballot-interpreter/rust',
  'libs/types-rs',
  'libs/pdi-scanner/rust',
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

function generateTestJobForPackage(pkg: PnpmPackageInfo): Optional<string[]> {
  if (pkg.packageJson) {
    return generateTestJobForNodeJsPackage(pkg);
  }

  // @coverage-exclude
  throw new Error(`Unsupported package type: ${pkg.relativePath}`);
}

const CIRCLECI_DIR = join(import.meta.dirname, '../../../.circleci');

/**
 * Path to the CircleCI setup config, which selects the jobs to run.
 */
export const CIRCLECI_CONFIG_PATH = join(CIRCLECI_DIR, 'config.yml');

/**
 * Path to the CircleCI config with every job; `script/ci-select-jobs` appends
 * the workflow for the selected jobs.
 */
export const CIRCLECI_CONTINUE_CONFIG_PATH = join(
  CIRCLECI_DIR,
  'continue_config.yml'
);

/**
 * Path to the manifest `script/ci-select-jobs` reads to select jobs.
 */
export const CIRCLECI_JOB_SELECTION_PATH = join(
  CIRCLECI_DIR,
  'job_selection.json'
);

const ALWAYS_RUN_JOB_IDS = ['shellcheck', 'validate-monorepo'];

// The only CI status GitHub requires; it waits on every selected job.
const CI_PASSED_JOB_ID = 'ci-passed';

/**
 * What `script/ci-select-jobs` needs to turn `turbo ls --affected` into jobs.
 */
export interface JobSelection {
  /** Package directory to its test job. */
  readonly packageJobs: { readonly [path: string]: string };
  readonly alwaysJobs: readonly string[];
  /** Changes under these paths, which Turbo doesn't see, run every job. */
  readonly runAllPrefixes: readonly string[];
  readonly rustJob: string;
  /** Changed files matching this also run `rustJob`. */
  readonly rustPattern: string;
  /**
   * Packages that build against the root Cargo workspace; a change to its
   * `Cargo.toml` or `Cargo.lock` affects them and their dependents.
   */
  readonly rootCargoPackages: readonly string[];
  /** Requires every selected job. */
  readonly passedJob: string;
  /** Run on `main` after `galleryRequires`. */
  readonly galleryJob: string;
  readonly galleryRequires: readonly string[];
}

const ROOT_CARGO_LOCK_PATH = join(CIRCLECI_DIR, '../Cargo.lock');

function hasRootCargoLockInput(pkg: PnpmPackageInfo): boolean {
  const turboJsonPath = join(pkg.path, 'turbo.json');
  if (!existsSync(turboJsonPath)) {
    return false;
  }
  const { tasks } = JSON.parse(readFileSync(turboJsonPath, 'utf-8')) as {
    tasks: Record<string, { inputs?: string[] }>;
  };
  return Object.values(tasks).some((task) =>
    task.inputs?.some(
      (input) => resolve(pkg.path, input) === ROOT_CARGO_LOCK_PATH
    )
  );
}

function generateJobSelection(
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>,
  testedPackages: readonly PnpmPackageInfo[]
): JobSelection {
  return {
    packageJobs: Object.fromEntries(
      testedPackages.map((pkg) => [pkg.relativePath, jobIdForPackage(pkg)])
    ),
    alwaysJobs: ALWAYS_RUN_JOB_IDS,
    runAllPrefixes: ['.circleci/', 'script/'],
    rustJob: RUST_CRATES_JOB_ID,
    rustPattern: String.raw`(\.rs|(^|/)Cargo\.(toml|lock)|(^|/)rust-toolchain(\.toml)?)$`,
    rootCargoPackages: iter(pnpmPackages.values())
      .filter(hasRootCargoLockInput)
      .map((pkg) => pkg.name)
      .toArray(),
    passedJob: CI_PASSED_JOB_ID,
    galleryJob: NOTIFY_GALLERY_JOB_ID,
    galleryRequires: testedPackages
      .filter((pkg) =>
        /^apps\/[^/]+\/integration-testing$/.test(pkg.relativePath)
      )
      .map(jobIdForPackage),
  };
}

const SETUP_CONFIG = `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.

version: 2.1

setup: true

orbs:
  continuation: circleci/continuation@1

jobs:
  select-jobs:
    docker:
      - image: cimg/base:current
    resource_class: small
    steps:
      - run:
          name: Fetch Workspace Manifests
          command: |
            # Only commits and the files Turbo reads to build the package
            # graph; \`git diff\` fetches the other trees it compares.
            git clone --quiet --filter=tree:0 --no-checkout https://github.com/votingworks/vxsuite.git .
            git cat-file -e "$CIRCLE_SHA1" 2>/dev/null || git fetch --quiet origin "$CIRCLE_SHA1"
            git sparse-checkout set --no-cone '/*.json' '/*.yaml' '**/package.json' /.circleci/ /script/ci-select-jobs
            git checkout --quiet "$CIRCLE_SHA1"
      - run:
          name: Install Turbo
          command: |
            version="$(jq -r .devDependencies.turbo package.json)"
            mkdir /tmp/turbo
            curl -fsSL "https://registry.npmjs.org/@turbo/linux-64/-/linux-64-\${version}.tgz" | tar -xz -C /tmp/turbo --strip-components=1
            sudo install /tmp/turbo/bin/turbo /usr/local/bin/turbo
            turbo --version
      - run:
          name: Select Jobs
          command: |
            ./script/ci-select-jobs "$CIRCLE_SHA1" /tmp/continue_config.yml
      - store_artifacts:
          path: /tmp/continue_config.yml
      - continuation/continue:
          configuration_path: /tmp/continue_config.yml

workflows:
  setup:
    jobs:
      - select-jobs
`.trim();

/**
 * Generates all CircleCI config files.
 */
export function generateAllConfigs(
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>
): Map<string, string> {
  const pnpmJobs = iter(pnpmPackages.values()).reduce((memo, pkg) => {
    const jobLines = generateTestJobForPackage(pkg);
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PnpmPackageInfo, string[]>());

  const rustJobLines = generateTestJobForRustCrates();

  const continueConfig = `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.
#
# \`script/ci-select-jobs\` appends the workflow for the jobs to run.

version: 2.1

orbs:
  aws-cli: circleci/aws-cli@5

executors:
  nodejs:
    docker:
      - image: ${DOCKER_IMAGE}
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

  nodejs_postgres:
    docker:
      - image: ${DOCKER_IMAGE}
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
      - run:
          name: Check Formatting
          command: |
            pnpm format:check
${turboCacheSaveSteps('      ').join('\n')}

  ${CI_PASSED_JOB_ID}:
    docker:
      - image: cimg/base:current
    resource_class: small
    steps:
      - run:
          name: All selected jobs passed
          command: |
            true

${generateNotifyGalleryJob()
  .map((line) => `  ${line}`)
  .join('\n')}

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
          name: Configure Turbo for CI
          command: |
            # Identifies the toolchain that produced cached artifacts.
            echo 'export VX_TOOLCHAIN_ID="${DOCKER_IMAGE}"' >> $BASH_ENV
            # Run summaries record each task's hash under .turbo/runs;
            # script/prune-turbo-cache uses them to trim the cache before it
            # is saved.
            echo 'export TURBO_RUN_SUMMARY=true' >> $BASH_ENV
      - checkout
      # Edit this comment somehow in order to invalidate the CircleCI cache.
      # Since the contents of this file affect the cache key, editing only a
      # comment will invalidate the cache without changing the behavior.
      # last edited by Kofi 2024-09-19
      - run:
          name: Pre-install Node.js headers for node-gyp
          command: |
            # Concurrent native-module builds race to download and extract
            # the Node headers into the shared node-gyp devdir,
            # intermittently corrupting the header tree (builds then fail
            # with errors inside the v8 headers). Extract the headers once
            # up front so the concurrent builds only ever read them.
            node "$(npm root -g)/pnpm/dist/node_modules/node-gyp/bin/node-gyp.js" install
      - when:
          condition: << parameters.is_node_package >>
          steps:
            - restore_cache:
                name: Restore Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/continue_config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
            - run:
                name: Install Node.js Dependencies
                command: pnpm install --frozen-lockfile
            - save_cache:
                name: Save Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/continue_config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
                paths:
                  - /root/.local/share/pnpm/store/v11
                  - /root/.cache/ms-playwright
${turboCacheRestoreSteps('            ').join('\n')}
      - restore_cache:
          name: Restore Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/continue_config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/rust/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/rust/Cargo.lock" }}
      - run:
          name: Install Rust Toolchain
          command: rustup toolchain install
      - run:
          name: Install Rust Dependencies
          command: pnpm --recursive install:rust-addon
      - save_cache:
          name: Save Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/continue_config.yml" }}-{{ checksum "Cargo.lock" }}-{{ checksum "libs/ballot-interpreter/rust/Cargo.lock" }}-{{ checksum "libs/pdi-scanner/rust/Cargo.lock" }}
          paths:
            - /root/.cargo
`.trim();

  const jobSelection = generateJobSelection(pnpmPackages, [...pnpmJobs.keys()]);

  return new Map([
    [CIRCLECI_CONFIG_PATH, SETUP_CONFIG],
    [CIRCLECI_CONTINUE_CONFIG_PATH, continueConfig],
    [CIRCLECI_JOB_SELECTION_PATH, `${JSON.stringify(jobSelection, null, 2)}\n`],
  ]);
}
