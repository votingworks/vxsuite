import { join } from 'path';
import { existsSync } from 'fs';
import { Optional } from '@votingworks/basics';
import { PackageInfo } from './pnpm';

function jobIdForPackage(pkg: PackageInfo): string {
  return `test-${pkg.relativePath.replace(/\//g, '-')}`;
}

function generateTestJobForNodeJsPackage(pkg: PackageInfo): Optional<string[]> {
  /* istanbul ignore next */
  if (!pkg.packageJson?.scripts?.['test']) {
    // exclude packages without tests
    return;
  }

  const hasPlaywrightTests = existsSync(`${pkg.path}/playwright.config.ts`);
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

  if (hasPlaywrightTests) {
    lines.push(
      `    - store_artifacts:`,
      `        path: ${pkg.relativePath}/test-results/`
    );
  }

  return lines;
}

function generateTestJobForPackage(pkg: PackageInfo): Optional<string[]> {
  if (pkg.packageJson) {
    return generateTestJobForNodeJsPackage(pkg);
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

/**
 * Generate a CircleCI config file.
 */
export function generateConfig(pkgs: ReadonlyMap<string, PackageInfo>): string {
  const jobs = [...pkgs.values()].reduce((memo, pkg) => {
    const jobLines = generateTestJobForPackage(pkg);
    if (!jobLines) {
      return memo;
    }
    return memo.set(pkg, jobLines);
  }, new Map<PackageInfo, string[]>());
  const jobIds = [
    ...[...jobs.keys()].map((pkg) => jobIdForPackage(pkg)),
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
      - image: votingworks/cimg-debian12-browsers:3.0.1
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD
  nodejs:
    docker:
      - image: votingworks/cimg-debian12:3.0.1
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

jobs:
${[...jobs.values()]
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
      # last edited by Ben 2023-11-17
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
