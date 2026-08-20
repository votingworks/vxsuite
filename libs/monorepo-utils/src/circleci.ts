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
  // CI runs each package's `test:run` (vitest once; coverage enforced via the
  // shared config's `CI` gate), falling back to `test` for packages without one
  // (the Playwright integration-testing suites). VxDesign keeps a dedicated
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
    ...(isConditional
      ? [
          `    - when:`,
          `        condition: << pipeline.parameters.run-job >>`,
          `        steps:`,
          `          - run:`,
          `              name: Test`,
          `              command: |`,
          `                pnpm --dir ${pkg.relativePath} ${testScript}`,
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
          `          pnpm --dir ${pkg.relativePath} ${testScript}`,
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
    '      - image: votingworks/cimg-debian12:4.7.0',
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

/**
 * Generates all CircleCI config files.
 */
export function generateAllConfigs(
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>
): Map<string, string> {
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
    // TEMPORARY: remove once Turborepo is the default (see the job definition).
    'build-with-turbo',
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
      - image: votingworks/cimg-debian12:4.7.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

  nodejs_postgres:
    docker:
      - image: votingworks/cimg-debian12:4.7.0
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

  # TEMPORARY: Turborepo is opt-in (via VX_USE_TURBO); every other CI job runs
  # the pre-Turbo pnpm path. This job exercises the Turbo build path end-to-end
  # so it can't silently rot while opt-in. Remove it once VX_USE_TURBO is the
  # default and the rest of CI runs through Turbo.
  build-with-turbo:
    executor: nodejs
    resource_class: xlarge
    environment:
      VX_USE_TURBO: '1'
    steps:
      - checkout-and-install:
          is_node_package: true
      - run:
          name: Build all packages with Turbo
          command: |
            pnpm build

${generateNotifyGalleryJob()
  .map((line) => `  ${line}`)
  .join('\n')}

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
