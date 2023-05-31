import { PackageInfo } from '@votingworks/monorepo-utils';

export enum ValidationIssueKind {
  MismatchedPackageVersion = 'MismatchedPackageVersion',
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

export type ValidationIssue = MismatchedPackagePropertyIssue;

export async function* checkPackageManager({
  workspacePackages,
}: {
  workspacePackages: ReadonlyMap<string, PackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  const packageManagers = new Set<string | undefined>();
  const properties: PackageJsonProperty[] = [];

  for (const pkg of workspacePackages.values()) {
    if (
      !pkg.packageJson ||
      !pkg.packageJsonPath ||
      pkg.name.startsWith('@types/') ||
      pkg.name === 'prodserver'
    ) {
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
  workspacePackages: ReadonlyMap<string, PackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  for (const pinnedPackage of pinnedPackages) {
    const versions = new Set<string | undefined>();
    const properties: PackageJsonProperty[] = [];

    for (const pkg of workspacePackages.values()) {
      const { packageJson, packageJsonPath } = pkg;

      if (!packageJson || !packageJsonPath) {
        continue;
      }

      if (packageJson.dependencies?.[pinnedPackage]) {
        versions.add(packageJson.dependencies[pinnedPackage]);
        properties.push({
          packageJsonPath,
          propertyName: `dependencies.${pinnedPackage}`,
          value: packageJson.dependencies[pinnedPackage],
        });
      } else if (packageJson.devDependencies?.[pinnedPackage]) {
        versions.add(packageJson.devDependencies[pinnedPackage]);
        properties.push({
          packageJsonPath,
          propertyName: `devDependencies.${pinnedPackage}`,
          value: packageJson.devDependencies[pinnedPackage],
        });
      } else if (packageJson.peerDependencies?.[pinnedPackage]) {
        versions.add(packageJson.peerDependencies[pinnedPackage]);
        properties.push({
          packageJsonPath,
          propertyName: `peerDependencies.${pinnedPackage}`,
          value: packageJson.peerDependencies[pinnedPackage],
        });
      }
    }

    if (versions.size > 1) {
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
  workspacePackages: ReadonlyMap<string, PackageInfo>;
}): AsyncGenerator<ValidationIssue> {
  yield* checkPackageManager({ workspacePackages });
  yield* checkPinnedVersions({ workspacePackages, pinnedPackages });
}
