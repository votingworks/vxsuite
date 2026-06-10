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

// Screenshots are published into a per-version S3 prefix: `main` for the main
// branch and the tag name (e.g. `v4.1.0`) for release tags. The `$` anchor
// matches release tags only (vA.B.C), excluding -rc/-alpha/-beta and the
// date-*-hwta / vxpollbook-* tag families. Single backslashes are intentional:
// the same string is used verbatim as a CircleCI filter regex (`/.../`) and as
// a single-quoted `matches` pattern in a `when` condition.
const RELEASE_TAG_PATTERN = '^v[0-9]+\\.[0-9]+\\.[0-9]+$';

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
      // On `main` and on release tags, upload screenshots to S3 under a
      // per-version prefix (`screenshots/main/...` or `screenshots/<tag>/...`)
      // so the publish-screenshot-gallery job can build a versioned gallery.
      // AWS credentials and bucket name come from the `screenshots-publishing`
      // CircleCI context. VERSION resolves to the tag on a tag build, else the
      // branch name (`main`).
      const appName = pkg.relativePath
        .replace(/^apps\//, '')
        .replace(/\/integration-testing$/, '');
      lines.push(`${indent}- when:`);
      lines.push(`${indent}    condition:`);
      lines.push(`${indent}      or:`);
      lines.push(
        `${indent}        - equal: [ main, << pipeline.git.branch >> ]`
      );
      lines.push(
        `${indent}        - matches: { pattern: '${RELEASE_TAG_PATTERN}', value: << pipeline.git.tag >> }`
      );
      lines.push(`${indent}    steps:`);
      lines.push(`${indent}      - aws-cli/setup`);
      lines.push(`${indent}      - run:`);
      lines.push(`${indent}          name: Upload screenshots to S3`);
      lines.push(`${indent}          command: |`);
      lines.push(
        `${indent}            VERSION="\${CIRCLE_TAG:-$CIRCLE_BRANCH}"`
      );
      lines.push(
        `${indent}            if [ -d "${pkg.relativePath}/test-results/screenshots" ]; then`
      );
      lines.push(
        `${indent}              aws s3 sync ${pkg.relativePath}/test-results/screenshots/ \\`
      );
      lines.push(
        `${indent}                "s3://$SCREENSHOT_BUCKET/screenshots/$VERSION/${appName}/" \\`
      );
      lines.push(
        `${indent}                --exclude "*" --include "*.png" --delete`
      );
      lines.push(`${indent}            fi`);
    }
  }

  return lines;
}

const PUBLISH_SCREENSHOT_GALLERY_JOB_ID = 'publish-screenshot-gallery';
const THUMBSUP_VERSION = '2.18.0';

function generatePublishScreenshotGalleryJob(): string[] {
  return [
    `${PUBLISH_SCREENSHOT_GALLERY_JOB_ID}:`,
    `  executor: nodejs`,
    `  resource_class: small`,
    `  steps:`,
    `    - aws-cli/setup`,
    `    - run:`,
    `        name: Install thumbsup native dependencies`,
    `        command: |`,
    `          apt-get update -qq`,
    `          apt-get install -y --no-install-recommends graphicsmagick exiftool`,
    `    - run:`,
    // Each run rebuilds only its own version's gallery into the `$VERSION/`
    // prefix; the landing index (regenerated below) is what ties the versions
    // together, so historical galleries are never re-thumbsup'd.
    `        name: Build and publish versioned gallery`,
    `        command: |`,
    `          VERSION="\${CIRCLE_TAG:-$CIRCLE_BRANCH}"`,
    `          mkdir -p screenshots`,
    `          aws s3 sync "s3://$SCREENSHOT_BUCKET/screenshots/$VERSION/" screenshots/`,
    `          printf '%s\\n' \\`,
    `            'body { border-top-color: #6638b6; }' \\`,
    `            'h1, h3, footer { color: #6638b6; }' \\`,
    `            'nav.breadcrumbs a { background-color: #6638b6; }' \\`,
    `            'nav.breadcrumbs li.active { background-color: #a580d8; }' \\`,
    `            > ./gallery-theme.css`,
    `          npx --yes thumbsup@${THUMBSUP_VERSION} \\`,
    `            --input ./screenshots \\`,
    `            --output ./gallery \\`,
    `            --title "VxSuite Screenshots — $VERSION" \\`,
    `            --albums-from "%path" \\`,
    `            --sort-albums-by title \\`,
    `            --sort-media-by filename \\`,
    `            --theme classic \\`,
    `            --theme-style ./gallery-theme.css \\`,
    `            --thumb-size 200 \\`,
    `            --photo-preview copy \\`,
    `            --photo-download copy \\`,
    `            --include-videos false \\`,
    `            --home-album-name "VxSuite Screenshots ($VERSION)"`,
    // --delete is scoped to the `$VERSION/` prefix so it never touches other
    // versions' galleries.
    `          aws s3 sync ./gallery/ "s3://$SCREENSHOT_BUCKET/$VERSION/" --delete`,
    `    - run:`,
    `        name: Regenerate landing index`,
    `        command: |`,
    `          versions=$(aws s3 ls "s3://$SCREENSHOT_BUCKET/screenshots/" | awk '/ PRE / {print $2}' | sed 's#/$##')`,
    `          {`,
    `            echo '<!DOCTYPE html><html><head><meta charset="utf-8">'`,
    `            echo '<title>VxSuite Screenshot Galleries</title>'`,
    `            echo '<style>body{font-family:sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}h1,a{color:#6638b6}li{margin:.4rem 0}</style>'`,
    `            echo '</head><body><h1>VxSuite Screenshot Galleries</h1><ul>'`,
    `            for v in main $(echo "$versions" | grep -vx main | sort -rV); do`,
    `              echo "$versions" | grep -qx "$v" && echo "<li><a href=\\"./$v/index.html\\">$v</a></li>"`,
    `            done`,
    `            echo '</ul></body></html>'`,
    `          } > index.html`,
    `          aws s3 cp index.html "s3://$SCREENSHOT_BUCKET/index.html" --content-type text/html`,
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
    '      - image: votingworks/cimg-debian12:4.5.0',
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
    RUST_CRATES_JOB_ID,
  ];

  const publishGalleryWorkflowEntry = [
    `      - ${PUBLISH_SCREENSHOT_GALLERY_JOB_ID}:`,
    `          context:`,
    `            - screenshots-publishing`,
    `          requires:`,
    ...integrationTestingJobIds.map((id) => `            - ${id}`),
    `          filters:`,
    `            branches:`,
    `              only: main`,
    `            tags:`,
    `              only: /${RELEASE_TAG_PATTERN}/`,
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
      - image: votingworks/cimg-debian12:4.5.0
        auth:
          username: $VX_DOCKER_USERNAME
          password: $VX_DOCKER_PASSWORD

  nodejs_postgres:
    docker:
      - image: votingworks/cimg-debian12:4.5.0
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

${generatePublishScreenshotGalleryJob()
  .map((line) => `  ${line}`)
  .join('\n')}

workflows:
  test:
    jobs:

${[...pnpmJobsToFilter.values()]
  .map((lines) => lines.map((line) => `  ${line}`).join('\n'))
  .join('\n\n')}
${allJobIds
  .map((jobId) => {
    const entry = `      - ${jobId}:\n          context:\n            - screenshots-publishing`;
    // The integration-testing jobs are required by publish-screenshot-gallery,
    // which runs on release tags. CircleCI drops a required job on a tag build
    // unless it also carries a matching tag filter, so the gallery would never
    // run. A tags filter leaves branch behavior unchanged (jobs still run on
    // all branches) while making these eligible on release tags. Other jobs
    // intentionally stay unfiltered so a tag doesn't run the whole suite.
    return integrationTestingJobIds.includes(jobId)
      ? `${entry}\n          filters:\n            tags:\n              only: /${RELEASE_TAG_PATTERN}/`
      : entry;
  })
  .join('\n')}
${publishGalleryWorkflowEntry}

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
