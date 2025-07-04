import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { Optional } from '@votingworks/basics';
import { PnpmPackageInfo } from './types';

function jobIdForPackage(pkg: PnpmPackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

const RUST_CRATES_JOB_ID = 'test-rust-crates';

const POSTGRES_PACKAGES: string[] = ['apps/design/backend'];

function generateTestJobForNodeJsPackage(
  pkg: PnpmPackageInfo
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
  ];

  if (hasSnapshotTests || hasPlaywrightTests) {
    lines.push(`    - store_artifacts:`);
  }

  if (hasSnapshotTests) {
    lines.push(
      `        path: ${pkg.relativePath}/src/__image_snapshots__/__diff_output__/`
    );
  }

  if (hasPlaywrightTests) {
    lines.push(`        path: ${pkg.relativePath}/test-results/`);
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

function generateTestJobForPackage(pkg: PnpmPackageInfo): Optional<string[]> {
  /* istanbul ignore else - @preserve */
  if (pkg.packageJson) {
    return generateTestJobForNodeJsPackage(pkg);
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

/**
 * Generate a CircleCI config file.
 */
export function generateConfig(
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>
): string {
  const pnpmJobs = [...pnpmPackages.values()].reduce((memo, pkg) => {
    const jobLines = generateTestJobForPackage(pkg);
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

  return `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.

version: 2.1

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
}
