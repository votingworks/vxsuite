import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { iter, Optional } from '@votingworks/basics';
import { PnpmPackageInfo } from './types';

function jobIdForPackage(pkg: PnpmPackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

const RUST_CRATES_JOB_ID = 'test-rust-crates';

const POSTGRES_PACKAGES: string[] = ['apps/design/backend'];
// The following packages are only tested when there is a change to its directory.
const PACKAGES_ONLY_TEST_ON_CHANGES = ['apps/pollbook/backend'];

function generateTestJobForNodeJsPackage(
  pkg: PnpmPackageInfo,
  isConditional?: boolean
): Optional<string[]> {
  if (!pkg.packageJson?.scripts?.['test']) {
    // exclude packages without tests
    return;
  }

  const hasPlaywrightTests = existsSync(`${pkg.path}/playwright.config.ts`);
  const hasSnapshotTests = existsSync(`${pkg.path}/src/__image_snapshots__`);
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
            /* istanbul ignore next - @preserve */
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
    lines.push(`${indent}- store_artifacts:`);
    if (hasSnapshotTests) {
      lines.push(
        `${indent}    path: ${pkg.relativePath}/src/__image_snapshots__/__diff_output__/`
      );
    }
    if (hasPlaywrightTests) {
      lines.push(`${indent}    path: ${pkg.relativePath}/test-results/`);
    }
  }

  return lines;
}

function generateTestJobForRustCrates(): string[] {
  return [
    `${RUST_CRATES_JOB_ID}:`,
    // Executors are either nodejs or nodejs-browser. Both have Rust deps installed.
    `  executor: 'nodejs'`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install:`,
    `        is_node_package: false`,
    `    - run:`,
    `        name: Build`,
    `        command: |`,
    `          cargo build`,
    `    - run:`,
    `        name: Lint`,
    `        command: |`,
    `          cargo clippy`,
    `    - run:`,
    `        name: Test`,
    `        command: |`,
    `          cargo test`,
  ];
}

function generateTestJobForPackage(
  pkg: PnpmPackageInfo,
  isConditional?: boolean
): Optional<string[]> {
  /* istanbul ignore else - @preserve */
  if (pkg.packageJson) {
    return generateTestJobForNodeJsPackage(pkg, isConditional);
  }

  /* istanbul ignore next - @preserve */
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
  /* istanbul ignore next - @preserve */
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
    '      - image: votingworks/cimg-debian12:4.2.0',
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
    '                name: Install Node.js Dependencies',
    '                command: pnpm install --frozen-lockfile',
    '            - save_cache:',
    '                name: Save Node.js Cache',
    '                key:',
    '                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum',
    '                  "pnpm-lock.yaml" }}',
    '                paths:',
    '                  - /root/.local/share/pnpm/store/v3',
    '                  - /root/.cache/ms-playwright',
    '      - restore_cache:',
    '          name: Restore Cargo Cache',
    '          key:',
    '            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum',
    '            "Cargo.lock" }}',
    '      - run:',
    '          name: Install Rust Dependencies',
    '          command: pnpm --recursive install:rust-addon',
    '      - save_cache:',
    '          name: Save Cargo Cache',
    '          key:',
    '            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum',
    '            "Cargo.lock" }}',
    '          paths:',
    '            - /root/.cargo',
    '',
    'jobs:',
    `  # ${pkg.name} (conditional - only runs test when backend files change)`,
    ...jobLines.map((line) => `  ${line}`),
    '',
    'workflows:',
    '  test:',
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
    /* istanbul ignore next - @preserve */
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PnpmPackageInfo, string[]>());

  const rustJobLines = generateTestJobForRustCrates();

  const jobIds = [
    ...[...pnpmJobs.keys()].map(jobIdForPackage),
    // hardcoded jobs
    'validate-monorepo',
    RUST_CRATES_JOB_ID,
  ];

  const baseConfig = `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.

version: 2.1

setup: true

orbs:
  path-filtering: circleci/path-filtering@1

executors:
  nodejs:
    docker:
      - image: votingworks/cimg-debian12:4.2.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

  nodejs_postgres:
    docker:
      - image: votingworks/cimg-debian12:4.2.0
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

workflows:
  test:
    jobs:

${[...pnpmJobsToFilter.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}
${jobIds.map((jobId) => `      - ${jobId}`).join('\n')}

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
                name: Install Node.js Dependencies
                command: pnpm install --frozen-lockfile
            - save_cache:
                name: Save Node.js Cache
                key:
                  pnpm-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "pnpm-lock.yaml" }}
                paths:
                  - /root/.local/share/pnpm/store/v3
                  - /root/.cache/ms-playwright
      - restore_cache:
          name: Restore Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}
      - run:
          name: Install Rust Dependencies
          command: pnpm --recursive install:rust-addon
      - save_cache:
          name: Save Cargo Cache
          key:
            cargo-cache-{{ checksum ".circleci/config.yml" }}-{{ checksum "Cargo.lock" }}
          paths:
            - /root/.cargo
`.trim();
  const configs = new Map();
  configs.set(CIRCLECI_CONFIG_PATH, baseConfig);
  for (const pkg of jobsToRunOnChanges) {
    const filteredConfigLines =
      generateCircleCiFilteredAppConfigForPackage(pkg);
    /* istanbul ignore else - @preserve */
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
