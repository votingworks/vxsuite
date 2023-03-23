/**
 * Updates references to symbols from one TypeScript package to another.
 *
 * Run it like this:
 *
 *   codemods/bin/codemod-move-symbols --all MOVEMENT [MOVEMENT ...]
 *
 * A `MOVEMENT` is a string of the form `SYMBOL:SOURCE:TARGET` where `SYMBOL` is
 * the name of the symbol to move, `SOURCE` is the name of the package to move
 * it from, and `TARGET` is the name of the package to move it to.
 *
 * For example, to update references to the `Optional` symbol from
 * `@votingworks/types` to `@votingworks/basics` everywhere:
 *
 *   codemods/bin/codemod-move-symbols --all Optional:types:basics
 *
 * Or just within `libs/auth`:
 *
 *   codemods/bin/codemod-move-symbols --dir libs/auth Optional:types:basics
 *
 * Using longhand for source and target:
 *
 *   codemods/bin/codemod-move-symbols --dir libs/auth Optional:@votingworks/types:@votingworks/basics
 */

import { constants, promises as fs } from 'fs';
import { join, relative } from 'path';
import { Project } from 'ts-morph';
import { iter, Optional } from '@votingworks/basics';
import { formatDurationNs } from '@votingworks/utils';
import { getWorkspacePackageInfo, PackageInfo } from '../pnpm';

const VOTINGWORKS_PACKAGE_NAMESPACE = '@votingworks';

async function canReadWrite(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.O_RDWR);
    return true;
  } catch {
    return false;
  }
}

async function getTsConfigFilePath(cwd: string): Promise<string | undefined> {
  const tsConfigFilePath = join(cwd, 'tsconfig.json');
  if (await canReadWrite(tsConfigFilePath)) {
    return tsConfigFilePath;
  }
}

function findPackageByName(
  packages: Iterable<PackageInfo>,
  name: string
): Optional<PackageInfo> {
  for (const pkg of packages) {
    if (
      pkg.name === name ||
      pkg.name === `${VOTINGWORKS_PACKAGE_NAMESPACE}/${name}`
    ) {
      return pkg;
    }
  }
}

interface Movement {
  symbol: string;
  source: PackageInfo;
  target: PackageInfo;
}

export async function main(args: readonly string[]): Promise<number> {
  const monorepoRoot = join(__dirname, '../../..');
  const movements: Movement[] = [];
  const packages: PackageInfo[] = [];
  const workspacePackageInfo = await getWorkspacePackageInfo(monorepoRoot);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--dir') {
      const value = args[i + 1];
      i += 1;
      if (value && !value.startsWith('-')) {
        const absolutePath = join(process.cwd(), value);
        const pkg = iter(workspacePackageInfo.values()).find(
          ({ path }) => path === absolutePath
        );
        if (!pkg) {
          process.stderr.write(
            `error: ${value} is not a valid package directory\n`
          );
          return 1;
        }
        packages.push(pkg);
      } else {
        process.stderr.write(`error: missing value for --dir\n`);
        return 1;
      }
    } else if (arg === '--all') {
      for (const pkg of workspacePackageInfo.values()) {
        if (pkg.name.startsWith(`${VOTINGWORKS_PACKAGE_NAMESPACE}/`)) {
          packages.push(pkg);
        }
      }
    } else if (arg.startsWith('-')) {
      process.stderr.write(`error: unknown option ${arg}\n`);
      return 1;
    } else {
      const [symbol, source, target] = arg.split(':');
      if (symbol && source && target) {
        const sourcePackage = findPackageByName(
          workspacePackageInfo.values(),
          source
        );
        const targetPackage = findPackageByName(
          workspacePackageInfo.values(),
          target
        );

        if (!sourcePackage) {
          process.stderr.write(
            `error: ${source} is not a valid package name\n`
          );
          return 1;
        }

        if (!targetPackage) {
          process.stderr.write(
            `error: ${target} is not a valid package name\n`
          );
          return 1;
        }

        movements.push({
          symbol,
          source: sourcePackage,
          target: targetPackage,
        });
      } else {
        process.stderr.write(
          `error: invalid movement ${arg}, expected format is SYMBOL:SOURCE:TARGET\n`
        );
        return 1;
      }
    }
  }

  for (const pkg of packages) {
    const start = process.hrtime.bigint();
    let updates = 0;
    const tsConfigFilePath = await getTsConfigFilePath(pkg.path);

    if (!tsConfigFilePath) {
      process.stderr.write(
        `${pkg.name}: could not locate a tsconfig.json file to use\n`
      );
      return 1;
    }

    const project = new Project({ tsConfigFilePath });

    for (const sourceFile of project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();
      const relativeFilePath = relative(pkg.path, filePath);

      if (relativeFilePath.startsWith('../')) {
        continue;
      }

      for (const { symbol, source, target } of movements) {
        // skip if the source and target are the same
        if (source.name === target.name) {
          continue;
        }

        // skip the package we're moving the symbol from or to
        if (pkg.name === source.name || pkg.name === target.name) {
          continue;
        }

        const importDeclarationForSource = sourceFile.getImportDeclaration(
          (importDeclaration) => {
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
            return (
              moduleSpecifier === source.name &&
              importDeclaration
                .getNamedImports()
                .some((namedImport) => namedImport.getName() === symbol)
            );
          }
        );

        if (!importDeclarationForSource) {
          continue;
        }

        const importDeclarationFromTarget = sourceFile.getImportDeclaration(
          (importDeclaration) => {
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
            return moduleSpecifier === target.name;
          }
        );

        if (importDeclarationFromTarget) {
          const existingNamedImports =
            importDeclarationFromTarget.getNamedImports();
          const insertionIndex = existingNamedImports.findIndex(
            (namedImport) =>
              namedImport
                .getName()
                .toLocaleLowerCase()
                .localeCompare(symbol.toLocaleLowerCase()) > 0
          );

          importDeclarationFromTarget.insertNamedImport(
            insertionIndex === -1
              ? existingNamedImports.length
              : insertionIndex,
            symbol
          );
        } else {
          sourceFile.addImportDeclaration({
            namedImports: [symbol],
            moduleSpecifier: target.name,
          });
        }

        for (const namedImport of importDeclarationForSource.getNamedImports()) {
          if (namedImport.getName() === symbol) {
            namedImport.remove();
          }
        }

        if (importDeclarationForSource.getNamedImports().length === 0) {
          importDeclarationForSource.remove();
        }

        process.stdout.write(
          `${pkg.name}: ${relativeFilePath}: ${symbol}: ${source.name} → ${target.name}\n`
        );
        updates += 1;
      }
    }

    await project.save();
    process.stdout.write(
      `${pkg.name}: ✅ ${formatDurationNs(
        process.hrtime.bigint() - start
      )} (${updates} updated)\n`
    );
  }

  return 0;
}
