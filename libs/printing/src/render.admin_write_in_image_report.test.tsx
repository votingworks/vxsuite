import { expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  AdminContestWriteIns,
  AdminWriteInImageReport,
  CandidateGroupWriteIns,
  WriteInEntry,
} from '@votingworks/ui';
import { renderToPdf } from './render.js';

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

const GENERATED_AT = new Date('2024-06-15T10:30:00.000Z');
const MAYOR_CONTEST_ID = 'mayor';

const DEFAULT_PROPS: Omit<
  Parameters<typeof AdminWriteInImageReport>[0],
  'contestWriteInsById' | 'qualifiedWriteInsEnabled'
> = {
  electionDefinition,
  electionPackageHash: 'test-package-hash',
  isOfficial: false,
  generatedAtTime: GENERATED_AT,
};

function makePlaceholderImageDataUrl(width: number, height: number): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="100%" height="100%" fill="#e0e0e0"/>` +
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="sans-serif" font-size="14" fill="#000000">` +
      `Write-in area ${width}x${height}` +
      `</text></svg>`
  )}`;
}

function makeContestWriteInsById(
  candidateGroups: CandidateGroupWriteIns[],
  unadjudicatedWriteIns: WriteInEntry[] = []
): Map<string, AdminContestWriteIns> {
  return new Map([
    [MAYOR_CONTEST_ID, { candidateGroups, unadjudicatedWriteIns }],
  ]);
}

const IMAGE: WriteInEntry = {
  type: 'image',
  dataUrl: makePlaceholderImageDataUrl(400, 80),
};

test('2 valid candidates, invalid write-in, and unadjudicated write-in', async () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Alice Smith',
      isQualified: true,
      writeIns: [IMAGE],
    },
    {
      groupLabel: 'Bob Johnson',
      isQualified: true,
      writeIns: [IMAGE],
    },
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [IMAGE],
    },
  ];

  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById(candidateGroups, [IMAGE]),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'admin-write-in-image-report-all-types',
    failureThreshold: 0.005,
  });
});

test('no write-in votes - boilerplate message shown', async () => {
  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById([]),
    qualifiedWriteInsEnabled: false,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'admin-write-in-image-report-no-votes',
    failureThreshold: 0.005,
  });
});

test('only invalid votes - boilerplate message shown', async () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [IMAGE],
    },
  ];

  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById(candidateGroups),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'admin-write-in-image-report-only-invalid',
    failureThreshold: 0.005,
  });
});

test('unadjudicated vote present - boilerplate message not shown', async () => {
  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById([], [IMAGE]),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'admin-write-in-image-report-unadjudicated',
    failureThreshold: 0.005,
  });
});
