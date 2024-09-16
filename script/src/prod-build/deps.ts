import resolveFrom from 'resolve-from';
import { WORKSPACE_ROOT } from './globals';
import { maybeRequire } from './utils/maybe_require';
import { relativePath } from './utils/relative_path';
import { dirname, normalize, join } from 'node:path';

export enum PackageType {
  Frontend = 'frontend',
  Service = 'service',
  Library = 'lib',
}

export interface Package {
  readonly name: string;
  readonly path: string;
  readonly type: PackageType;
  readonly isBundled: boolean;
  readonly deps: readonly Package[];
  readonly devDeps: readonly Package[];
}

export function getDependencyGraph(path: string, type: PackageType): Package {
  const lookup = new Map<string, Package>();

  function addDependency(path: string, type: PackageType): Package {
    if (lookup.has(path)) {
      return lookup.get(path)!;
    }

    const pkg = maybeRequire(`${path}/package`);
    const name = pkg?.name ?? relativePath(path, { from: WORKSPACE_ROOT });
    const deps: Package[] = [];
    const devDeps: Package[] = [];
    const isBundled = pkg?.vx?.isBundled ?? false;
    const graph: Package = {
      name,
      path,
      type,
      isBundled,
      deps,
      devDeps,
    };

    lookup.set(path, graph);

    if (pkg) {
      for (const { from, to } of [
        { from: pkg.dependencies, to: deps },
        { from: pkg.devDependencies, to: devDeps },
      ]) {
        for (const name in from) {
          if (from[name].startsWith('workspace:')) {
            const depPkgFile = resolveFrom(path, `${name}/package`);
            const depPkgRoot = dirname(depPkgFile);
            to.push(addDependency(depPkgRoot, PackageType.Library));
          }
        }
      }

      if (pkg.vx?.services) {
        for (const mod of pkg.vx.services) {
          deps.push(
            addDependency(normalize(join(path, mod)), PackageType.Service)
          );
        }
      }
    }

    return graph;
  }

  return addDependency(path, type);
}

export function getPackages(root: Package): Set<Package> {
  const packages = new Set<Package>();

  function visit(node: Package): void {
    if (packages.has(node)) {
      return;
    }
    packages.add(node);

    for (const dep of node.deps) {
      visit(dep);
    }

    for (const dep of node.devDeps) {
      visit(dep);
    }
  }

  visit(root);

  return packages;
}

export function getProductionPackages(root: Package): Set<Package> {
  const visited = new Set<Package>();
  const packages = new Set<Package>();

  function visit(node: Package) {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    packages.add(node);

    for (const dep of node.deps) {
      if (!node.isBundled || dep.type === PackageType.Service) {
        visit(dep);
      }
    }
  }

  visit(root);

  return packages;
}
