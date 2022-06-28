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

export async function* checkConfig({
  packages,
}: {
  packages: readonly string[];
}): AsyncGenerator<ValidationIssue> {
  yield* checkPackageManager({ packages });
}
