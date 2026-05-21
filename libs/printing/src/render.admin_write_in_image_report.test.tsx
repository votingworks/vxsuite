import { expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  AdminContestWriteIns,
  AdminWriteInImageReport,
  CandidateGroupWriteIns,
  WriteInEntry,
} from '@votingworks/ui';
import { renderToPdf } from './render';

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

test('qualified write-ins enabled - no votes cast', async () => {
  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById([]),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier:
      'admin-write-in-image-report-qualified-enabled-empty',
    failureThreshold: 0.01,
  });
});

test('qualified write-ins enabled - two qualified candidates and invalid votes', async () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Alice Smith',
      isQualified: true,
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
      ],
    },
    {
      groupLabel: 'Bob Johnson',
      isQualified: true,
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
      ],
    },
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
      ],
    },
  ];

  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById(candidateGroups),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier:
      'admin-write-in-image-report-qualified-enabled-with-votes',
    failureThreshold: 0.01,
  });
});

test('qualified write-ins enabled - only invalid votes cast', async () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [
        { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
        { type: 'text', text: 'Some Name' },
      ],
    },
  ];

  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById(candidateGroups),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier:
      'admin-write-in-image-report-qualified-enabled-only-invalid',
    failureThreshold: 0.01,
  });
});

test('qualified write-ins enabled - unadjudicated votes present', async () => {
  const unadjudicatedWriteIns: WriteInEntry[] = [
    { type: 'image', dataUrl: makePlaceholderImageDataUrl(400, 80) },
    { type: 'text', text: 'Pending Candidate' },
  ];

  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById([], unadjudicatedWriteIns),
    qualifiedWriteInsEnabled: true,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier:
      'admin-write-in-image-report-qualified-enabled-unadjudicated',
    failureThreshold: 0.01,
  });
});

test('qualified write-ins disabled - no votes cast', async () => {
  const report = AdminWriteInImageReport({
    ...DEFAULT_PROPS,
    contestWriteInsById: makeContestWriteInsById([]),
    qualifiedWriteInsEnabled: false,
  });

  const pdf = (await renderToPdf({ document: report })).unsafeUnwrap();

  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier:
      'admin-write-in-image-report-qualified-disabled-empty',
    failureThreshold: 0.01,
  });
});
