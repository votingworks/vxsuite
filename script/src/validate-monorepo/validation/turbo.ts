import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse as parseToml } from '@iarna/toml';
import * as ts from 'typescript';
import type { PnpmPackageInfo } from '@votingworks/monorepo-utils';
import { findCargoTomlFiles } from './cargo.ts';

/**
 * A package whose turbo build compiles Rust (napi/cargo) depends, via a Cargo
 * `path`/workspace dependency, on a crate that turbo does not otherwise track —
 * i.e. it is neither inside the package nor a pnpm workspace dependency. Without
 * declaring that crate in the package's turbo `build:self` inputs, editing it
 * would leave turbo reporting a (stale) cache hit.
 */
export interface UntrackedCargoPathDependencyIssue {
  readonly kind: 'UntrackedCargoPathDependency';
  readonly packageName: string;
  readonly packageDir: string;
  readonly cargoPathDep: string;
  readonly suggestedInput: string;
}

/**
 * A package's build script runs `cargo build` itself instead of through
 * `vx-cargo-build`, which copies the binaries into `build/`. Binaries should
 * run from `build/`, not cargo's `target/` directory, and a turbo cache hit
 * restores only `build/`.
 */
export interface DirectCargoBuildIssue {
  readonly kind: 'DirectCargoBuild';
  readonly packageName: string;
  readonly packageDir: string;
  readonly script: string;
}

/**
 * A package's crate belongs to a Cargo workspace whose `Cargo.toml` or
 * `Cargo.lock` lies outside the package, so turbo doesn't hash it unless it's a
 * `build:self` input. Without it, changing the workspace's dependency versions
 * or lockfile would leave turbo reporting a (stale) cache hit.
 */
export interface UntrackedCargoWorkspaceFileIssue {
  readonly kind: 'UntrackedCargoWorkspaceFile';
  readonly packageName: string;
  readonly packageDir: string;
  readonly workspaceFile: string;
  readonly suggestedInput: string;
}

/**
 * A package's turbo.json overrides `build:self` inputs without
 * `$TURBO_DEFAULT$`, so turbo hashes only the listed files and not the
 * package's own, and changing them would leave a (stale) cache hit.
 */
export interface MissingTurboDefaultInputIssue {
  readonly kind: 'MissingTurboDefaultInput';
  readonly packageName: string;
  readonly packageDir: string;
}

/**
 * A package that builds with `vx-cargo-build` overrides `build:self` outputs
 * without `build/**`, so a turbo cache hit wouldn't restore its binaries.
 */
export interface MissingBuildOutputIssue {
  readonly kind: 'MissingBuildOutput';
  readonly packageName: string;
  readonly packageDir: string;
}

export type ValidationIssue =
  | UntrackedCargoPathDependencyIssue
  | DirectCargoBuildIssue
  | UntrackedCargoWorkspaceFileIssue
  | MissingTurboDefaultInputIssue
  | MissingBuildOutputIssue;

export type ValidationIssueKind = ValidationIssue['kind'];

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

interface TurboJson {
  tasks?: Record<string, { inputs?: string[]; outputs?: string[] }>;
}

/** Reads a turbo.json, which may contain comments. */
function readTurboJson(path: string): TurboJson {
  const { config, error } = ts.readConfigFile(path, ts.sys.readFile);
  if (error) {
    throw new Error(
      `${path}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`
    );
  }
  return config as TurboJson;
}

function turboBuildSelfInputs(pkgDir: string): string[] {
  const turboJsonPath = join(pkgDir, 'turbo.json');
  if (!existsSync(turboJsonPath)) return [];
  return readTurboJson(turboJsonPath).tasks?.['build:self']?.inputs ?? [];
}

/** Whether any of the turbo `inputs` covers `path`, a file or directory. */
function inputsCover(
  root: string,
  pkgDir: string,
  inputs: readonly string[],
  path: string
): boolean {
  return inputs.some((input) => {
    if (input === '$TURBO_DEFAULT$') return false;
    const base = resolve(
      pkgDir,
      input.replace(/^\$TURBO_ROOT\$/, root).replace(/[/\\]\*.*$/, '')
    );
    return path === base || path.startsWith(`${base}/`);
  });
}

function buildsRust(pkg: PnpmPackageInfo): boolean {
  const scripts = pkg.packageJson?.scripts ?? {};
  return [scripts['build:self'], scripts['build:rust-addon']].some(
    (script) =>
      typeof script === 'string' &&
      /napi build|cargo build|vx-cargo-build/.test(script)
  );
}

/** The package's build scripts that may run Rust builds, joined. */
function rustBuildCommand(pkg: PnpmPackageInfo): string {
  const scripts = pkg.packageJson?.scripts ?? {};
  return [scripts['build:self'], scripts['build:rust-addon']]
    .filter((script): script is string => typeof script === 'string')
    .join(' ');
}

/**
 * The directory of the crate the package builds: the `--manifest-path` its
 * build scripts pass to cargo or napi (e.g. `rust/Cargo.toml`), else the
 * package itself.
 */
function cargoCrateDir(pkg: PnpmPackageInfo): string {
  const manifestPath = rustBuildCommand(pkg).match(
    /--manifest-path[ =](\S+)/
  )?.[1];
  return manifestPath ? dirname(resolve(pkg.path, manifestPath)) : pkg.path;
}

/**
 * The root of the Cargo workspace a crate belongs to, if any: the crate itself
 * if it declares `[workspace]`, else the nearest ancestor (up to `root`) whose
 * `[workspace]` lists it in `members`. Like cargo, this takes the nearest
 * workspace; unlike cargo, it doesn't expand globs in `members`.
 */
function cargoWorkspaceDir(root: string, crateDir: string): string | undefined {
  for (let dir = crateDir; ; dir = dirname(dir)) {
    const cargoTomlPath = join(dir, 'Cargo.toml');
    const workspace = existsSync(cargoTomlPath)
      ? asRecord(parseTomlFile(cargoTomlPath)['workspace'])
      : undefined;
    if (workspace) {
      const members = workspace['members'];
      const isMember =
        dir === crateDir ||
        (Array.isArray(members) &&
          members.some(
            (member) =>
              typeof member === 'string' && resolve(dir, member) === crateDir
          ));
      return isMember ? dir : undefined;
    }
    if (dir === root || dir === dirname(dir)) return undefined;
  }
}

/**
 * Check that the Cargo files outside a Rust-building package that its build
 * reads are visible to turbo's cache invalidation: its transitive Cargo `path`
 * dependencies, either as pnpm workspace dependencies or as explicit
 * `build:self` inputs in the package's turbo.json, and its Cargo workspace's
 * `Cargo.toml` and `Cargo.lock`, as explicit inputs.
 */
function* checkCargoInputs(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  const workspacePathDeps = buildWorkspacePathDeps(findCargoTomlFiles(root));

  for (const pkg of workspacePackages.values()) {
    if (!pkg.packageJson || !buildsRust(pkg)) continue;
    const pkgDir = pkg.path;
    const crateDir = cargoCrateDir(pkg);
    const pkgDeps = {
      ...pkg.packageJson.dependencies,
      ...pkg.packageJson.devDependencies,
    };
    const inputs = turboBuildSelfInputs(pkgDir);

    const workspaceDir = cargoWorkspaceDir(root, crateDir);
    if (workspaceDir) {
      for (const file of ['Cargo.toml', 'Cargo.lock']) {
        const workspaceFile = join(workspaceDir, file);
        if (workspaceFile.startsWith(`${pkgDir}/`)) continue;
        if (inputsCover(root, pkgDir, inputs, workspaceFile)) continue;
        yield {
          kind: 'UntrackedCargoWorkspaceFile',
          packageName: pkg.name,
          packageDir: relative(root, pkgDir),
          workspaceFile: relative(root, workspaceFile),
          suggestedInput: relative(pkgDir, workspaceFile).split('\\').join('/'),
        };
      }
    }

    for (const depDir of collectPathDepDirs(
      crateDir,
      workspacePathDeps,
      new Set()
    )) {
      // Tracked: the dependency lives inside the package itself.
      if (depDir === pkgDir || depDir.startsWith(`${pkgDir}/`)) continue;

      // Tracked: it's in a pnpm workspace dependency (e.g. its `rust/`
      // directory), so turbo hashes it via the package graph.
      const depPackage = [...workspacePackages.values()]
        .filter(({ path }) => depDir === path || depDir.startsWith(`${path}/`))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (depPackage && depPackage.name in pkgDeps) continue;

      // Tracked only if declared in the package's turbo build:self inputs.
      if (inputsCover(root, pkgDir, inputs, depDir)) continue;

      yield {
        kind: 'UntrackedCargoPathDependency',
        packageName: pkg.name,
        packageDir: relative(root, pkgDir),
        cargoPathDep: relative(root, depDir),
        suggestedInput: `${relative(pkgDir, depDir).split('\\').join('/')}/**`,
      };
    }
  }
}

/**
 * Check that packages build Rust binaries with `vx-cargo-build`, not `cargo
 * build` directly, so the binaries are copied into `build/`.
 */
function* checkCargoBuilds(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    const scripts = pkg.packageJson?.scripts ?? {};
    for (const script of ['build:self', 'build:rust-addon']) {
      if (/\bcargo build\b/.test(scripts[script] ?? '')) {
        yield {
          kind: 'DirectCargoBuild',
          packageName: pkg.name,
          packageDir: relative(root, pkg.path),
          script,
        };
      }
    }
  }
}

/**
 * Check per-package `build:self` overrides for easy mistakes: inputs that
 * leave out `$TURBO_DEFAULT$`, and, for packages that build Rust binaries into
 * `build/`, outputs that leave out `build/**`.
 */
function* checkBuildSelfOverrides(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  for (const pkg of workspacePackages.values()) {
    const turboJsonPath = join(pkg.path, 'turbo.json');
    if (!existsSync(turboJsonPath)) continue;
    const task = readTurboJson(turboJsonPath).tasks?.['build:self'];
    const packageDir = relative(root, pkg.path);
    if (task?.inputs && !task.inputs.includes('$TURBO_DEFAULT$')) {
      yield {
        kind: 'MissingTurboDefaultInput',
        packageName: pkg.name,
        packageDir,
      };
    }
    if (
      task?.outputs &&
      /vx-cargo-build/.test(rustBuildCommand(pkg)) &&
      !task.outputs.includes('build/**')
    ) {
      yield { kind: 'MissingBuildOutput', packageName: pkg.name, packageDir };
    }
  }
}

/**
 * Validate that per-package turbo.json configs keep turbo's cache correct for
 * Rust: Cargo path-dependency sources and Cargo workspace files are tracked as
 * inputs, and Cargo binaries are built with `vx-cargo-build`, which copies them
 * into `build/`, a turbo output.
 */
export function* checkConfig(
  root: string,
  workspacePackages: ReadonlyMap<string, PnpmPackageInfo>
): Generator<ValidationIssue> {
  yield* checkCargoInputs(root, workspacePackages);
  yield* checkCargoBuilds(root, workspacePackages);
  yield* checkBuildSelfOverrides(root, workspacePackages);
}
