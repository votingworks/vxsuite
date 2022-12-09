import { basename, join } from 'path';
import * as ts from 'typescript';
import { maybeReadPackageJson } from './util';

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

export type ValidationIssue =
  | MissingConfigFileIssue
  | InvalidPropertyValueIssue
  | MissingReferenceIssue;

export function maybeReadTsconfig(filepath: string): Tsconfig | undefined {
  const { config, error } = ts.readConfigFile(filepath, ts.sys.readFile);
  return error ? undefined : config;
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

  if (!Array.isArray(tsconfig.exclude)) {
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
  workspaceDependencies: readonly string[],
  packageJsonPath: string
): AsyncGenerator<ValidationIssue> {
  const tsconfigReferencesPaths = new Set(
    tsconfig.references?.map(({ path }) => join(tsconfigPath, '..', path)) ?? []
  );

  for (const workspaceDependency of workspaceDependencies) {
    if (workspaceDependency.startsWith('@types/')) {
      continue;
    }

    const workspaceDependencyName = workspaceDependency
      .split('/')
      .pop() as string;
    const expectedWorkspaceDependencyPath = join(
      __dirname,
      '../../../libs',
      workspaceDependencyName
    );
    const expectedWorkspaceDependencyTsconfigBuildPath = join(
      expectedWorkspaceDependencyPath,
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

export async function* checkConfig({
  packages,
}: {
  packages: readonly string[];
}): AsyncGenerator<ValidationIssue> {
  for (const pkg of packages) {
    const packageJsonPath = join(pkg, 'package.json');
    const packageJson = await maybeReadPackageJson(packageJsonPath);

    if (!packageJson) {
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

    const tsconfigPath = join(pkg, 'tsconfig.json');
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
      workspaceDependencies,
      packageJsonPath
    );

    const tsconfigBuildPath = join(pkg, 'tsconfig.build.json');
    const tsconfigBuild = maybeReadTsconfig(tsconfigBuildPath);

    if (tsconfigBuild) {
      yield* checkTsconfig(tsconfigBuild, tsconfigBuildPath);

      yield* checkTsconfigMatchesPackageJson(
        tsconfigBuild,
        tsconfigBuildPath,
        workspaceDependencies,
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
