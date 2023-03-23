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
import { formatDurationNs } from '@votingworks/utils';
import { getWorkspacePackageInfo } from '../pnpm';

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

function fullyQualifiedPackageName(name: string): string {
  return name.startsWith(VOTINGWORKS_PACKAGE_NAMESPACE)
    ? name
    : `${VOTINGWORKS_PACKAGE_NAMESPACE}/${name}`;
}

interface Movement {
  symbol: string;
  source: string;
  target: string;
}

export async function main(args: readonly string[]): Promise<number> {
  const monorepoRoot = join(__dirname, '../../..');
  const movements: Movement[] = [];
  const packages: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--dir') {
      const value = args[i + 1];
      i += 1;
      if (value && !value.startsWith('-')) {
        packages.push(value);
      } else {
        process.stderr.write(`error: missing value for --dir\n`);
        return 1;
      }
    } else if (arg === '--all') {
      const workspacePackageInfo = await getWorkspacePackageInfo(monorepoRoot);
      for (const pkg of workspacePackageInfo.values()) {
        if (pkg.name.startsWith(`${VOTINGWORKS_PACKAGE_NAMESPACE}/`)) {
          packages.push(pkg.path);
        }
      }
    } else if (arg.startsWith('-')) {
      process.stderr.write(`error: unknown option ${arg}\n`);
      return 1;
    } else {
      const [symbol, source, target] = arg.split(':');
      if (symbol && source && target) {
        movements.push({
          symbol,
          source: fullyQualifiedPackageName(source),
          target: fullyQualifiedPackageName(target),
        });
      } else {
        process.stderr.write(
          `error: invalid movement ${arg}, expected format is SYMBOL:SOURCE:TARGET\n`
        );
        return 1;
      }
    }
  }

  for (const packageRoot of packages) {
    const relativePackagePath = relative(monorepoRoot, packageRoot);
    const start = process.hrtime.bigint();
    const tsConfigFilePath = await getTsConfigFilePath(packageRoot);

    if (!tsConfigFilePath) {
      process.stderr.write(
        `${relativePackagePath}: could not locate a tsconfig.json file to use\n`
      );
      return 1;
    }

    const project = new Project({ tsConfigFilePath });

    for (const sourceFile of project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();
      const relativeFilePath = relative(packageRoot, filePath);

      if (relativeFilePath.startsWith('../')) {
        continue;
      }

      for (const { symbol, source, target } of movements) {
        const importDeclarationForSource = sourceFile.getImportDeclaration(
          (importDeclaration) => {
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
            return (
              moduleSpecifier === source &&
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
            return moduleSpecifier === target;
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
            moduleSpecifier: target,
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
          `${relativePackagePath}: ${relativeFilePath}: ${symbol}: ${source} → ${target}\n`
        );
      }
    }

    await project.save();
    process.stdout.write(
      `${relativePackagePath}: ✅ ${formatDurationNs(
        process.hrtime.bigint() - start
      )}\n`
    );
  }

  return 0;
}
