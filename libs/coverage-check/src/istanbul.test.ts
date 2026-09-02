import { expect, test } from 'vitest';
import { parseSnippet } from '../test/helpers.js';
import {
  collectIstanbulCoverageCounters,
  hasUncovered,
  type IstanbulFileCoverageData,
  type IstanbulRange,
} from './istanbul.js';

function range(line: number, column: number | null = 0): IstanbulRange {
  return { start: { line, column }, end: { line: null, column: null } };
}

test('report positions map to offsets, tolerating remapped-report quirks', () => {
  const source = parseSnippet('ab\ncd\n\nefg');
  const statementMap: IstanbulFileCoverageData['statementMap'] = {
    '0': range(2, 1),
    '1': range(4, 2),
    // Negative or missing columns mean the start of the line.
    '2': range(2, -2),
    '3': range(2, null),
    // Positions outside the file clamp to its end.
    '4': range(1, 99),
    '5': range(9, 0),
  };
  const counters = collectIstanbulCoverageCounters(
    { path: 'a', statementMap, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} },
    source
  );
  expect(
    counters.map((counter) => counter.type === 'statement' && counter.offset)
  ).toEqual([4, 9, 3, 3, 10, 10]);
});

test('collectIstanbulCoverageCounters flattens statements, functions, and branch arms in numeric key order', () => {
  const source = parseSnippet(
    [
      'export function f(): number {',
      '  return 5;',
      '}',
      'declare const flag: boolean;',
      'export function g(): number {',
      '  if (flag) {',
      '    g();',
      '  }',
      '  return flag ? 1 : 2;',
      '}',
      '',
    ].join('\n')
  );
  const coverage: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    // Keys deliberately out of order: counters come out in numeric key order.
    statementMap: { '10': range(9, 2), '2': range(2, 2) },
    // No entry for statement '10': a missing hit entry means zero hits.
    s: { '2': 5 },
    fnMap: {
      '0': { name: 'f', decl: range(1, 16), loc: range(1, 28) },
      '1': { name: 'g', decl: range(5, 16), loc: range(5, 28) },
    },
    f: { '0': 1 },
    branchMap: {
      '0': {
        loc: range(6, 2),
        type: 'if',
        // The second location has no position: an implicit else arm.
        locations: [range(6, 2), { start: {}, end: {} }],
      },
      '1': {
        loc: range(9, 9),
        type: 'cond-expr',
        locations: [range(9, 16), range(9, 20)],
      },
    },
    // No entry for branch '1': a missing hit array means zero hits per arm.
    b: { '0': [1, 0] },
  };
  const counters = collectIstanbulCoverageCounters(coverage, source);
  function snippetAt(offset: number): string {
    return source.text
      .slice(offset)
      .split(/\s+/)
      .filter(Boolean)
      .join(' ')
      .slice(0, 13);
  }
  expect(
    counters.map((counter) => [
      counter.type,
      counter.hits,
      snippetAt(counter.offset),
    ])
  ).toEqual([
    // Statements in numeric key order ('2' before '10'), then functions, then
    // branch arms.
    ['statement', 5, 'return 5; } d'],
    ['statement', 0, 'return flag ?'],
    // Functions land at the body (`loc`), not the declaration (`decl`), so
    // that a directive on the function contains them.
    ['function', 1, '{ return 5; }'],
    ['function', 0, '{ if (flag) {'],
    ['branch', 1, 'if (flag) { g'],
    // The implicit else arm of a NON-terminating then stays at the `if`.
    ['branch', 0, 'if (flag) { g'],
    ['branch', 0, '1 : 2; }'],
    ['branch', 0, '2; }'],
  ]);
  // The implicit else arm remembers its `if` so -else directives can claim it.
  expect(counters[5]).toMatchObject({
    branchType: 'if',
    implicitElseOffset: counters[4]?.offset,
  });
});

test('an implicit else whose `if` is not found stays at the reported position (remap drift)', () => {
  const source = parseSnippet('export const a = 1;\n');
  const coverage: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    statementMap: {},
    s: {},
    fnMap: {},
    f: {},
    branchMap: {
      // The report claims an `if` at 1:0, but the source has none there.
      '0': {
        loc: range(1, 0),
        type: 'if',
        locations: [range(1, 0), { start: {}, end: {} }],
      },
    },
    b: { '0': [1, 0] },
  };
  const counters = collectIstanbulCoverageCounters(coverage, source);
  expect(counters[1]).toMatchObject({ offset: 0, implicitElseOffset: 0 });
});

test('a counter without a position is a malformed report', () => {
  const source = parseSnippet('export const a = 1;\n');
  const base: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    statementMap: {},
    s: {},
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  };
  const none: IstanbulRange = { start: {}, end: {} };
  expect(() =>
    collectIstanbulCoverageCounters(
      { ...base, statementMap: { '0': { start: { line: null }, end: {} } } },
      source
    )
  ).toThrow('reports statement 0 with no position');
  // Istanbul lines are 1-based; line 0 can only come from a remapping bug.
  expect(() =>
    collectIstanbulCoverageCounters(
      { ...base, statementMap: { '0': { start: { line: 0 }, end: {} } } },
      source
    )
  ).toThrow('reports statement 0 with no position');
  expect(() =>
    collectIstanbulCoverageCounters(
      { ...base, fnMap: { '0': { name: 'f', decl: range(1), loc: none } } },
      source
    )
  ).toThrow('reports function 0 with no position');
  // A non-`if` arm has no implicit else to fall back on.
  expect(() =>
    collectIstanbulCoverageCounters(
      {
        ...base,
        branchMap: {
          '1': { loc: range(1), type: 'cond-expr', locations: [none] },
        },
      },
      source
    )
  ).toThrow('reports branch 1 arm 0 with no position');
  // An implicit else needs its `if` to be placed.
  expect(() =>
    collectIstanbulCoverageCounters(
      {
        ...base,
        branchMap: { '2': { loc: none, type: 'if', locations: [none] } },
      },
      source
    )
  ).toThrow('reports branch 2 with no position');
});

test('hasUncovered treats a missing hit entry as zero hits', () => {
  const covered: IstanbulFileCoverageData = {
    path: '/pkg/src/a.ts',
    statementMap: { '0': range(1) },
    s: { '0': 1 },
    fnMap: { '0': { name: 'f', decl: range(1), loc: range(1) } },
    f: { '0': 1 },
    branchMap: {
      '0': { type: 'if', loc: range(1), locations: [range(1), range(2)] },
    },
    b: { '0': [1, 1] },
  };
  expect(hasUncovered(covered)).toEqual(false);
  expect(hasUncovered({ ...covered, s: {} })).toEqual(true);
  expect(hasUncovered({ ...covered, f: {} })).toEqual(true);
  expect(hasUncovered({ ...covered, b: { '0': [1] } })).toEqual(true);
});
