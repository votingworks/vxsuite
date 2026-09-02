import type { SourceFile } from '@typescript/native/unstable/ast';
import { isIfStatement } from '@typescript/native/unstable/ast/is';
import {
  astClosestParentNodeForSpan,
  astNodeStatements,
  astNodeTerminates,
} from './typescript.js';

/**
 * A report position. Lines are 1-based, columns 0-based UTF-16 code units —
 * the same units as source offsets. In remapped output (vitest + oxc +
 * @vitest/coverage-istanbul) either field may be absent or null.
 */
interface IstanbulPosition {
  readonly line?: number | null;
  readonly column?: number | null;
}

/**
 * A report range. Only `start` is ever trusted: remapped output has
 * `end.column: null` everywhere.
 */
export interface IstanbulRange {
  readonly start: IstanbulPosition;
  readonly end: IstanbulPosition;
}

/**
 * A `fnMap` entry: the function's declaration (`decl`) and body (`loc`).
 */
interface IstanbulFunction {
  readonly name: string;
  readonly decl: IstanbulRange;
  readonly loc: IstanbulRange;
}

/**
 * A `branchMap` entry. `type` is istanbul's branch kind (`if`, `cond-expr`,
 * `binary-expr`, `switch`, `default-arg`, …); `locations` has one range per
 * arm, parallel to the `b` hit array.
 */
interface IstanbulBranch {
  readonly loc: IstanbulRange;
  readonly type: string;
  readonly locations: IstanbulRange[];
}

/**
 * One file's coverage: the value shape of `coverage-final.json` (also
 * `FileCoverage.data` from an in-memory `CoverageMap`).
 *
 * Each `*Map` is keyed by the counter's index in source order as a decimal
 * string (`"0"`, `"1"`, … — istanbul numbers statements, functions, and
 * branches separately as it instruments the file); the parallel `s`/`f`/`b`
 * hit records use the same keys.
 */
export interface IstanbulFileCoverageData {
  readonly path: string;
  /**
   * Statement ranges by statement index.
   */
  readonly statementMap: Record<string, IstanbulRange>;
  /**
   * Hits per statement, keyed like `statementMap`.
   */
  readonly s: Record<string, number>;
  /**
   * Functions by function index.
   */
  readonly fnMap: Record<string, IstanbulFunction>;
  /**
   * Hits per function, keyed like `fnMap`.
   */
  readonly f: Record<string, number>;
  /**
   * Branches by branch index.
   */
  readonly branchMap: Record<string, IstanbulBranch>;
  /**
   * Hits per branch arm, keyed like `branchMap`; each array is parallel to
   * the branch's `locations`.
   */
  readonly b: Record<string, number[]>;
}

/**
 * A single checkable unit of coverage: one of istanbul's counters, located
 * by the UTF-16 offset where its code starts.
 */
export type CoverageCounter =
  | {
      readonly type: 'statement';
      readonly hits: number;
      readonly offset: number;
    }
  | {
      readonly type: 'function';
      readonly hits: number;
      readonly offset: number;
    }
  | {
      readonly type: 'branch';
      /**
       * istanbul's branch type (`if`, `cond-expr`, `binary-expr`, …).
       */
      readonly branchType: string;
      readonly hits: number;
      readonly offset: number;
      /**
       * For the implicit else arm of an `if` with no `else`, that `if`'s
       * offset.
       */
      readonly implicitElseOffset?: number;
    };

/**
 * The offset of a report range's start, if it has one.
 */
function startOffset(
  range: IstanbulRange,
  file: SourceFile
): number | undefined {
  const { line, column } = range.start;
  if (line === undefined || line === null || line <= 0) return undefined;
  const lineStart = file.getLineStarts()[line - 1];
  // Positions can be past the end of the file, clamp to the end of the file
  if (lineStart === undefined) return file.text.length;
  // Columns can be negative or missing, clamp to the start of the line.
  return Math.min(lineStart + Math.max(0, column ?? 0), file.text.length);
}

/**
 * Converts a file's istanbul coverage data into a list of {@link CoverageCounter}s.
 */
export function collectIstanbulCoverageCounters(
  fileCoverageData: IstanbulFileCoverageData,
  file: SourceFile
): CoverageCounter[] {
  function requireOffset(range: IstanbulRange, what: string): number {
    const offset = startOffset(range, file);
    if (offset === undefined) {
      throw new Error(
        `coverage-check: ${fileCoverageData.path} reports ${what} with no position`
      );
    }
    return offset;
  }

  const counters: CoverageCounter[] = [];
  for (const [key, range] of Object.entries(fileCoverageData.statementMap)) {
    counters.push({
      type: 'statement',
      hits: fileCoverageData.s[key] ?? 0,
      offset: requireOffset(range, `statement ${key}`),
    });
  }
  for (const [key, functionMeta] of Object.entries(fileCoverageData.fnMap)) {
    counters.push({
      type: 'function',
      hits: fileCoverageData.f[key] ?? 0,
      // A function has two ranges: `decl` (its name, or for an arrow the arrow
      // token) and `loc` (its body). A directive claims the counter when the
      // counter's offset is inside the directive's node, so the offset must be
      // inside the function, so we use `functionMeta.loc`. We've seen `decl.start` drift
      // to an earlier position outside the arrow function.
      offset: requireOffset(functionMeta.loc, `function ${key}`),
    });
  }
  for (const [key, branch] of Object.entries(fileCoverageData.branchMap)) {
    const hitsByArm = fileCoverageData.b[key] ?? [];
    for (const [arm, range] of branch.locations.entries()) {
      const armCounter = {
        type: 'branch',
        branchType: branch.type,
        hits: hitsByArm[arm] ?? 0,
      } as const;
      const offset = startOffset(range, file);
      if (offset !== undefined) {
        counters.push({ ...armCounter, offset });
      } else if (branch.type === 'if') {
        // An `if` arm with no position is an implicit else
        const ifOffset = requireOffset(branch.loc, `branch ${key}`);
        counters.push({
          ...armCounter,
          offset: implicitElseOffset(ifOffset, file),
          implicitElseOffset: ifOffset,
        });
      } else {
        throw new Error(
          `coverage-check: ${fileCoverageData.path} reports branch ${key} arm ${arm} with no position`
        );
      }
    }
  }
  return counters;
}

/**
 * Where the implicit else arm of the `if` at `ifOffset` is located. When the
 * then-arm terminates (return/throw/break/continue), the implicit else is
 * really "the code after the if", so it is attributed to the following
 * statement. For an `else if`, "after the if" means after the outermost `if`
 * of the chain. When nothing follows, it stays at the `if`.
 */
function implicitElseOffset(ifOffset: number, file: SourceFile): number {
  const ifStatement = astClosestParentNodeForSpan(
    { start: ifOffset, end: ifOffset + 1 },
    file
  );
  if (
    !isIfStatement(ifStatement) ||
    !astNodeTerminates(ifStatement.thenStatement)
  ) {
    return ifOffset;
  }
  // For an `else if`, hop to the outermost `if` of the chain — an IfStatement
  // is never a statement-list container itself.
  let node = ifStatement;
  while (isIfStatement(node.parent)) {
    node = node.parent;
  }
  const statements = astNodeStatements(node.parent);
  const following = statements?.[statements.indexOf(node) + 1];
  return following ? following.getStart(file) : ifOffset;
}

/**
 * Whether any counter in the file has zero hits. As in
 * `collectIstanbulCoverageCounters`, a counter with no hit entry has zero hits.
 */
export function hasUncovered(
  fileCoverageData: IstanbulFileCoverageData
): boolean {
  const { statementMap, s, fnMap, f, branchMap, b } = fileCoverageData;
  return (
    Object.keys(statementMap).some((key) => (s[key] ?? 0) === 0) ||
    Object.keys(fnMap).some((key) => (f[key] ?? 0) === 0) ||
    Object.entries(branchMap).some(([key, branch]) =>
      branch.locations.some((_, arm) => (b[key]?.[arm] ?? 0) === 0)
    )
  );
}
