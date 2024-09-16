import { basename, dirname, join } from 'node:path';
import * as ts from 'typescript';
import { statSync } from 'node:fs';
import { PnpmPackageInfo } from '@votingworks/monorepo-utils';

export interface Tsconfig {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly compilerOptions?: ts.CompilerOptions;
  readonly references?: readonly ts.ProjectReference[];
}

export enum ValidationIssueKind {
  InvalidPropertyValue = 'InvalidPropertyValue',
  MissingConfigFile = 'MissingConfigFile',
  MissingReference = 'MissingReference',
  MissingWorkspaceDependency = 'MissingWorkspaceDependency',
}

export interface MissingConfigFileIssue {
  readonly kind: ValidationIssueKind.MissingConfigFile;
  readonly tsconfigPath: string;
}

export interface InvalidPropertyValueIssue {
  readonly kind: ValidationIssueKind.InvalidPropertyValue;
  readonly tsconfigPath: string;
  readonly propertyKeyPath: string;
  readonly actualValue: unknown;
  readonly expectedValue: unknown;
}

export interface MissingReferenceIssue {
  readonly kind: ValidationIssueKind.MissingReference;
  readonly tsconfigPath: string;
  readonly referencingPath: string;
  readonly expectedReferencePath: string;
}

export interface MissingWorkspaceDependencyIssue {
  readonly kind: ValidationIssueKind.MissingWorkspaceDependency;
  readonly packageJsonPath: string;
  readonly dependencyName: string;
}

export type ValidationIssue =
  | MissingConfigFileIssue
  | InvalidPropertyValueIssue
  | MissingReferenceIssue
  | MissingWorkspaceDependencyIssue;

export function maybeReadTsconfig(filepath: string): Tsconfig | undefined {
  if (!statSync(dirname(filepath)).isDirectory()) {
    throw new Error(`directory ${dirname(filepath)} does not exist`);
  }

  if (!ts.sys.fileExists(filepath)) {
    return undefined;
  }

  const { config, error } = ts.readConfigFile(filepath, ts.sys.readFile);
  if (error) {
    throw error;
  }
  return config;
}

export function* checkTsconfig(
  tsconfig: Tsconfig,
  tsconfigPath: string
): Generator<ValidationIssue> {
  const isBuild = basename(tsconfigPath) === 'tsconfig.build.json';
  const {
    noEmit,
    rootDir,
    outDir,
    declaration,
    declarationMap,
    ...otherCompilerOptions
  } = tsconfig.compilerOptions ?? {};

  if (noEmit !== !isBuild) {
    yield {
      kind: ValidationIssueKind.InvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: 'compilerOptions.noEmit',
      actualValue: noEmit,
      expectedValue: !isBuild,
    };
  }

  if (isBuild) {
    if (!rootDir) {
      yield {
        kind: ValidationIssueKind.InvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.rootDir',
        actualValue: rootDir,
        expectedValue: 'e.g. "src"',
      };
    }

    if (!outDir) {
      yield {
        kind: ValidationIssueKind.InvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.outDir',
        actualValue: rootDir,
        expectedValue: 'e.g. "build"',
      };
    }

    if (declaration !== true) {
      yield {
        kind: ValidationIssueKind.InvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.declaration',
        actualValue: declaration,
        expectedValue: true,
      };
    }

    if (!(declarationMap === true || declarationMap === undefined)) {
      yield {
        kind: ValidationIssueKind.InvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.declarationMap',
        actualValue: declarationMap,
        expectedValue: 'true or undefined',
      };
    }

    for (const [key, value] of Object.entries(otherCompilerOptions)) {
      yield {
        kind: ValidationIssueKind.InvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: `compilerOptions.${key}`,
        actualValue: value,
        expectedValue: 'none',
      };
    }
  }

  if (!Array.isArray(tsconfig.include)) {
    yield {
      kind: ValidationIssueKind.InvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: `include`,
      actualValue: tsconfig.include,
      expectedValue: 'an array of paths',
    };
  }

  if (tsconfig.exclude && !Array.isArray(tsconfig.exclude)) {
    yield {
      kind: ValidationIssueKind.InvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: `exclude`,
      actualValue: tsconfig.exclude,
      expectedValue: 'an array of paths',
    };
  }
}

export async function* checkTsconfigMatchesPackageJson(
  tsconfig: Tsconfig,
  tsconfigPath: string,
  workspaceDependencyPackages: readonly PnpmPackageInfo[],
  packageJsonPath: string
): AsyncGenerator<ValidationIssue> {
  const tsconfigReferencesPaths = new Set(
    tsconfig.references?.map(({ path }) => join(tsconfigPath, '..', path)) ?? []
  );

  for (const workspaceDependencyPackage of workspaceDependencyPackages) {
    if (workspaceDependencyPackage.name.startsWith('@types/')) {
      continue;
    }

    const expectedWorkspaceDependencyTsconfigBuildPath = join(
      workspaceDependencyPackage.path,
      'tsconfig.build.json'
    );

    if (
      maybeReadTsconfig(expectedWorkspaceDependencyTsconfigBuildPath) &&
      !tsconfigReferencesPaths.has(expectedWorkspaceDependencyTsconfigBuildPath)
    ) {
      yield {
        kind: ValidationIssueKind.MissingReference,
        tsconfigPath,
        referencingPath: packageJsonPath,
        expectedReferencePath: expectedWorkspaceDependencyTsconfigBuildPath,
      };
    }
  }
}

export function* checkTsconfigReferencesMatch(
  tsconfig: Tsconfig,
  tsconfigPath: string,
  otherTsconfig: Tsconfig,
  otherTsconfigPath: string
): Generator<ValidationIssue> {
  const tsconfigReferencesPaths = new Set(
    tsconfig.references?.map(({ path }) => join(tsconfigPath, '..', path)) ?? []
  );
  const otherTsconfigReferencesPaths = new Set(
    otherTsconfig.references?.map(({ path }) =>
      join(otherTsconfigPath, '..', path)
    ) ?? []
  );

  for (const tsconfigReferencePath of tsconfigReferencesPaths) {
    if (!otherTsconfigReferencesPaths.has(tsconfigReferencePath)) {
      yield {
        kind: ValidationIssueKind.MissingReference,
        tsconfigPath: otherTsconfigPath,
        referencingPath: tsconfigPath,
        expectedReferencePath: tsconfigReferencePath,
      };
    }
  }

  for (const otherTsconfigReferencePath of otherTsconfigReferencesPaths) {
    if (!tsconfigReferencesPaths.has(otherTsconfigReferencePath)) {
      yield {
        kind: ValidationIssueKind.MissingReference,
        tsconfigPath,
        referencingPath: otherTsconfigPath,
        expectedReferencePath: otherTsconfigReferencePath,
      };
    }
  }
}

export async function* checkConfig(
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): AsyncGenerator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    const { packageJson, packageJsonPath } = pkg;

    if (!packageJson || !packageJsonPath) {
      continue;
    }

    if (!packageJson.devDependencies?.['typescript']) {
      continue;
    }

    const workspaceDependencies = [
      ...(packageJson.dependencies
        ? Object.entries(packageJson.dependencies)
        : []),
      ...(packageJson.devDependencies
        ? Object.entries(packageJson.devDependencies)
        : []),
    ].flatMap(([name, version]) =>
      name !== packageJson.name && version.startsWith('workspace:')
        ? [name]
        : []
    );

    let hasMissingWorkspaceDependency = false;
    for (const workspaceDependency of workspaceDependencies) {
      if (!workspacePackages.has(workspaceDependency)) {
        hasMissingWorkspaceDependency = true;
        yield {
          kind: ValidationIssueKind.MissingWorkspaceDependency,
          packageJsonPath,
          dependencyName: workspaceDependency,
        };
      }
    }

    if (hasMissingWorkspaceDependency) {
      continue;
    }

    const workspaceDependencyPackages = workspaceDependencies.map((name) =>
      workspacePackages.get(name)
    ) as PnpmPackageInfo[];

    const tsconfigPath = join(pkg.path, 'tsconfig.json');
    const tsconfig = maybeReadTsconfig(tsconfigPath);

    if (!tsconfig) {
      yield {
        kind: ValidationIssueKind.MissingConfigFile,
        tsconfigPath,
      };
      continue;
    }

    yield* checkTsconfig(tsconfig, tsconfigPath);

    yield* checkTsconfigMatchesPackageJson(
      tsconfig,
      tsconfigPath,
      workspaceDependencyPackages,
      packageJsonPath
    );

    const tsconfigBuildPath = join(pkg.path, 'tsconfig.build.json');
    const tsconfigBuild = maybeReadTsconfig(tsconfigBuildPath);

    if (tsconfigBuild) {
      yield* checkTsconfig(tsconfigBuild, tsconfigBuildPath);

      yield* checkTsconfigMatchesPackageJson(
        tsconfigBuild,
        tsconfigBuildPath,
        workspaceDependencyPackages,
        packageJsonPath
      );

      yield* checkTsconfigReferencesMatch(
        tsconfig,
        tsconfigPath,
        tsconfigBuild,
        tsconfigBuildPath
      );
    }
  }
}
