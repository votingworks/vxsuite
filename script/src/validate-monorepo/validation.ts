import { promises as fs } from 'fs';
import { basename, join } from 'path';
import * as ts from 'typescript';

export interface Tsconfig {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly compilerOptions?: ts.CompilerOptions;
  readonly references?: readonly ts.ProjectReference[];
}

export interface Package {
  readonly name: string;
  readonly dependencies?: { [name: string]: string };
  readonly devDependencies?: { [name: string]: string };
  readonly peerDependencies?: { [name: string]: string };
}

export enum ValidationIssueKind {
  TsconfigInvalidPropertyValue = 'TsconfigInvalidValue',
  TsconfigMissingReference = 'TsconfigMissingReference',
}

export interface TsconfigInvalidPropertyValueIssue {
  readonly kind: ValidationIssueKind.TsconfigInvalidPropertyValue;
  readonly tsconfigPath: string;
  readonly propertyKeyPath: string;
  readonly actualValue: unknown;
  readonly expectedValue: unknown;
}

export interface TsconfigMissingReferenceIssue {
  readonly kind: ValidationIssueKind.TsconfigMissingReference;
  readonly tsconfigPath: string;
  readonly referencingPath: string;
  readonly expectedReferencePath: string;
}

export type ValidationIssue =
  | TsconfigInvalidPropertyValueIssue
  | TsconfigMissingReferenceIssue;

export async function maybeReadTsconfig(
  filepath: string
): Promise<Tsconfig | undefined> {
  return await maybeReadJson(filepath);
}

export async function maybeReadPackageJson(
  filepath: string
): Promise<Package | undefined> {
  return await maybeReadJson(filepath);
}

export async function maybeReadJson(
  filepath: string
): Promise<any | undefined> {
  try {
    return JSON.parse(await fs.readFile(filepath, { encoding: 'utf-8' }));
  } catch {
    return undefined;
  }
}

export function* checkTsconfig(
  tsconfig: Tsconfig,
  tsconfigPath: string
): Generator<ValidationIssue> {
  const isBuild = basename(tsconfigPath) === 'tsconfig.build.json';
  const { noEmit, rootDir, outDir, declaration, ...otherCompilerOptions } =
    tsconfig.compilerOptions ?? {};

  if (noEmit !== !isBuild) {
    yield {
      kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: 'compilerOptions.noEmit',
      actualValue: noEmit,
      expectedValue: !isBuild,
    };
  }

  if (isBuild) {
    if (!rootDir) {
      yield {
        kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.rootDir',
        actualValue: rootDir,
        expectedValue: 'e.g. "src"',
      };
    }

    if (!outDir) {
      yield {
        kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.outDir',
        actualValue: rootDir,
        expectedValue: 'e.g. "build"',
      };
    }

    if (declaration !== true) {
      yield {
        kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: 'compilerOptions.declaration',
        actualValue: declaration,
        expectedValue: true,
      };
    }

    for (const [key, value] of Object.entries(otherCompilerOptions)) {
      yield {
        kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
        tsconfigPath,
        propertyKeyPath: `compilerOptions.${key}`,
        actualValue: value,
        expectedValue: 'none',
      };
    }
  }

  if (!Array.isArray(tsconfig.include)) {
    yield {
      kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: `include`,
      actualValue: tsconfig.include,
      expectedValue: 'an array of paths',
    };
  }

  if (!Array.isArray(tsconfig.exclude)) {
    yield {
      kind: ValidationIssueKind.TsconfigInvalidPropertyValue,
      tsconfigPath,
      propertyKeyPath: `exclude`,
      actualValue: tsconfig.exclude,
      expectedValue: 'an array of paths',
    };
  }
}

export async function readdir(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).map((entry) => join(directory, entry));
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
      (await maybeReadTsconfig(expectedWorkspaceDependencyTsconfigBuildPath)) &&
      !tsconfigReferencesPaths.has(expectedWorkspaceDependencyTsconfigBuildPath)
    ) {
      yield {
        kind: ValidationIssueKind.TsconfigMissingReference,
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
        kind: ValidationIssueKind.TsconfigMissingReference,
        tsconfigPath: otherTsconfigPath,
        referencingPath: tsconfigPath,
        expectedReferencePath: tsconfigReferencePath,
      };
    }
  }

  for (const otherTsconfigReferencePath of otherTsconfigReferencesPaths) {
    if (!tsconfigReferencesPaths.has(otherTsconfigReferencePath)) {
      yield {
        kind: ValidationIssueKind.TsconfigMissingReference,
        tsconfigPath,
        referencingPath: otherTsconfigPath,
        expectedReferencePath: otherTsconfigReferencePath,
      };
    }
  }
}
