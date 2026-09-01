import { expect, test } from 'vitest';
import { join } from 'node:path';
import { makeTempPackage, parseSnippet } from '../test/helpers.js';
import type { IstanbulFileCoverageData, IstanbulRange } from './istanbul.js';
import { checkFile, checkPackage } from './check.js';
import type { TypescriptCompilerSession } from './typescript.js';

test('a report file the project does not contain is a configuration error', () => {
  const directory = makeTempPackage({ 'src/a.ts': 'export const a = 1;\n' });
  const ghost: IstanbulFileCoverageData = {
    path: join(directory, 'src/ghost.ts'),
    statementMap: { '0': { start: { line: 1, column: 0 }, end: {} } },
    s: { '0': 0 },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  };
  expect(() => checkPackage(directory, [ghost])).toThrow(
    'is not in the project'
  );
});

test('counters outside any node still count as failures', () => {
  const directory = makeTempPackage({
    'src/a.ts': 'export const a = 1;          \n',
  });
  const coverage: IstanbulFileCoverageData = {
    path: join(directory, 'src/a.ts'),
    statementMap: {
      // Trailing whitespace: inside the file but inside no statement.
      '0': { start: { line: 1, column: 25 }, end: {} },
      // Past the end of the file: reported at the start of the file.
      '1': { start: { line: 40, column: 0 }, end: {} },
    },
    s: { '0': 0, '1': 0 },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  };
  const result = checkPackage(directory, [coverage]);
  expect(result.summary.uncoveredCounters).toEqual(2);
  expect(result.issues.map((issue) => [issue.name, issue.span])).toEqual([
    ['uncovered-statement', { start: 25, end: 29 }],
    ['uncovered-statement', { start: 0, end: 0 }],
  ]);
});

function mockTypescriptSession(
  unreachableStatements: TypescriptCompilerSession['unreachableStatements']
): TypescriptCompilerSession {
  function unavailable(): never {
    throw new Error('not available in a mock session');
  }
  return { unreachableStatements, sourceFile: unavailable, close: unavailable };
}

test('the tightest containing directive wins', () => {
  const source = parseSnippet(
    [
      '// @coverage-defer-file: whole file',
      'export function f(x: number): number {',
      '  // @coverage-exclude: tight',
      '  if (x > 0) {',
      '    return 1;',
      '  }',
      '  return 2;',
      '}',
      '',
    ].join('\n')
  );

  const coverage: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    statementMap: {
      '0': { start: { line: 4, column: 2 }, end: {} },
      '1': { start: { line: 5, column: 4 }, end: {} },
      '2': { start: { line: 7, column: 2 }, end: {} },
      '3': { start: { line: 99, column: 0 }, end: {} },
    },
    s: { '0': 0, '1': 0, '2': 1, '3': 0 },
    fnMap: {
      '0': {
        name: 'f',
        decl: { start: { line: 2, column: 16 }, end: {} },
        loc: { start: { line: 2, column: 37 }, end: {} },
      },
    },
    f: { '0': 1 },
    branchMap: {
      '0': {
        loc: { start: { line: 4, column: 2 }, end: {} },
        type: 'if',
        locations: [
          { start: { line: 4, column: 2 }, end: {} },
          { start: {}, end: {} },
        ],
      },
    },
    b: { '0': [0, 1] },
  };
  const result = checkFile(
    source,
    coverage,
    mockTypescriptSession(() => new Set())
  );
  expect(result.counters.map((counter) => counter.status)).toEqual([
    // The `if` and its body are claimed by the tight exclude, not the file defer.
    'excluded', // s0: the if
    'excluded', // s1: return 1
    'covered', // s2: return 2
    // A statement past the end of the file still lands in the whole-file range.
    'deferred', // s3: line 99
    'covered', // f0
    'excluded', // b0.0: the then arm
    // The covered implicit-else arm is matched against nothing and stays covered.
    'covered', // b0.1
  ]);
  expect(
    result.directives.map(({ bindingResult, isStale }) => [
      'target' in bindingResult ? bindingResult.directive.scope : undefined,
      isStale,
    ])
  ).toEqual([
    ['file', false],
    ['next', false],
  ]);
});

test('when then-arm terminates, implicit-else coverage is attributed to the next statement', () => {
  const source = parseSnippet(
    [
      'declare const x: number;',
      '// @coverage-exclude: both implicit else arms are attributed within f',
      'export function f(): number {',
      '  if (x > 0) {',
      '    return 1;',
      '  } else if (x < 0) {',
      '    return -1;',
      '  }',
      '  return 0;',
      '}',
      '// @coverage-exclude: with nothing following the if, the arm stays there',
      'export function g(): void {',
      '  if (x > 2) {',
      '    return;',
      '  }',
      '}',
      '',
    ].join('\n')
  );
  // An `if` arm whose implicit else has no position, as istanbul emits for the
  // innermost `if` of a chain (an explicit else arm carries a position).
  function arm(atLine: number, column: number) {
    const start: IstanbulRange['start'] = { line: atLine, column };
    return {
      loc: { start, end: {} },
      type: 'if',
      locations: [
        { start, end: {} },
        { start: {}, end: {} },
      ],
    };
  }
  const coverage: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    statementMap: {},
    s: {},
    fnMap: {},
    f: {},
    branchMap: { '0': arm(6, 9), '1': arm(13, 2) },
    b: { '0': [1, 0], '1': [1, 0] },
  };
  const result = checkFile(
    source,
    coverage,
    mockTypescriptSession(() => new Set())
  );
  function line(offset?: number): number | undefined {
    return offset === undefined
      ? undefined
      : source.getLineAndCharacterOfPosition(offset).line + 1;
  }
  expect(
    result.counters
      .filter(
        ({ counter }) =>
          counter.type === 'branch' && counter.implicitElseOffset !== undefined
      )
      .map(({ counter, status }) => [line(counter.offset), status])
  ).toEqual([
    // The `else if`'s missing else coverage is attributed to `return 0` — the
    // statement following the outermost `if` of the chain.
    [9, 'excluded'],
    // The `if` in `g` has no following statement, so the missing else coverage
    // stays attributed to the `if` itself.
    [13, 'excluded'],
  ]);
});
