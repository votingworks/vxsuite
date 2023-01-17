import { NodePath, parseSync, types as t } from '@babel/core';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import { addSpecifierToImport } from './utils';

test('addSpecifierToImport without specifiers', () => {
  const ast: any = parseSync(`import '@votingworks/types';`)!;

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>): void {
      addSpecifierToImport(path, 'ok');
    },
  });

  expect(generate(ast).code).toEqual(
    `import { ok } from '@votingworks/types';`
  );
});

test('addSpecifierToImport with existing specifiers can insert at the start', () => {
  const ast: any = parseSync(`import { ok } from '@votingworks/types';`)!;

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>): void {
      addSpecifierToImport(path, 'err');
    },
  });

  expect(generate(ast).code).toEqual(
    `import { err, ok } from '@votingworks/types';`
  );
});

test('addSpecifierToImport with existing specifiers can insert at the end', () => {
  const ast: any = parseSync(`import { err } from '@votingworks/types';`)!;

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>): void {
      addSpecifierToImport(path, 'ok');
    },
  });

  expect(generate(ast).code).toEqual(
    `import { err, ok } from '@votingworks/types';`
  );
});

test('addSpecifierToImport with existing specifiers can insert in the middle', () => {
  const ast: any = parseSync(
    `import { Election, Precinct } from '@votingworks/types';`
  )!;

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>): void {
      addSpecifierToImport(path, 'ok');
    },
  });

  expect(generate(ast).code).toEqual(
    `import { Election, ok, Precinct } from '@votingworks/types';`
  );
});
