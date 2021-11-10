import { NodePath, parseSync, transformSync } from '@babel/core';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import plugin, { addSpecifierToImport } from './safe_parse_helpers';

function check(input: string, output: string): void {
  expect(
    transformSync(input, {
      plugins: [plugin],
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })?.code
  ).toEqual(output.trim());
}

test('transforms to unsafeParse', () => {
  check(
    `safeParse(Parser, value).unsafeUnwrap();`,
    `unsafeParse(Parser, value);`
  );
});

test('transforms to unsafeParse with imports', () => {
  check(
    [
      `import { safeParse, Translations } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { Translations, unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );
});

test('does not add duplicate imports', () => {
  check(
    [
      `import { safeParse, unsafeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );

  check(
    [
      `import { safeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).unsafeUnwrap();`,
      `safeParse(Parser, value).unsafeUnwrap();`,
    ].join('\n'),
    [
      `import { unsafeParse } from '@votingworks/types';`,
      `unsafeParse(Parser, value);`,
      `unsafeParse(Parser, value);`,
    ].join('\n')
  );
});

test('ignores malformed safeParse call', () => {
  check(
    `safeParse(Parser).unsafeUnwrap();`,
    `safeParse(Parser).unsafeUnwrap();`
  );
});

test('ignores malformed unsafeUnwrap call', () => {
  check(
    `safeParse(Parser, value).unsafeUnwrap(arg);`,
    `safeParse(Parser, value).unsafeUnwrap(arg);`
  );
});

test('transforms to maybeParse', () => {
  check(`safeParse(Parser, value).ok();`, `maybeParse(Parser, value);`);
});

test('transforms to maybeParse with imports', () => {
  check(
    [
      `import { safeParse } from '@votingworks/types';`,
      `safeParse(Parser, value).ok();`,
    ].join('\n'),
    [
      `import { maybeParse } from '@votingworks/types';`,
      `maybeParse(Parser, value);`,
    ].join('\n')
  );
});

test('ignores other safeParse uses', () => {
  check(`safeParse(Parser, value).err();`, `safeParse(Parser, value).err();`);
});

test('ignores malformed safeParse call', () => {
  check(`safeParse(Parser).ok();`, `safeParse(Parser).ok();`);
});

test('ignores malformed ok call', () => {
  check(
    `safeParse(Parser, value).ok(arg);`,
    `safeParse(Parser, value).ok(arg);`
  );
});

test('addSpecifierToImport without specifiers', () => {
  const ast = parseSync(`import '@votingworks/types';`)!;

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
  const ast = parseSync(`import { ok } from '@votingworks/types';`)!;

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
  const ast = parseSync(`import { err } from '@votingworks/types';`)!;

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
  const ast = parseSync(
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
