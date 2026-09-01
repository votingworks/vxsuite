import { afterEach, expect, test, vi } from 'vitest';
import {
  captureStdout,
  FIXTURES_DIR,
  fixtureReport,
  makeTempPackage,
} from '../test/helpers.js';
import type { IstanbulFileCoverageData } from './istanbul.js';
import { checkPackage, type SummaryCounts } from './check.js';
import {
  CoverageCheckReporter,
  printResult,
  formatIssue,
  formatSummary,
} from './reporter.js';

interface MockContext {
  getTree(): {
    visit(visitor: {
      onDetail(node: {
        getFileCoverage(): { data: IstanbulFileCoverageData };
      }): void;
    }): void;
  };
}

const ESC = '\u001b['; // ESC [ — the terminal styling (SGR) introducer
const BOLD_RED = `${ESC}31;1m`;
const BOLD_GREEN = `${ESC}32;1m`;
const RESET = `${ESC}0m`;

function stripStyling(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('the fixtures report', () => {
  const out = captureStdout();
  printResult(checkPackage(FIXTURES_DIR, fixtureReport()), FIXTURES_DIR);
  expect(stripStyling(out.text())).toMatchSnapshot();
});

test('the istanbul reporter collects file coverage, prints, and fails the run', () => {
  const out = captureStdout();
  const report = fixtureReport();
  const reporter = new CoverageCheckReporter({ projectRoot: FIXTURES_DIR });
  const context: MockContext = {
    getTree: () => ({
      visit(visitor) {
        for (const data of report)
          visitor.onDetail({ getFileCoverage: () => ({ data }) });
      },
    }),
  };
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    reporter.execute(context as never);
    expect(process.exitCode).toEqual(1);
    expect(out.text()).toContain('coverage summary:');
  } finally {
    process.exitCode = before;
  }
});

test('the reporter leaves the exit code alone when the check passes', () => {
  const directory = makeTempPackage({ 'src/a.ts': 'export const a = 1;\n' });
  const out = captureStdout();
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    const context: MockContext = { getTree: () => ({ visit() {} }) };
    new CoverageCheckReporter({ projectRoot: directory }).execute(
      context as never
    );
    expect(process.exitCode).toBeUndefined();
    expect(out.text()).toContain(`${BOLD_GREEN}coverage summary: 0 uncovered`);
  } finally {
    process.exitCode = before;
  }
});

test('a multi-line span is underlined to the end of its first line', () => {
  const sourceFileText =
    'const a = 1;\n/* @coverage-exclude\n   spanning */\nconst b = 2;\n';
  const text = formatIssue(
    {
      sourceFileText,
      severity: 'error',
      name: 'orphaned-directive',
      message: 'm',
      spanCaption: 'here',
      help: 'h',
      filePath: 'src/a.ts',
      span: { start: 13, end: 45 },
    },
    ''
  );
  expect(text).toContain('src/a.ts:2:1');
  expect(text).toContain('─┬─');
  expect(text).toContain('╰── here');
});

test('formatSummary colors the verdict, hides zero counts, and pluralizes errors', () => {
  const clean: SummaryCounts = {
    uncoveredCounters: 0,
    directiveErrors: 0,
    staleDirectives: 0,
    excludedCounters: 0,
    deferredCounters: 0,
  };
  expect(formatSummary(clean)).toEqual(
    `${BOLD_GREEN}coverage summary: 0 uncovered${RESET}`
  );
  expect(
    formatSummary({ ...clean, deferredCounters: 2, excludedCounters: 1 })
  ).toEqual(
    `${BOLD_GREEN}coverage summary: 0 uncovered${RESET} (2 deferred, 1 excluded)`
  );
  expect(
    formatSummary({
      ...clean,
      uncoveredCounters: 3,
      staleDirectives: 1,
      directiveErrors: 1,
      excludedCounters: 1,
    })
  ).toEqual(
    `${BOLD_RED}coverage summary: 3 uncovered, 1 stale, 1 error${RESET} (1 excluded)`
  );
  expect(formatSummary({ ...clean, directiveErrors: 2 })).toEqual(
    `${BOLD_RED}coverage summary: 0 uncovered, 2 errors${RESET}`
  );
});
