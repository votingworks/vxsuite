import { PnpmPackageInfo } from '@votingworks/monorepo-utils';
import matcher from 'matcher';

export enum ValidationIssueKind {
  MismatchedPackageVersion = 'MismatchedPackageVersion',
  NoLicenseSpecified = 'NoLicenseSpecified',
}

export interface PackageJsonProperty {
  readonly packageJsonPath: string;
  readonly propertyName: string;
  readonly value?: string;
}

export interface MismatchedPackagePropertyIssue {
  readonly kind: ValidationIssueKind.MismatchedPackageVersion;
  readonly properties: readonly PackageJsonProperty[];
}

export interface NoLicenseSpecifiedIssue {
  readonly kind: ValidationIssueKind.NoLicenseSpecified;
  readonly packageJsonPath: string;
}

export type ValidationIssue =
  | MismatchedPackagePropertyIssue
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
      kind: ValidationIssueKind.MismatchedPackageVersion,
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
        kind: ValidationIssueKind.MismatchedPackageVersion,
        properties,
      };
    }
  }
}

export async function* checkConfig({
  pinnedPackages,
  workspacePackages,
}: {
  pinnedPackages: readonly string[];
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  yield* checkPackageManager({ workspacePackages });
  yield* checkPinnedVersions({ workspacePackages, pinnedPackages });
}
