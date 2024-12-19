import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { Optional } from '@votingworks/basics';
import { PnpmPackageInfo } from './types';

function jobIdForPackage(pkg: PnpmPackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

function jobIdForRustPackageId(pkgId: string): string {
  return `test-crate-${pkgId}`;
}

function generateTestJobForNodeJsPackage(
  pkg: PnpmPackageInfo
): Optional<string[]> {
  if (!pkg.packageJson?.scripts?.['test']) {
    // exclude packages without tests
    return;
  }

  const hasPlaywrightTests = existsSync(`${pkg.path}/playwright.config.ts`);
  const hasSnapshotTests = existsSync(`${pkg.path}/src/__image_snapshots__`);
  const isIntegrationTestJob = hasPlaywrightTests;
  const lines = [
    `# ${pkg.name}`,
    `${jobIdForPackage(pkg)}:`,
    `  executor: ${isIntegrationTestJob ? 'nodejs-browsers' : 'nodejs'}`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install`,
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
    `        path: ${pkg.relativePath}/reports/`,
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

function generateTestJobForRustCrate(pkgId: string): string[] {
  return [
    `${jobIdForRustPackageId(pkgId)}:`,
    // Executors are either nodejs or nodejs-browser. Both have Rust deps installed.
    `  executor: 'nodejs'`,
    `  resource_class: xlarge`,
    `  steps:`,
    `    - checkout-and-install`,
    `    - run:`,
    `        name: Build`,
    `        command: |`,
    `          cargo build -p ${pkgId}`,
    `    - run:`,
    `        name: Lint`,
    `        command: |`,
    `          cargo clippy -p ${pkgId}`,
    `    - run:`,
    `        name: Test`,
    `        command: |`,
    `          cargo test -p ${pkgId}`,
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
  pnpmPackages: ReadonlyMap<string, PnpmPackageInfo>,
  rustPackageIds: string[]
): string {
  const pnpmJobs = [...pnpmPackages.values()].reduce((memo, pkg) => {
    const jobLines = generateTestJobForPackage(pkg);
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PnpmPackageInfo, string[]>());
  const rustJobs = rustPackageIds.map(generateTestJobForRustCrate);
  const jobIds = [
    ...[...pnpmJobs.keys()].map(jobIdForPackage),
    ...rustPackageIds.map(jobIdForRustPackageId),
    // hardcoded jobs
    'validate-monorepo',
  ];

  return `
# THIS FILE IS GENERATED. DO NOT EDIT IT DIRECTLY.
# Run \`pnpm -w generate-circleci-config\` to regenerate it.

version: 2.1

orbs:
  browser-tools: circleci/browser-tools@1.4.3

executors:
  nodejs-browsers:
    docker:
      - image: votingworks/cimg-debian12-browsers:4.1.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD
  nodejs:
    docker:
      - image: votingworks/cimg-debian12:4.1.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

jobs:
${[...pnpmJobs.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}

${rustJobs
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}

  validate-monorepo:
    executor: nodejs
    resource_class: xlarge
    steps:
      - checkout-and-install
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
    steps:
      - run:
          name: Ensure rust is in the PATH variable
          command: |
            echo 'export PATH="/root/.cargo/bin:$PATH"' >> $BASH_ENV
      - checkout
      # Edit this comment somehow in order to invalidate the CircleCI cache.
      # Since the contents of this file affect the cache key, editing only a
      # comment will invalidate the cache without changing the behavior.
      # last edited by Kofi 2024-09-19
      - restore_cache:
          key:
            dotcache-cache-{{checksum ".circleci/config.yml" }}-{{ checksum
            "pnpm-lock.yaml" }}
      - run:
          name: Setup Dependencies
          command: |
            pnpm install --frozen-lockfile
            pnpm --recursive install:rust-addon
            pnpm --recursive build:rust-addon
      - save_cache:
          key:
            dotcache-cache-{{checksum ".circleci/config.yml" }}-{{ checksum
            "pnpm-lock.yaml" }}
          paths:
            - /root/.local/share/pnpm/store/v3
            - /root/.cache/ms-playwright
            - /root/.cargo
`.trim();
}
