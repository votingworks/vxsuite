import { Optional } from '@votingworks/basics';
import { PnpmPackageInfo } from '@votingworks/monorepo-utils';
import matcher from 'matcher';

export enum ValidationIssueKind {
  MismatchedPropertyValue = 'MismatchedPropertyValue',
  NoLicenseSpecified = 'NoLicenseSpecified',
}

export interface PackageJsonProperty {
  readonly packageJsonPath: string;
  readonly propertyName: string;
  readonly value?: string;
}

export interface MismatchedPropertyIssue {
  readonly kind: ValidationIssueKind.MismatchedPropertyValue;
  readonly properties: readonly PackageJsonProperty[];
}

export interface NoLicenseSpecifiedIssue {
  readonly kind: ValidationIssueKind.NoLicenseSpecified;
  readonly packageJsonPath: string;
}

export type ValidationIssue =
  | MismatchedPropertyIssue
  | NoLicenseSpecifiedIssue;

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
        kind: ValidationIssueKind.NoLicenseSpecified,
        packageJsonPath: pkg.packageJsonPath,
      };
    }

    if (pkg.name.startsWith('@types/') || pkg.name === 'prodserver') {
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
      kind: ValidationIssueKind.MismatchedPropertyValue,
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
        kind: ValidationIssueKind.MismatchedPropertyValue,
        properties,
      };
    }
  }
}

export async function* checkEngines(
  { workspacePackages, nodeVersionFile }: {
    workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
    nodeVersionFile: string;
  }
): AsyncGenerator<ValidationIssue> {
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
    const engineProperties = properties.filter((p) => p.propertyName === `engines.${engine}`);

    if (values.size > 1) {
      yield {
        kind: ValidationIssueKind.MismatchedPropertyValue,
        properties: engineProperties,
      }
    } else if (engine === 'node' && values.size === 1) {
      const propertiesNotMatchingNodeVersionFile = engineProperties.filter((p) => p.value !== nodeVersionFile);
      if (propertiesNotMatchingNodeVersionFile.length > 0) {

        yield {
          kind: ValidationIssueKind.MismatchedPropertyValue,
          properties: propertiesNotMatchingNodeVersionFile,
        }
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
