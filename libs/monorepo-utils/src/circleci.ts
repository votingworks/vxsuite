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

  const hasCypressTests = existsSync(`${pkg.path}/cypress`);
  const lines = [
    `# ${pkg.name}`,
    `${jobIdForPackage(pkg)}:`,
    `  executor: ${hasCypressTests ? 'nodejs-browsers' : 'nodejs'}`,
    `  resource_class: xlarge`,
    `  steps:`,
    ...(hasCypressTests ? [`    - install-cypress-browser`] : []),
    `    - checkout-and-install`,
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

  if (hasCypressTests) {
    lines.push(
      `    - store_artifacts:`,
      `        path: ${pkg.relativePath}/cypress/screenshots/`,
      `    - store_artifacts:`,
      `        path: ${pkg.relativePath}/cypress/videos/`
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
    'test-services-converter-ms-sems',
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
      - image: votingworks/cimg-debian11-browsers:2.0.3
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD
  nodejs:
    docker:
      - image: votingworks/cimg-debian11:2.0.3
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

jobs:
${[...jobs.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}

  # TODO: remove this once we replace the Python code
  test-services-converter-ms-sems:
    executor: nodejs
    resource_class: medium
    steps:
      - checkout
      - run:
          name: Dependencies
          command: |
            sudo apt update -y
            make -C services/converter-ms-sems install-dependencies
            make -C services/converter-ms-sems install-dev-dependencies
      - run:
          name: Test
          command: |
            make -C services/converter-ms-sems coverage

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
      - restore_cache:
          key:
            dotcache-cache-{{checksum ".circleci/config.yml" }}-{{ checksum
            "pnpm-lock.yaml" }}
      - run:
          name: Setup Dependencies
          command: |
            pnpm install --frozen-lockfile
      - save_cache:
          key:
            dotcache-cache-{{checksum ".circleci/config.yml" }}-{{ checksum
            "pnpm-lock.yaml" }}
          paths:
            - /root/.local/share/pnpm/store/v3
            - /root/.cache/Cypress
            - /root/.cargo
  install-cypress-browser:
    description: Installs a browser for Cypress tests.
    steps:
      - run: sudo apt update
      - browser-tools/install-chrome:
          # TODO remove following line when fixed https://github.com/CircleCI-Public/browser-tools-orb/issues/90
          chrome-version: 116.0.5845.96
      - browser-tools/install-chromedriver

`.trim();
}
