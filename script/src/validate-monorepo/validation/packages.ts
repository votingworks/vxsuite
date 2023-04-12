import { join } from 'path';
import { maybeReadPackageJson } from './util';

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
  packages,
}: {
  packages: readonly string[];
}): AsyncGenerator<ValidationIssue> {
  const packageManagers = new Set<string | undefined>();
  const properties: PackageJsonProperty[] = [];

  for (const pkg of packages) {
    const packageJsonPath = join(pkg, 'package.json');
    const packageJson = await maybeReadPackageJson(packageJsonPath);

    if (packageJson) {
      packageManagers.add(packageJson.packageManager);
      properties.push({
        packageJsonPath,
        propertyName: 'packageManager',
        value: packageJson.packageManager,
      });
    }
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
  packages,
  pinnedPackages,
}: {
  packages: readonly string[];
  pinnedPackages: readonly string[];
}): AsyncGenerator<ValidationIssue> {
  for (const pinnedPackage of pinnedPackages) {
    const versions = new Set<string | undefined>();
    const properties: PackageJsonProperty[] = [];

    for (const pkg of packages) {
      const packageJsonPath = join(pkg, 'package.json');
      const packageJson = await maybeReadPackageJson(packageJsonPath);

      if (!packageJson) {
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
  packages,
  pinnedPackages,
}: {
  packages: readonly string[];
  pinnedPackages: readonly string[];
}): AsyncGenerator<ValidationIssue> {
  yield* checkPackageManager({ packages });
  yield* checkPinnedVersions({ packages, pinnedPackages });
}
