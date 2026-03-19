import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseToml } from '@iarna/toml';

export enum ValidationIssueKind {
  MismatchedCargoDependencyVersion = 'MismatchedCargoDependencyVersion',
}

export interface CargoDependencyProperty {
  readonly cargoTomlPath: string;
  readonly section: string;
  readonly name: string;
  readonly version: string;
}

export interface MismatchedCargoDependencyVersionIssue {
  readonly kind: ValidationIssueKind.MismatchedCargoDependencyVersion;
  readonly dependencyName: string;
  readonly properties: readonly CargoDependencyProperty[];
}

export type ValidationIssue = MismatchedCargoDependencyVersionIssue;

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'dev-dependencies',
  'build-dependencies',
] as const;

const IGNORE_DIRS = new Set(['target', 'node_modules', '.git']);

function findCargoTomlFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (entry === 'Cargo.toml') {
      results.push(fullPath);
    } else if (statSync(fullPath).isDirectory()) {
      results.push(...findCargoTomlFiles(fullPath));
    }
  }
  return results;
}

/**
 * Extracts the version string from a Cargo dependency value, which can be
 * either a plain string ("1.0.0") or a table ({ version = "1.0.0", ... }).
 * Skips dependencies that use `workspace = true` or `path` without a version.
 */
function extractVersion(dep: unknown): string | undefined {
  if (typeof dep === 'string') {
    return dep;
  }
  if (typeof dep === 'object' && dep !== null) {
    const record = dep as Record<string, unknown>;
    if (typeof record['version'] === 'string') {
      return record['version'];
    }
  }
  return undefined;
}

function collectDeps(
  deps: Record<string, unknown>,
  section: string,
  cargoTomlPath: string,
  root: string,
  versionsByDep: Map<string, CargoDependencyProperty[]>
): void {
  for (const [name, value] of Object.entries(deps)) {
    const version = extractVersion(value);
    if (!version) continue;

    const existing = versionsByDep.get(name) ?? [];
    existing.push({
      cargoTomlPath: relative(root, cargoTomlPath),
      section,
      name,
      version,
    });
    versionsByDep.set(name, existing);
  }
}

/**
 * Check that all Cargo.toml files across the repo use the same version for
 * shared dependencies. Ignores `workspace = true` references and path-only
 * dependencies (no version field).
 */
export async function* checkConfig(
  root: string
): AsyncGenerator<ValidationIssue> {
  const cargoTomlPaths = findCargoTomlFiles(root);
  const versionsByDep = new Map<string, CargoDependencyProperty[]>();

  for (const cargoTomlPath of cargoTomlPaths) {
    const content = readFileSync(cargoTomlPath, 'utf-8');
    const parsed = parseToml(content);

    for (const section of DEPENDENCY_SECTIONS) {
      const deps = parsed[section] as Record<string, unknown> | undefined;
      if (deps) {
        collectDeps(deps, section, cargoTomlPath, root, versionsByDep);
      }
    }

    const workspaceDeps = (
      parsed['workspace'] as Record<string, unknown> | undefined
    )?.['dependencies'] as Record<string, unknown> | undefined;
    if (workspaceDeps) {
      collectDeps(
        workspaceDeps,
        'workspace.dependencies',
        cargoTomlPath,
        root,
        versionsByDep
      );
    }
  }

  for (const [depName, properties] of versionsByDep) {
    const versions = new Set(properties.map((p) => p.version));
    if (versions.size > 1) {
      yield {
        kind: ValidationIssueKind.MismatchedCargoDependencyVersion,
        dependencyName: depName,
        properties,
      };
    }
  }
}
