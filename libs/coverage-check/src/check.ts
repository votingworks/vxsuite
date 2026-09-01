import type {
  CaseBlock,
  Node,
  SourceFile,
} from '@typescript/native/unstable/ast';
import {
  isBlock,
  isCaseClause,
  isDefaultClause,
  isSourceFile,
  isStatement,
} from '@typescript/native/unstable/ast/is';
import { readFileSync } from 'node:fs';
import {
  bindDirectives,
  directiveToString,
  isBoundDirective,
  maybeHasDirectives,
  type BoundDirective,
  type DirectiveBindingResult,
} from './directives.js';
import {
  collectIstanbulCoverageCounters,
  hasUncovered,
  type CoverageCounter,
  type IstanbulFileCoverageData,
} from './istanbul.js';
import {
  astClosestParentNodeForSpan,
  startTypescriptCompilerSession,
  astNodeStatements,
  type TypescriptCompilerSession,
  type Span,
} from './typescript.js';
import { throwIllegalValue } from './utils.js';

interface CounterCheckResult {
  readonly counter: CoverageCounter;
  readonly status:
    | 'covered'
    | 'uncovered'
    | 'excluded'
    | 'deferred'
    | 'unreachable';
}

interface DirectiveCheckResult {
  readonly bindingResult: DirectiveBindingResult;
  readonly isStale: boolean;
}

/**
 * The result of checking coverage for a single file.
 */
export interface FileCheckResult {
  readonly directives: DirectiveCheckResult[];
  readonly counters: CounterCheckResult[];
  readonly issues: Issue[];
}

type IssueName =
  | 'uncovered-statement'
  | 'uncovered-function'
  | 'uncovered-branch'
  | 'orphaned-directive'
  | 'misplaced-else-directive'
  | 'misplaced-file-directive'
  | 'stale-directive'
  | 'directive-parse-error';

/**
 * An issue found during coverage checking.
 */
export interface Issue {
  readonly severity: 'error' | 'warning';
  readonly name: IssueName;
  readonly message: string;
  readonly help: string;
  /**
   * Absolute; the reporter renders it relative to the package.
   */
  readonly filePath: string;
  readonly sourceFileText: string;
  readonly span: Span;
  readonly spanCaption: string;
}

/**
 * Counts summarizing the entire coverage check run.
 */
export interface SummaryCounts {
  readonly uncoveredCounters: number;
  readonly excludedCounters: number;
  readonly deferredCounters: number;
  readonly staleDirectives: number;
  readonly directiveErrors: number;
}

/**
 * The result of checking one package.
 */
export interface PackageCheckResult {
  readonly issues: Issue[];
  readonly summary: SummaryCounts;
}

/**
 * Checks a package's coverage against its directives.
 */
export function checkPackage(
  packageDir: string,
  fileCoverages: readonly IstanbulFileCoverageData[]
): PackageCheckResult {
  const tsSession = startTypescriptCompilerSession(packageDir);
  try {
    const fileResults = fileCoverages
      // To save time, only check files with uncovered code or directives
      .filter(
        (fileCoverage) =>
          hasUncovered(fileCoverage) ||
          maybeHasDirectives(readFileSync(fileCoverage.path, 'utf8'))
      )
      .map((fileCoverage) => {
        const sourceFile = tsSession.sourceFile(fileCoverage.path);
        return checkFile(sourceFile, fileCoverage, tsSession);
      });
    return {
      issues: fileResults.flatMap((fileResult) => fileResult.issues),
      summary: summarizeResults(fileResults),
    };
  } finally {
    tsSession.close();
  }
}

function summarizeResults(
  fileResults: readonly FileCheckResult[]
): SummaryCounts {
  const counters = fileResults.flatMap((fileResult) => fileResult.counters);
  const directives = fileResults.flatMap((fileResult) => fileResult.directives);
  return {
    uncoveredCounters: counters.filter(
      (counter) => counter.status === 'uncovered'
    ).length,
    excludedCounters: counters.filter(
      (counter) => counter.status === 'excluded'
    ).length,
    deferredCounters: counters.filter(
      (counter) => counter.status === 'deferred'
    ).length,
    staleDirectives: directives.filter((directive) => directive.isStale).length,
    directiveErrors: directives.filter(
      (directive) => 'error' in directive.bindingResult
    ).length,
  };
}

/**
 * The statement whose reachability decides the reachability of a counter at
 * `offset`. Normally the closest statement containing the counter. For a
 * `switch` arm's counter (which istanbul places at the `case`/`default`
 * keyword) the arm's first statement.
 */
function statementDecidingReachability(
  sourceFile: SourceFile,
  offset: number
): Node | undefined {
  const closest = astClosestParentNodeForSpan(
    { start: offset, end: offset + 1 },
    sourceFile
  );
  if (
    (isCaseClause(closest) || isDefaultClause(closest)) &&
    closest.getStart(sourceFile) === offset
  ) {
    // The first statement that executes when the arm is taken (including for
    // fall-through cases). Unwrap any blocks if necessary.
    const { clauses } = closest.parent as CaseBlock;
    for (let i = clauses.indexOf(closest); i < clauses.length; i += 1) {
      let first = astNodeStatements(clauses[i] as Node)?.[0];
      while (first && isBlock(first)) [first] = first.statements;
      if (first) return first;
    }
  }
  for (let node = closest; !isSourceFile(node); node = node.parent) {
    if (isStatement(node)) return node;
  }
  return undefined;
}

/**
 * Picks a statement for each counter to evaluate to see if the counter is
 * unreachable, then asks the TypeScript compiler session which statements are
 * actually unreachable.
 */
function findUnreachableCounters(
  counters: readonly CoverageCounter[],
  sourceFile: SourceFile,
  session: TypescriptCompilerSession
): Set<CoverageCounter> {
  const counterStatements = new Map<CoverageCounter, Node>();
  for (const counter of counters) {
    if (counter.hits > 0) continue;
    const statement = statementDecidingReachability(sourceFile, counter.offset);
    if (statement) counterStatements.set(counter, statement);
  }
  const unreachableStatements = session.unreachableStatements([
    ...counterStatements.values(),
  ]);
  return new Set(
    [...counterStatements]
      .filter(([, statement]) => unreachableStatements.has(statement))
      .map(([counter]) => counter)
  );
}

/**
 * Analyzes one file against its coverage. Checks every counter from
 * the Istanbul coverage report to see if it is covered, unreachable, or has a
 * directive. Also detects stale directives.
 */
export function checkFile(
  sourceFile: SourceFile,
  fileCoverage: IstanbulFileCoverageData,
  session: TypescriptCompilerSession
): FileCheckResult {
  const coverageCounters = collectIstanbulCoverageCounters(
    fileCoverage,
    sourceFile
  );

  const unreachableCounters = findUnreachableCounters(
    coverageCounters,
    sourceFile,
    session
  );

  const directiveBindingResults = bindDirectives(sourceFile);
  // Sort directives by how much code they apply to, so the most specific ones
  // win when matching to counters
  function targetWidth({ target }: BoundDirective): number {
    return target.type === 'range' ? target.span.end - target.span.start : 0;
  }
  const boundDirectives = directiveBindingResults
    .filter(isBoundDirective)
    .sort((a, b) => targetWidth(a) - targetWidth(b));

  const matchingDirectives = new Set<BoundDirective>();
  const counterCheckResults = coverageCounters.map(
    (counter): CounterCheckResult => {
      if (counter.hits > 0) {
        return { counter, status: 'covered' };
      }
      if (unreachableCounters.has(counter)) {
        return { counter, status: 'unreachable' };
      }
      const matchingDirective = boundDirectives.find(({ target }) =>
        target.type === 'range'
          ? counter.offset >= target.span.start &&
            counter.offset < target.span.end
          : counter.type === 'branch' &&
            counter.implicitElseOffset === target.ifSpan.start
      );
      if (!matchingDirective) {
        return { counter, status: 'uncovered' };
      }
      matchingDirectives.add(matchingDirective);
      return {
        counter,
        status:
          matchingDirective.directive.action === 'exclude'
            ? 'excluded'
            : 'deferred',
      };
    }
  );

  const directiveCheckResults = directiveBindingResults.map(
    (bindingResult): DirectiveCheckResult => ({
      bindingResult,
      isStale:
        isBoundDirective(bindingResult) &&
        !matchingDirectives.has(bindingResult),
    })
  );

  const issues = [
    ...directiveCheckResults.map(directiveIssue),
    ...counterCheckResults.map((counter) =>
      counterIssue(counter, sourceFile.text)
    ),
  ].flatMap((issueBody) =>
    issueBody
      ? [
          {
            ...issueBody,
            filePath: sourceFile.fileName,
            sourceFileText: sourceFile.text,
          },
        ]
      : []
  );
  return {
    directives: directiveCheckResults,
    counters: counterCheckResults,
    issues,
  };
}

type IssueBody = Omit<Issue, 'filePath' | 'sourceFileText'>;

function directiveIssue({
  bindingResult,
  isStale,
}: DirectiveCheckResult): IssueBody | undefined {
  const span = bindingResult.commentSpan;
  if ('error' in bindingResult) {
    switch (bindingResult.error) {
      case 'parse-error':
        return {
          span,
          severity: 'error',
          name: 'directive-parse-error',
          message:
            'comment starts like a coverage directive but does not parse',
          spanCaption: 'not a valid directive',
          help: 'write @coverage-exclude or @coverage-defer, optionally followed by -file or -else, optionally followed by a colon and a reason',
        };
      case 'orphan':
        return bindingResult.directive.scope === 'else'
          ? {
              span,
              severity: 'error',
              name: 'orphaned-directive',
              message: 'directive has no `if` to bind to',
              spanCaption: 'no `if` follows before the end of this scope',
              help: 'delete it, or move it directly above the `if` whose implicit else it should mark',
            }
          : {
              span,
              severity: 'error',
              name: 'orphaned-directive',
              message: 'directive has no code to bind to',
              spanCaption: 'nothing bindable before the end of this scope',
              help: 'delete it, or move it directly above the code it should mark',
            };
      case 'misplaced-else':
        return {
          span,
          severity: 'error',
          name: 'misplaced-else-directive',
          message: 'directive targets an `if` with an explicit `else`',
          spanCaption: 'the next `if` has an explicit else arm',
          help: 'mark the else arm itself with a plain directive instead',
        };
      case 'misplaced-file':
        return {
          span,
          severity: 'error',
          name: 'misplaced-file-directive',
          message: 'directive must appear before the first statement',
          spanCaption: 'code precedes this directive',
          help: 'move it to the top of the file, or use a plain directive for a single node',
        };
      default:
        throwIllegalValue(bindingResult);
    }
  }
  if (isStale) {
    return {
      span,
      severity: 'warning',
      name: 'stale-directive',
      message: `everything this ${directiveToString(
        bindingResult.directive
      )} directive marks is covered`,
      spanCaption: 'no longer needed',
      help: 'delete this directive',
    };
  }
  return undefined;
}

function counterIssue(
  { counter, status }: CounterCheckResult,
  source: string
): IssueBody | undefined {
  if (status !== 'uncovered') return undefined;
  // Underline from the counter to the end of its line (at least one character),
  // since counter end positions are unreliable in remapped reports.
  const { offset } = counter;
  const newline = source.indexOf('\n', offset);
  const lineEnd = newline === -1 ? source.length : newline;
  const span: Span =
    // A counter the report places past the end of the file is still reported at
    // the start of the file.
    offset >= source.length
      ? { start: 0, end: 0 }
      : { start: offset, end: Math.max(offset + 1, lineEnd) };
  const isImplicitElse =
    counter.type === 'branch' && counter.implicitElseOffset !== undefined;
  const issueBase = {
    span,
    severity: 'error',
    spanCaption: isImplicitElse ? 'else branch not covered' : 'not covered',
    help: 'add a test that exercises this code, or mark it with @coverage-defer/@coverage-exclude',
  } as const;
  switch (counter.type) {
    case 'function':
      return {
        ...issueBase,
        name: 'uncovered-function',
        message: 'function is never called in tests',
      };
    case 'branch':
      return {
        ...issueBase,
        name: 'uncovered-branch',
        message: isImplicitElse
          ? 'the `if` condition is never false in tests'
          : `branch arm (${counter.branchType}) is never taken in tests`,
      };
    case 'statement':
      return {
        ...issueBase,
        name: 'uncovered-statement',
        message: 'statement is never executed in tests',
      };
    default:
      throwIllegalValue(counter);
  }
}
