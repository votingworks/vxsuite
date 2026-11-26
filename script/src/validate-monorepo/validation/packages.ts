import type { Optional } from '@votingworks/basics';
import type { PnpmPackageInfo } from '@votingworks/monorepo-utils';
import matcher from 'matcher';

export interface PackageJsonProperty {
  readonly packageJsonPath: string;
  readonly propertyName: string;
  readonly value?: string;
}

export interface MismatchedPropertyIssue {
  readonly kind: 'MismatchedPropertyValue';
  readonly properties: readonly PackageJsonProperty[];
}

export interface NoLicenseSpecifiedIssue {
  readonly kind: 'NoLicenseSpecified';
  readonly packageJsonPath: string;
}

export interface UnexportedPackageJsonIssue {
  readonly kind: 'UnexportedPackageJson';
  readonly packageJsonPath: string;
}

export interface InvalidTaskDelegationIssue {
  readonly kind: 'InvalidTaskDelegation';
  readonly packageJsonPath: string;
  readonly task: string;
  readonly expected: string;
  readonly actual?: string;
}

export interface DevOnlyProductionDependencyIssue {
  readonly kind: 'DevOnlyProductionDependency';
  readonly packageJsonPath: string;
  readonly dependencyName: string;
}

export type ValidationIssue =
  | MismatchedPropertyIssue
  | NoLicenseSpecifiedIssue
  | UnexportedPackageJsonIssue
  | InvalidTaskDelegationIssue
  | DevOnlyProductionDependencyIssue;

export type ValidationIssueKind = ValidationIssue['kind'];

/**
 * Public tasks that delegate to the `vx-task` orchestrator. The real per-package
 * work lives in the `:self` counterpart. Any package that defines the `:self`
 * task must delegate its public task to `vx-task`, so the orchestration choice
 * stays centralized in `script/vx-task`.
 */
const DELEGATED_TASKS: ReadonlyArray<readonly [string, string]> = [
  ['build', 'build:self'],
  ['clean', 'clean:self'],
  ['lint', 'lint:self'],
  ['test:run', 'test:run:self'],
  ['test:ci', 'test:ci:self'],
];

export async function* checkPackageManager({
  workspacePackages,
}: {
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  const packageManagers = new Set<string | undefined>();
  const properties: PackageJsonProperty[] = [];

  for (const pkg of workspacePackages.values()) {
    if (!pkg.packageJson || !pkg.packageJsonPath) {
      continue;
    }

    if (pkg.packageJson.license !== 'GPL-3.0-only') {
      yield {
        kind: 'NoLicenseSpecified',
        packageJsonPath: pkg.packageJsonPath,
      };
    }

    if (pkg.name.startsWith('@types/')) {
      continue;
    }

    packageManagers.add(pkg.packageJson.packageManager);
    properties.push({
      packageJsonPath: pkg.packageJsonPath,
      propertyName: 'packageManager',
      value: pkg.packageJson.packageManager,
    });
  }

  if (packageManagers.size > 1) {
    yield {
      kind: 'MismatchedPropertyValue',
      properties,
    };
  }
}

/**
 * Check that certain packages all have the same pinned version.
 */
export async function* checkPinnedVersions({
  pinnedPackages,
  workspacePackages,
}: {
  pinnedPackages: readonly string[];
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  type PnpmPackageInfoByVersionSpecifier = Map<
    string,
    Set<PackageJsonProperty>
  >;
  type VersionInfoByPackageName = Map<
    string,
    PnpmPackageInfoByVersionSpecifier
  >;
  const packageVersions: VersionInfoByPackageName = new Map();

  for (const pkg of workspacePackages.values()) {
    const { packageJson, packageJsonPath } = pkg;

    if (!packageJson || !packageJsonPath) {
      continue;
    }

    for (const key of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ] as const) {
      const deps = packageJson[key];
      if (deps) {
        for (const name of matcher(Object.keys(deps), pinnedPackages)) {
          const versions: PnpmPackageInfoByVersionSpecifier =
            packageVersions.get(name) ?? new Map();
          const properties = versions.get(deps[name] as string) ?? new Set();
          properties.add({
            packageJsonPath,
            propertyName: `${key}.${name}`,
            value: deps[name] as string,
          });
          versions.set(deps[name] as string, properties);
          packageVersions.set(name, versions);
        }
      }
    }
  }

  for (const versions of packageVersions.values()) {
    if (versions.size > 1) {
      const properties = [...versions.values()].reduce<PackageJsonProperty[]>(
        (acc, cur) => [...acc, ...cur],
        []
      );

      yield {
        kind: 'MismatchedPropertyValue',
        properties,
      };
    }
  }
}

export async function* checkEngines({
  workspacePackages,
  nodeVersionFile,
}: {
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
  nodeVersionFile: string;
}): AsyncGenerator<ValidationIssue> {
  const allEngines = new Map<string, Set<Optional<string>>>();
  const properties: PackageJsonProperty[] = [];

  for (const pkg of workspacePackages.values()) {
    const { packageJson, packageJsonPath } = pkg;

    if (!packageJson || !packageJsonPath) {
      continue;
    }

    const { engines } = packageJson;

    if (!engines) {
      // Ignore any packages without an `engines` property.
      continue;
    }

    for (const [engine, value] of Object.entries(engines)) {
      const engineValues = allEngines.get(engine) ?? new Set();
      engineValues.add(value);
      allEngines.set(engine, engineValues);

      properties.push({
        packageJsonPath,
        propertyName: `engines.${engine}`,
        value,
      });
    }
  }

  for (const [engine, values] of allEngines) {
    const engineProperties = properties.filter(
      (p) => p.propertyName === `engines.${engine}`
    );

    if (values.size > 1) {
      yield {
        kind: 'MismatchedPropertyValue',
        properties: engineProperties,
      };
    } else if (engine === 'node' && values.size === 1) {
      const propertiesNotMatchingNodeVersionFile = engineProperties.filter(
        (p) => p.value !== nodeVersionFile
      );
      if (propertiesNotMatchingNodeVersionFile.length > 0) {
        yield {
          kind: 'MismatchedPropertyValue',
          properties: propertiesNotMatchingNodeVersionFile,
        };
      }
    }
  }
}

/**
 * Check that every package with an `exports` map exposes its own
 * `package.json`. An `exports` map turns off unlisted-subpath resolution, so
 * without this tooling that reads `<pkg>/package.json` fails with
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
export async function* checkPackageJsonIsExported({
  workspacePackages,
}: {
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    const { packageJson, packageJsonPath } = pkg;

    if (!packageJson || !packageJsonPath) {
      continue;
    }

    const { exports: exportsMap } = packageJson as {
      exports?: Record<string, unknown>;
    };

    if (exportsMap && exportsMap['./package.json'] === undefined) {
      yield {
        kind: 'UnexportedPackageJson',
        packageJsonPath,
      };
    }
  }
}

/**
 * Check that every package defining a `:self` task delegates its public task to
 * it via turbo, so the task's dependencies are built first.
 */
export async function* checkTaskDelegation({
  workspacePackages,
}: {
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    const { packageJson, packageJsonPath } = pkg;

    if (!packageJson || !packageJsonPath) {
      continue;
    }

    const { scripts } = packageJson;
    if (!scripts) {
      continue;
    }

    for (const [task, selfTask] of DELEGATED_TASKS) {
      if (scripts[selfTask] === undefined) {
        continue;
      }

      const expected = `pnpm -w vx-task ${task} $npm_package_name`;
      if (scripts[task] !== expected) {
        yield {
          kind: 'InvalidTaskDelegation',
          packageJsonPath,
          task,
          expected,
          actual: scripts[task],
        };
      }
    }
  }
}

const DEV_ONLY_PACKAGES: readonly string[] = ['@votingworks/test-utils'];

const PRODUCTION_ROOT_PATTERN = /^apps\/[^/]+\/(frontend|backend)$/;

/**
 * Check that no package an app frontend or backend depends on in production
 * lists a dev-only package in `dependencies`.
 */
export async function* checkDevOnlyDependencies({
  workspacePackages,
}: {
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  const productionPackages = new Set<PnpmPackageInfo>();
  const queue = [...workspacePackages.values()].filter((pkg) =>
    PRODUCTION_ROOT_PATTERN.test(pkg.relativePath)
  );

  for (let pkg = queue.shift(); pkg; pkg = queue.shift()) {
    if (productionPackages.has(pkg)) {
      continue;
    }
    productionPackages.add(pkg);

    for (const name of Object.keys(pkg.packageJson?.dependencies ?? {})) {
      const dependency = workspacePackages.get(name);
      if (dependency) {
        queue.push(dependency);
      }
    }
  }

  for (const { packageJson, packageJsonPath } of productionPackages) {
    if (!packageJson || !packageJsonPath) {
      continue;
    }

    for (const dependencyName of DEV_ONLY_PACKAGES) {
      if (packageJson.dependencies?.[dependencyName] !== undefined) {
        yield {
          kind: 'DevOnlyProductionDependency',
          packageJsonPath,
          dependencyName,
        };
      }
    }
  }
}

export async function* checkConfig({
  pinnedPackages,
  workspacePackages,
  nodeVersionFile,
}: {
  pinnedPackages: readonly string[];
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
  nodeVersionFile: string;
}): AsyncGenerator<ValidationIssue> {
  yield* checkPackageManager({ workspacePackages });
  yield* checkPinnedVersions({ workspacePackages, pinnedPackages });
  yield* checkEngines({ workspacePackages, nodeVersionFile });
}
