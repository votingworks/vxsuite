/**
 * Converts all files in the current project to use snake case rather than
 * camel case. This is to follow the GTS style guide rule from
 * https://google.github.io/styleguide/tsguide.html#identifiers:
 *
 *   > **Imports:** Module namespace imports are `lowerCamelCase` while files are
 *   > `snake_case`, which means that imports correctly will not match in casing
 *   > style, such as:
 *   >
 *   > ```ts
 *   > import * as fooBar from './foo_bar';
 *   > ```
 *
 * Run it like this in a TypeScript project:
 *
 *   pnpx ts-node -T path/to/snake_case.ts
 */

import { basename, dirname, join, relative } from 'path';
import { constants, promises as fs } from 'fs';
import { Project, ts } from 'ts-morph';

async function canReadWrite(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.O_RDWR);
    return true;
  } catch {
    return false;
  }
}

function convertFilenameToSnakeCase(fileName: string): string {
  return fileName
    .replace(/[A-Z]+/g, (caps, index) =>
      (index === 0 ? caps : `_${caps}`).toLowerCase()
    )
    .replace(/-/g, '_');
}

function shouldRenameFile(root: string, filePath: string): boolean {
  const fileName = basename(filePath);
  return (
    !fileName.startsWith('setupTests.ts') &&
    !fileName.startsWith('serviceWorker.ts') &&
    !fileName.endsWith('.json') &&
    filePath.startsWith(root)
  );
}

async function getTsConfigFilePath(cwd: string): Promise<string | undefined> {
  // prefer `tsconfig.test.json` because they include all the test files too
  for (const tsConfigName of ['tsconfig.test.json', 'tsconfig.json']) {
    const tsConfigFilePath = join(cwd, tsConfigName);
    if (await canReadWrite(tsConfigFilePath)) {
      return tsConfigFilePath;
    }
  }
}

function snapshotFileForSourceFile(sourceFilePath: string): string {
  const sourceFileDirname = dirname(sourceFilePath);
  const sourceFileBasename = basename(sourceFilePath);
  const snapshotFilePath = join(
    sourceFileDirname,
    '__snapshots__',
    `${sourceFileBasename}.snap`
  );
  return snapshotFilePath;
}

function isTestFile(filePath: string): boolean {
  return /(\/__tests__\/|\.test\.tsx?$)/.test(filePath);
}

function printRename(root: string, from: string, toFileName: string): void {
  const fromRelative = relative(root, from);
  const toRelative = join(dirname(fromRelative), toFileName);

  process.stdout.write(`${fromRelative} → ${toRelative}\n`);
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
    const filePath = sourceFile.getFilePath();
    const fileName = basename(filePath);
    const relativeFilePath = relative(root, filePath);

    if (!shouldRenameFile(root, filePath)) {
      process.stdout.write(`SKIP ${relativeFilePath}\n`);
      continue;
    }

    const snakeCaseFileName = convertFilenameToSnakeCase(fileName);
    printRename(root, filePath, snakeCaseFileName);
    sourceFile.move(snakeCaseFileName);

    // replace `jest.mock('./path/to/SomeFile')` with `jest.mock('./path/to/some_file')`
    if (isTestFile(filePath)) {
      for (const statement of sourceFile.getStatements()) {
        const callExpression = statement
          .asKind(ts.SyntaxKind.ExpressionStatement)
          ?.getChildrenOfKind(ts.SyntaxKind.CallExpression)[0];
        if (!callExpression) {
          continue;
        }

        const callee = callExpression
          .getExpression()
          .asKind(ts.SyntaxKind.PropertyAccessExpression);
        if (!callee) {
          continue;
        }

        if (
          callee.getExpression().asKind(ts.SyntaxKind.Identifier)?.getText() !==
            'jest' ||
          callee.getName() !== 'mock'
        ) {
          continue;
        }

        const args = callExpression.getArguments();
        if (args.length !== 1) {
          continue;
        }

        const arg = args[0].asKind(ts.SyntaxKind.StringLiteral);
        if (!arg) {
          continue;
        }

        const mockedPath = arg.getLiteralValue();
        if (!mockedPath.startsWith('./') && !mockedPath.startsWith('../')) {
          continue;
        }

        const mockedPathDirname = dirname(mockedPath);
        const mockedPathBasename = basename(mockedPath);
        const snakeCaseMockedPathBasename =
          convertFilenameToSnakeCase(mockedPathBasename);
        // NOTE: don't use `join` because it normalizes the path, removing the leading `./`
        arg.setLiteralValue(
          `${mockedPathDirname}/${snakeCaseMockedPathBasename}`
        );
      }
    }

    const snapshotFilePath = snapshotFileForSourceFile(filePath);
    if (await canReadWrite(snapshotFilePath)) {
      const snakeCaseFilePath = join(dirname(filePath), snakeCaseFileName);
      const snakeCaseSnapshotFilePath =
        snapshotFileForSourceFile(snakeCaseFilePath);
      printRename(root, snapshotFilePath, snakeCaseSnapshotFilePath);
      await fs.rename(snapshotFilePath, snakeCaseSnapshotFilePath);
    }
  }

  await project.save();

  return 0;
}

main().catch((error) => {
  process.stderr.write(`[CRASH] ${error}\n`);
  return 1;
});
