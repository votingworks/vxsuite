import { beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PDF_SNAPSHOTS_DIR,
  buildToMatchPdfSnapshot,
} from './jest_pdf_snapshot.js';
import { normalizePdf } from './normalize_pdf.js';

const MS_BALLOT_PDF_PATH = join(
  import.meta.dirname,
  '../test/fixtures/ms-ballot.pdf'
);
const MS_BALLOT_PAGE_COUNT = 6;

interface FakeMatcherState {
  testPath: string;
  currentTestName: string;
  snapshotState: {
    _counters: Map<string, number>;
    _updateSnapshot: 'all' | 'new' | 'none';
  };
}

const TEST_NAME = 'renders the report';

function buildFakeState(
  testDir: string,
  updateSnapshot: 'all' | 'new' | 'none' = 'new',
  counters = new Map<string, number>()
): FakeMatcherState {
  return {
    testPath: join(testDir, 'report.test.ts'),
    currentTestName: TEST_NAME,
    snapshotState: { _counters: counters, _updateSnapshot: updateSnapshot },
  };
}

const toMatchImageSnapshot = vi.fn();
const fakeExpect = vi.fn(() => ({ toMatchImageSnapshot }));
const toMatchPdfSnapshot = buildToMatchPdfSnapshot(
  fakeExpect as unknown as typeof expect
);

async function runMatcher(
  state: FakeMatcherState,
  pdf: Uint8Array | string,
  options?: Parameters<typeof toMatchPdfSnapshot>[1]
) {
  return toMatchPdfSnapshot.call(
    state as unknown as ThisParameterType<typeof toMatchPdfSnapshot>,
    pdf,
    options
  );
}

let testDir: string;
let pdf: Buffer;
let normalizedPdf: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  testDir = makeTemporaryDirectory();
  pdf = await readFile(MS_BALLOT_PDF_PATH);
  normalizedPdf = normalizePdf(pdf);
});

test('snapshots each page and stores the normalized PDF when no PDF snapshot exists', async () => {
  const state = buildFakeState(testDir);
  const result = await runMatcher(state, pdf);

  expect(result.pass).toEqual(true);
  expect(toMatchImageSnapshot).toHaveBeenCalledTimes(MS_BALLOT_PAGE_COUNT);
  expect(toMatchImageSnapshot).toHaveBeenCalledWith({
    failureThreshold: 0,
    failureThresholdType: 'percent',
    customSnapshotIdentifier: undefined,
  });
  const pdfSnapshotPath = join(
    testDir,
    PDF_SNAPSHOTS_DIR,
    'report-test-ts-renders-the-report-1.pdf'
  );
  expect(await readFile(pdfSnapshotPath)).toEqual(normalizedPdf);
});

test('accepts a path to a PDF', async () => {
  const state = buildFakeState(testDir);
  await runMatcher(state, MS_BALLOT_PDF_PATH);

  expect(toMatchImageSnapshot).toHaveBeenCalledTimes(MS_BALLOT_PAGE_COUNT);
  expect(
    await readFile(
      join(
        testDir,
        PDF_SNAPSHOTS_DIR,
        'report-test-ts-renders-the-report-1.pdf'
      )
    )
  ).toEqual(normalizedPdf);
});

test('passes without rasterizing when the PDF matches the snapshot byte for byte', async () => {
  await runMatcher(buildFakeState(testDir), pdf);
  vi.clearAllMocks();

  const counters = new Map<string, number>();
  const result = await runMatcher(
    buildFakeState(testDir, 'new', counters),
    Uint8Array.from(pdf)
  );

  expect(result.pass).toEqual(true);
  expect(fakeExpect).not.toHaveBeenCalled();
  expect(counters.get(TEST_NAME)).toEqual(MS_BALLOT_PAGE_COUNT);
});

test('numbers later snapshots in the same test as if every page had been snapshotted', async () => {
  const countersWhileSnapshotting = new Map<string, number>();
  await runMatcher(
    buildFakeState(testDir, 'new', countersWhileSnapshotting),
    pdf
  );
  countersWhileSnapshotting.set(TEST_NAME, MS_BALLOT_PAGE_COUNT);
  await runMatcher(
    buildFakeState(testDir, 'new', countersWhileSnapshotting),
    pdf
  );
  expect(
    existsSync(
      join(
        testDir,
        PDF_SNAPSHOTS_DIR,
        `report-test-ts-renders-the-report-${MS_BALLOT_PAGE_COUNT + 1}.pdf`
      )
    )
  ).toEqual(true);
  vi.clearAllMocks();

  const counters = new Map<string, number>();
  await runMatcher(buildFakeState(testDir, 'new', counters), pdf);
  await runMatcher(buildFakeState(testDir, 'new', counters), pdf);
  expect(fakeExpect).not.toHaveBeenCalled();
  expect(counters.get(TEST_NAME)).toEqual(MS_BALLOT_PAGE_COUNT * 2);
});

test('falls back to image snapshots when the bytes differ and keeps the stored PDF', async () => {
  await runMatcher(buildFakeState(testDir), pdf);
  vi.clearAllMocks();

  const modifiedPdf = Buffer.concat([pdf, Buffer.from('\n')]);
  const state = buildFakeState(testDir);
  await runMatcher(state, modifiedPdf);

  expect(toMatchImageSnapshot).toHaveBeenCalledTimes(MS_BALLOT_PAGE_COUNT);
  expect(
    await readFile(
      join(
        testDir,
        PDF_SNAPSHOTS_DIR,
        'report-test-ts-renders-the-report-1.pdf'
      )
    )
  ).toEqual(normalizedPdf);
});

test('does not store the PDF when the image snapshots fail', async () => {
  toMatchImageSnapshot.mockImplementationOnce(() => {
    throw new Error('image mismatch');
  });
  const state = buildFakeState(testDir);
  await expect(runMatcher(state, pdf)).rejects.toThrow('image mismatch');
  expect(existsSync(join(testDir, PDF_SNAPSHOTS_DIR))).toEqual(false);
});

test('never writes PDF snapshots when snapshot updates are disabled', async () => {
  const state = buildFakeState(testDir, 'none');
  await runMatcher(state, pdf);

  expect(toMatchImageSnapshot).toHaveBeenCalledTimes(MS_BALLOT_PAGE_COUNT);
  expect(existsSync(join(testDir, PDF_SNAPSHOTS_DIR))).toEqual(false);
});

test('skips the fast path and rewrites the PDF when updating all snapshots', async () => {
  const pdfSnapshotPath = join(
    testDir,
    PDF_SNAPSHOTS_DIR,
    'report-test-ts-renders-the-report-1.pdf'
  );
  await runMatcher(buildFakeState(testDir), pdf);
  await writeFile(pdfSnapshotPath, Buffer.concat([pdf, Buffer.from('\n')]));
  vi.clearAllMocks();

  const state = buildFakeState(testDir, 'all');
  await runMatcher(state, pdf);

  expect(toMatchImageSnapshot).toHaveBeenCalledTimes(MS_BALLOT_PAGE_COUNT);
  expect(await readFile(pdfSnapshotPath)).toEqual(normalizedPdf);
});

test('names snapshots after a custom identifier', async () => {
  const state = buildFakeState(testDir);
  await runMatcher(state, pdf, {
    customSnapshotIdentifier: 'tally-report',
    failureThreshold: 0.5,
  });

  expect(toMatchImageSnapshot).toHaveBeenNthCalledWith(1, {
    failureThreshold: 0.5,
    failureThresholdType: 'percent',
    customSnapshotIdentifier: 'tally-report-1',
  });
  expect(toMatchImageSnapshot).toHaveBeenNthCalledWith(2, {
    failureThreshold: 0.5,
    failureThresholdType: 'percent',
    customSnapshotIdentifier: 'tally-report-2',
  });
  expect(
    existsSync(join(testDir, PDF_SNAPSHOTS_DIR, 'tally-report.pdf'))
  ).toEqual(true);
});
