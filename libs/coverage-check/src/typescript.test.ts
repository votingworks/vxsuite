import { expect, test } from 'vitest';
import { join } from 'node:path';
import { isStatement } from '@typescript/native/unstable/ast/is';
import {
  makeTempPackage,
  openTempPackage,
  parseSnippet,
} from '../test/helpers.js';
import { assertDefined } from './utils.js';
import {
  astNodeDescendants,
  astNodeStatements,
  collectComments,
  startTypescriptCompilerSession,
} from './typescript.js';

test('opening a directory without a tsconfig fails', () => {
  const directory = makeTempPackage({});
  expect(() => startTypescriptCompilerSession(join(directory, 'nope'))).toThrow(
    /could not load/
  );
});

test('disposing a session stops the compiler', () => {
  const { directory, session } = openTempPackage({
    'src/a.ts': 'export const a = 1;\n',
  });
  const file = join(directory, 'src/a.ts');
  session.sourceFile(file);
  session[Symbol.dispose]();
  expect(() => session.sourceFile(file)).toThrow(/closed/);
});

test('comments are collected everywhere they can sit, minus JSX text', () => {
  const source = parseSnippet(
    [
      'declare function h(...args: unknown[]): unknown;',
      '/* leading block */ export const a = 1; // trailing line',
      'export function f(): void {} // after a body',
      'export function g(): void {',
      '  // inside an otherwise-empty block',
      '}',
      'export const o = {',
      '  // inside an object literal',
      '};',
      'export const j = (',
      '  <div>',
      '    // not a comment: JSX text',
      '    {/* jsx comment */}',
      '  </div>',
      ');',
      'export class A { /* class body */ }',
      'export interface I { /* interface body */ }',
      'export enum E { /* enum body */ }',
      'export const arr = [/* array */];',
      'export const call = arr.map(/* args */);',
      'export function p(/* params */): void {}',
      'export type T = { /* type literal */ };',
      'export const tup: [/* tuple */] = [];',
      'declare const flag: boolean;',
      'export const tern = flag ? /* then arm */ 1 : /* else arm */ 2;',
      'export const nullish = tup[0] ?? /* nullish arm */ 0;',
      'export const guarded = flag && /* and arm */ 1;',
      '/* unterminated at end of file',
    ].join('\n'),
    'src/a.tsx'
  );
  expect(collectComments(source).map((comment) => comment.text.trim())).toEqual(
    [
      'leading block',
      'trailing line',
      'after a body',
      'inside an otherwise-empty block',
      'inside an object literal',
      'jsx comment',
      'class body',
      'interface body',
      'enum body',
      'array',
      'args',
      'params',
      'type literal',
      'tuple',
      'then arm',
      'else arm',
      'nullish arm',
      'and arm',
      'unterminated at end of file',
    ]
  );
});

test('astNodeStatements lists a container node, and is undefined otherwise', () => {
  const source = parseSnippet('export const a = 1;\n');
  expect(astNodeStatements(source)).toEqual(source.statements);
  // A statement is not itself a statement-list container.
  expect(
    astNodeStatements(assertDefined(source.statements[0]))
  ).toBeUndefined();
});

test('a statement is unreachable when a value reference in it is narrowed to never', () => {
  const { directory, session } = openTempPackage({
    'src/a.ts': [
      'type Shape = { kind: "a" } | { kind: "b" };',
      'declare function unreachable(value: never): never;',
      'declare function fail(): never;',
      'declare const shape: Shape;',
      'declare const box: { inner: Shape };',
      'export function bySwitch(): number {',
      '  switch (shape.kind) {',
      '    case "a": return 1;',
      '    case "b": return 2;',
      '    default: return unreachable(shape);',
      '  }',
      '}',
      'export function byPropertyChain(): number {',
      '  switch (box.inner.kind) {',
      '    case "a": return 1;',
      '    case "b": return 2;',
      '    default: return unreachable(box.inner);',
      '  }',
      '}',
      'export function stillReachable(): number {',
      '  // A never-returning call on a live path is not a never-typed reference.',
      '  if (shape.kind === "a") return fail();',
      '  // A declaration name and a type position are not value references.',
      '  let pending: never;',
      '  const widened = null as never;',
      '  return 3;',
      '}',
      '',
    ].join('\n'),
  });
  const source = session.sourceFile(join(directory, 'src/a.ts'));
  const statements = [...astNodeDescendants(source)].filter(isStatement);
  const unreachable = session.unreachableStatements(statements);
  expect(
    [...unreachable]
      .map((statement) =>
        source.text.slice(statement.getStart(source), statement.end)
      )
      .sort()
  ).toEqual(['return unreachable(box.inner);', 'return unreachable(shape);']);
});
