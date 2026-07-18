import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse as parseToml } from '@iarna/toml';
import { PnpmPackageInfo } from '@votingworks/monorepo-utils';
import { findCargoTomlFiles } from './cargo';

export enum ValidationIssueKind {
  UntrackedCargoPathDependency = 'UntrackedCargoPathDependency',
  MissingCargoBinaryOutput = 'MissingCargoBinaryOutput',
}

/**
 * A package whose turbo build compiles Rust (napi/cargo) depends, via a Cargo
 * `path`/workspace dependency, on a crate that turbo does not otherwise track —
 * i.e. it is neither inside the package nor a pnpm workspace dependency. Without
 * declaring that crate in the package's turbo `build:self` inputs, editing it
 * would leave turbo reporting a (stale) cache hit.
 */
export interface UntrackedCargoPathDependencyIssue {
  readonly kind: ValidationIssueKind.UntrackedCargoPathDependency;
  readonly packageName: string;
  readonly packageDir: string;
  readonly cargoPathDep: string;
  readonly suggestedInput: string;
}

/**
 * A package whose turbo build runs `cargo build` produces a Cargo `[[bin]]`
 * binary that isn't declared in its turbo `build:self` outputs. A turbo cache
 * hit would then skip the build without restoring the binary.
 */
export interface MissingCargoBinaryOutputIssue {
  readonly kind: ValidationIssueKind.MissingCargoBinaryOutput;
  readonly packageName: string;
  readonly packageDir: string;
  readonly binaryName: string;
  readonly expectedOutput: string;
}

export type ValidationIssue =
  | UntrackedCargoPathDependencyIssue
  | MissingCargoBinaryOutputIssue;

const CARGO_DEP_SECTIONS = [
  'dependencies',
  'build-dependencies',
  'dev-dependencies',
] as const;

function parseTomlFile(path: string): Record<string, unknown> {
  return parseToml(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Map of `[workspace.dependencies]` path-dependency name -> resolved absolute
 * directory, gathered across every Cargo.toml so `dep.workspace = true`
 * references resolve regardless of which workspace defines them.
 */
function buildWorkspacePathDeps(
  cargoTomlPaths: readonly string[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const cargoTomlPath of cargoTomlPaths) {
    const workspace = asRecord(parseTomlFile(cargoTomlPath)['workspace']);
    const deps = asRecord(workspace?.['dependencies']);
    if (!deps) continue;
    for (const [name, value] of Object.entries(deps)) {
      const path = asRecord(value)?.['path'];
      if (typeof path === 'string') {
        map.set(name, resolve(dirname(cargoTomlPath), path));
      }
    }
  }
  return map;
}

/** Transitive set of directories reached via Cargo `path`/workspace path deps. */
function collectPathDepDirs(
  crateDir: string,
  workspacePathDeps: ReadonlyMap<string, string>,
  seen: Set<string>
): Set<string> {
  const dirs = new Set<string>();
  const cargoTomlPath = join(crateDir, 'Cargo.toml');
  if (!existsSync(cargoTomlPath)) return dirs;
  const parsed = parseTomlFile(cargoTomlPath);
  for (const section of CARGO_DEP_SECTIONS) {
    const deps = asRecord(parsed[section]);
    if (!deps) continue;
    for (const [name, value] of Object.entries(deps)) {
      const dep = asRecord(value);
      let depDir: string | undefined;
      if (typeof dep?.['path'] === 'string') {
        depDir = resolve(crateDir, dep['path']);
      } else if (dep?.['workspace'] === true) {
        depDir = workspacePathDeps.get(name);
      }
      if (depDir && !seen.has(depDir)) {
        seen.add(depDir);
        dirs.add(depDir);
        for (const d of collectPathDepDirs(depDir, workspacePathDeps, seen)) {
          dirs.add(d);
        }
      }
    }
  }
  return dirs;
}

function turboBuildSelfInputs(pkgDir: string): string[] {
  const turboJsonPath = join(pkgDir, 'turbo.json');
  if (!existsSync(turboJsonPath)) return [];
  const parsed = JSON.parse(readFileSync(turboJsonPath, 'utf-8')) as {
    tasks?: Record<string, { inputs?: string[] }>;
  };
  return parsed.tasks?.['build:self']?.inputs ?? [];
}

function inputsCover(
  pkgDir: string,
  inputs: readonly string[],
  depDir: string
): boolean {
  return inputs.some((input) => {
    if (input === '$TURBO_DEFAULT$') return false;
    const base = resolve(pkgDir, input.replace(/[/\\]\*.*$/, ''));
    return depDir === base || depDir.startsWith(`${base}/`);
  });
}

function buildsRust(pkg: PnpmPackageInfo): boolean {
  const scripts = pkg.packageJson?.scripts ?? {};
  return [scripts['build:self'], scripts['build:rust-addon']].some(
    (script) =>
      typeof script === 'string' && /napi build|cargo build/.test(script)
  );
}

/**
 * If the package builds Rust binaries via `cargo build` (which builds every
 * `[[bin]]`), returns the Cargo profile directory (`release`/`debug`/custom)
 * those binaries land under; otherwise undefined (e.g. napi builds, which
 * produce a `.node` library and no binaries).
 */
function cargoBuildProfile(pkg: PnpmPackageInfo): string | undefined {
  const scripts = pkg.packageJson?.scripts ?? {};
  const command = [scripts['build:self'], scripts['build:rust-addon']]
    .filter((script): script is string => typeof script === 'string')
    .join(' ');
  if (!/cargo build/.test(command)) return undefined;
  if (/--release\b/.test(command)) return 'release';
  const profile = command.match(/--profile[ =]([\w-]+)/);
  return profile ? profile[1] : 'debug';
}

function cargoBinaryNames(crateDir: string): string[] {
  const cargoTomlPath = join(crateDir, 'Cargo.toml');
  if (!existsSync(cargoTomlPath)) return [];
  const bins = parseTomlFile(cargoTomlPath)['bin'];
  if (!Array.isArray(bins)) return [];
  return bins
    .map((bin) => asRecord(bin)?.['name'])
    .filter((name): name is string => typeof name === 'string');
}

/** Effective build:self outputs: the package override, else the root config. */
function turboBuildSelfOutputs(pkgDir: string, root: string): string[] {
  for (const turboJsonPath of [
    join(pkgDir, 'turbo.json'),
    join(root, 'turbo.json'),
  ]) {
    if (!existsSync(turboJsonPath)) continue;
    const parsed = JSON.parse(readFileSync(turboJsonPath, 'utf-8')) as {
      tasks?: Record<string, { outputs?: string[] }>;
    };
    const outputs = parsed.tasks?.['build:self']?.outputs;
    if (outputs) return outputs;
  }
  return [];
}

function outputsCover(outputs: readonly string[], relPath: string): boolean {
  return outputs.some((output) => {
    if (output === relPath) return true;
    const base = output.replace(/[/\\]\*.*$/, '');
    return relPath === base || relPath.startsWith(`${base}/`);
  });
}

/**
 * Check that every Rust-building package's transitive Cargo `path` dependencies
 * are visible to turbo's cache invalidation — either as a pnpm workspace
 * dependency or as an explicit `build:self` input in the package's turbo.json.
 */
function* checkCargoPathDepInputs(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  const workspacePathDeps = buildWorkspacePathDeps(findCargoTomlFiles(root));

  for (const pkg of workspacePackages.values()) {
    if (!pkg.packageJson || !buildsRust(pkg)) continue;
    const pkgDir = pkg.path;
    const pkgDeps = {
      ...pkg.packageJson.dependencies,
      ...pkg.packageJson.devDependencies,
    };
    const inputs = turboBuildSelfInputs(pkgDir);

    for (const depDir of collectPathDepDirs(
      pkgDir,
      workspacePathDeps,
      new Set()
    )) {
      // Tracked: the dependency lives inside the package itself.
      if (depDir === pkgDir || depDir.startsWith(`${pkgDir}/`)) continue;

      // Tracked: it's a pnpm workspace dependency, so turbo hashes it via the
      // package graph.
      const depPackageJsonPath = join(depDir, 'package.json');
      if (existsSync(depPackageJsonPath)) {
        const depName = (
          JSON.parse(readFileSync(depPackageJsonPath, 'utf-8')) as {
            name?: string;
          }
        ).name;
        if (depName && depName in pkgDeps) continue;
      }

      // Tracked only if declared in the package's turbo build:self inputs.
      if (inputsCover(pkgDir, inputs, depDir)) continue;

      yield {
        kind: ValidationIssueKind.UntrackedCargoPathDependency,
        packageName: pkg.name,
        packageDir: relative(root, pkgDir),
        cargoPathDep: relative(root, depDir),
        suggestedInput: `${relative(pkgDir, depDir).split('\\').join('/')}/**`,
      };
    }
  }
}

/**
 * Check that every package building Rust binaries via `cargo build` declares
 * each of its Cargo `[[bin]]` outputs in its turbo `build:self` outputs, so a
 * turbo cache hit restores the binaries instead of silently omitting them.
 */
function* checkCargoBinaryOutputs(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    if (!pkg.packageJson) continue;
    const profile = cargoBuildProfile(pkg);
    if (!profile) continue;
    const outputs = turboBuildSelfOutputs(pkg.path, root);
    for (const binaryName of cargoBinaryNames(pkg.path)) {
      const expectedOutput = `target/${profile}/${binaryName}`;
      if (outputsCover(outputs, expectedOutput)) continue;
      yield {
        kind: ValidationIssueKind.MissingCargoBinaryOutput,
        packageName: pkg.name,
        packageDir: relative(root, pkg.path),
        binaryName,
        expectedOutput,
      };
    }
  }
}

/**
 * Validate that per-package turbo.json configs keep turbo's cache correct for
 * Rust: Cargo path-dependency sources are tracked as inputs, and Cargo binaries
 * are declared as outputs.
 */
export function* checkConfig(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  yield* checkCargoPathDepInputs(root, workspacePackages);
  yield* checkCargoBinaryOutputs(root, workspacePackages);
}
