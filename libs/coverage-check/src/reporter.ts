import type { Context, ReportNode } from 'istanbul-lib-report';
import { relative } from 'node:path';
import type { IstanbulFileCoverageData } from './istanbul.js';
import {
  checkPackage,
  type PackageCheckResult,
  type SummaryCounts,
  type Issue,
} from './check.js';
import { assertDefined } from './utils.js';

function lineAndColumn(
  sourceText: string,
  offset: number
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < sourceText.length; i += 1) {
    if (sourceText[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart };
}

// \u001b[ is the terminal styling (SGR) introducer.
const ESC = '\u001b[';
const RESET = `${ESC}0m`;
const DIM = `${ESC}2m`;
const CYAN_UNDERLINE = `${ESC}36;1;4m`;
const CYAN = `${ESC}36m`;
const MAGENTA = `${ESC}35;1m`;
const BOLD_RED = `${ESC}31;1m`;
const BOLD_GREEN = `${ESC}32;1m`;

/**
 * Renders one issue as a snippet box, inspired by Rust's miette format.
 */
export function formatIssue(issue: Issue, projectRoot: string): string {
  const filePath = relative(projectRoot, issue.filePath);
  const { sourceFileText: source } = issue;
  const color = issue.severity === 'error' ? `${ESC}31m` : `${ESC}33m`;
  const glyph = issue.severity === 'error' ? '×' : '⚠';

  const lines = source.split('\n');
  const startPos = lineAndColumn(source, issue.span.start);
  const endPos = lineAndColumn(source, issue.span.end);
  const firstLine = Math.max(1, startPos.line - 1);
  const lastLine = Math.min(lines.length, endPos.line + 1);
  const gutter = String(lastLine).length;
  const pad = ' '.repeat(gutter + 2);

  const out: string[] = [];
  out.push(
    `  ${color}${glyph} coverage(${issue.name})${RESET}: ${issue.message}`
  );
  out.push(
    `${pad}╭─[${CYAN_UNDERLINE}${filePath}:${startPos.line}:${
      startPos.column + 1
    }${RESET}]`
  );
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const text = assertDefined(lines[lineNumber - 1]);
    out.push(` ${DIM}${String(lineNumber).padStart(gutter)}${RESET} │ ${text}`);
    if (lineNumber === startPos.line) {
      const underlineStart = startPos.column;
      const underlineLength = Math.max(
        1,
        (endPos.line === lineNumber ? endPos.column : text.length) -
          underlineStart
      );
      const mid = Math.floor(underlineLength / 2);
      const bar = `${'─'.repeat(mid)}┬${'─'.repeat(
        Math.max(0, underlineLength - mid - 1)
      )}`;
      out.push(`${pad}· ${MAGENTA}${' '.repeat(underlineStart)}${bar}${RESET}`);
      out.push(
        `${pad}· ${' '.repeat(underlineStart + mid)}${MAGENTA}╰── ${
          issue.spanCaption
        }${RESET}`
      );
    }
  }
  out.push(`${pad}╰────`);
  out.push(`${CYAN}  help: ${RESET}${issue.help}`);
  return out.join('\n');
}

/**
 * Whether the run satisfies the coverage invariant (warnings allowed).
 */
function passes(summary: SummaryCounts): boolean {
  return summary.uncoveredCounters === 0 && summary.directiveErrors === 0;
}

/**
 * The trailing summary line.
 */
export function formatSummary(summary: SummaryCounts): string {
  const problems = [
    `${summary.uncoveredCounters} uncovered`,
    summary.staleDirectives > 0 && `${summary.staleDirectives} stale`,
    summary.directiveErrors === 1 && '1 error',
    summary.directiveErrors > 1 && `${summary.directiveErrors} errors`,
  ];
  const notes = [
    summary.deferredCounters > 0 && `${summary.deferredCounters} deferred`,
    summary.excludedCounters > 0 && `${summary.excludedCounters} excluded`,
  ].filter(Boolean);
  const parenthetical = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  const color = passes(summary) ? BOLD_GREEN : BOLD_RED;
  return `${color}coverage summary: ${problems
    .filter(Boolean)
    .join(', ')}${RESET}${parenthetical}`;
}

/**
 * Writes issues and summary to stdout.
 */
export function printResult(
  result: PackageCheckResult,
  projectRoot: string
): void {
  const blocks = [
    ...result.issues.map((issue) => formatIssue(issue, projectRoot)),
    formatSummary(result.summary),
  ];
  process.stdout.write(`\n${blocks.join('\n\n')}\n\n`);
}

/**
 * Options istanbul passes to a custom reporter constructor.
 */
interface ReporterOptions {
  readonly projectRoot: string;
}

/**
 * The istanbul reporter that runs coverage-check.
 */
export class CoverageCheckReporter {
  private readonly projectRoot: string;
  private readonly fileCoverageData: IstanbulFileCoverageData[] = [];

  constructor(options: ReporterOptions) {
    this.projectRoot = options.projectRoot;
  }

  execute(context: Context): void {
    context.getTree().visit(this, context);
    const result = checkPackage(this.projectRoot, this.fileCoverageData);
    printResult(result, this.projectRoot);
    if (!passes(result.summary)) process.exitCode = 1;
  }

  onDetail(node: ReportNode): void {
    this.fileCoverageData.push(node.getFileCoverage().data);
  }
}
