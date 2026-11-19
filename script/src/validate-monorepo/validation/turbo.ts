import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import type { PnpmPackageInfo } from '@votingworks/monorepo-utils';

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

/** The parts of `cargo metadata --no-deps` output these checks use. */
interface CargoMetadata {
  readonly workspace_root: string;
  readonly packages: ReadonlyArray<{
    readonly manifest_path: string;
    readonly dependencies: ReadonlyArray<{ readonly path?: string }>;
  }>;
}

/**
 * Reads `cargo metadata` for the Cargo workspace containing `manifestPath`,
 * caching it under each member's manifest so each workspace is read once.
 */
function readCargoMetadata(
  manifestPath: string,
  cache: Map<string, CargoMetadata>
): CargoMetadata {
  const cached = cache.get(manifestPath);
  if (cached) return cached;
  let output: string;
  try {
    output = execFileSync(
      'cargo',
      [
        'metadata',
        '--no-deps',
        '--offline',
        '--format-version=1',
        `--manifest-path=${manifestPath}`,
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    const { stderr, message } = error as Error & { stderr?: string };
    throw new Error(
      `cargo metadata failed for ${manifestPath}: ${stderr || message}`
    );
  }
  const metadata = JSON.parse(output) as CargoMetadata;
  cache.set(manifestPath, metadata);
  for (const pkg of metadata.packages) cache.set(pkg.manifest_path, metadata);
  return metadata;
}

/**
 * Directories of the crates `crateDir`'s crate reaches through Cargo path
 * dependencies, transitively and of every kind, as cargo resolves them
 * (including `workspace = true` ones).
 */
function cargoPathDepDirs(
  crateDir: string,
  cache: Map<string, CargoMetadata>
): Set<string> {
  const dirs = new Set<string>();
  const visit = (dir: string) => {
    const manifestPath = join(dir, 'Cargo.toml');
    const pkg = readCargoMetadata(manifestPath, cache).packages.find(
      (p) => p.manifest_path === manifestPath
    );
    for (const { path } of pkg?.dependencies ?? []) {
      if (path && !dirs.has(path)) {
        dirs.add(path);
        visit(path);
      }
    }
  };
  visit(crateDir);
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
  const cargoMetadataCache = new Map<string, CargoMetadata>();

  for (const pkg of workspacePackages.values()) {
    if (!pkg.packageJson || !buildsRust(pkg)) continue;
    const pkgDir = pkg.path;
    const crateDir = cargoCrateDir(pkg);
    const pkgDeps = {
      ...pkg.packageJson.dependencies,
      ...pkg.packageJson.devDependencies,
    };
    const inputs = turboBuildSelfInputs(pkgDir);

    // For a crate that's its own workspace, this is the crate's directory.
    const workspaceDir = readCargoMetadata(
      join(crateDir, 'Cargo.toml'),
      cargoMetadataCache
    ).workspace_root;
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

    for (const depDir of cargoPathDepDirs(crateDir, cargoMetadataCache)) {
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
