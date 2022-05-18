/**
 * Refactors uses of `@votingworks/types/api*` to use `@votingworks/api`.
 *
 * Run it like so within a TypeScript project:
 *
 * ```sh
 * $ pnpx sucrase-node /path/to/codemods/src/types_to_api.ts
 * ```
 */

import assert from 'assert/strict';
import { constants, promises as fs } from 'fs';
import { join } from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';

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

async function main(): Promise<number> {
  const root = process.cwd();
  const tsConfigFilePath = await getTsConfigFilePath(root);

  if (!tsConfigFilePath) {
    process.stderr.write(
      'error: could not locate a tsconfig.json file to use\n'
    );
    return 1;
  }

  const project = new Project({ tsConfigFilePath });

  for (const sourceFile of project.getSourceFiles()) {
    const declarations = sourceFile.getImportDeclarations();

    for (const declaration of declarations) {
      if (
        !declaration
          .getModuleSpecifierValue()
          .startsWith('@votingworks/types/api')
      ) {
        continue;
      }

      let needsScanImport = false;
      for (const namedImport of declaration.getNamedImports()) {
        if (
          namedImport.getName().startsWith('OkResponse') ||
          namedImport.getName().startsWith('ErrorsResponse')
        ) {
          continue;
        }

        assert(!namedImport.getAliasNode());
        for (const referencedNode of namedImport
          .getNameNode()
          .findReferencesAsNodes()) {
          if (!Node.isIdentifier(referencedNode)) {
            continue;
          }
          if (
            !referencedNode.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
          ) {
            referencedNode.replaceWithText(`Scan.${namedImport.getName()}`);
          }
        }

        needsScanImport = true;
        namedImport.remove();
      }

      if (needsScanImport) {
        declaration.addNamedImport('Scan');
      }

      declaration.getModuleSpecifier().replaceWithText(`'@votingworks/api'`);
    }
  }

  await project.save();

  return 0;
}

main().catch((error) => {
  process.stderr.write(`[CRASH] ${error}\n`);
  return 1;
});
