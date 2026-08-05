import { expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { screen } from '@testing-library/react';
import { render } from '../../test/react_testing_library.js';
import {
  AdminContestWriteIns,
  AdminWriteInImageReport,
  AdminWriteInImageReportProps,
  CandidateGroupWriteIns,
} from './admin_write_in_image_report.js';
import { WriteInEntry } from './precinct_scanner_write_in_image_report.js';

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

const MAYOR_CONTEST_ID = 'mayor';
const GENERATED_AT = new Date('2024-06-15T10:30:00.000Z');

const BASE_PROPS: Omit<
  AdminWriteInImageReportProps,
  'contestWriteInsById' | 'qualifiedWriteInsEnabled'
> = {
  electionDefinition,
  electionPackageHash: 'test-package-hash',
  isOfficial: false,
  generatedAtTime: GENERATED_AT,
};

function makeContestWriteInsById(
  candidateGroups: CandidateGroupWriteIns[],
  unadjudicatedWriteIns: WriteInEntry[] = []
): Map<string, AdminContestWriteIns> {
  return new Map([
    [MAYOR_CONTEST_ID, { candidateGroups, unadjudicatedWriteIns }],
  ]);
}

test('qualified write-ins enabled - no votes cast', () => {
  render(
    AdminWriteInImageReport({
      ...BASE_PROPS,
      contestWriteInsById: makeContestWriteInsById([]),
      qualifiedWriteInsEnabled: true,
    })
  );

  screen.getByText(
    'No qualified write-in candidates have received votes in this contest.'
  );
});

test('qualified write-ins enabled - two qualified candidates and invalid votes', () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Alice Smith',
      isQualified: true,
      writeIns: [
        { type: 'image', dataUrl: 'data:image/png;base64,img1' },
        { type: 'text', text: 'Alice Smith' },
      ],
    },
    {
      groupLabel: 'Bob Johnson',
      isQualified: true,
      writeIns: [
        { type: 'image', dataUrl: 'data:image/png;base64,img2' },
        { type: 'image', dataUrl: 'data:image/png;base64,img3' },
        { type: 'image', dataUrl: 'data:image/png;base64,img4' },
      ],
    },
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [{ type: 'image', dataUrl: 'data:image/png;base64,img5' }],
    },
  ];

  render(
    AdminWriteInImageReport({
      ...BASE_PROPS,
      contestWriteInsById: makeContestWriteInsById(candidateGroups),
      qualifiedWriteInsEnabled: true,
    })
  );

  screen.getByText('Alice Smith');
  screen.getByText('Summary Ballot Write-In');
  expect(
    screen.queryByText(
      'No qualified write-in candidates have received votes in this contest.'
    )
  ).not.toBeInTheDocument();
});

test('qualified write-ins enabled - only invalid votes cast', () => {
  const candidateGroups: CandidateGroupWriteIns[] = [
    {
      groupLabel: 'Invalid',
      isQualified: false,
      writeIns: [
        { type: 'image', dataUrl: 'data:image/png;base64,img1' },
        { type: 'text', text: 'John Doe' },
      ],
    },
  ];

  render(
    AdminWriteInImageReport({
      ...BASE_PROPS,
      contestWriteInsById: makeContestWriteInsById(candidateGroups),
      qualifiedWriteInsEnabled: true,
    })
  );

  screen.getByText(
    'No qualified write-in candidates have received votes in this contest.'
  );
  screen.getByText('John Doe');
});

test('qualified write-ins enabled - unadjudicated votes present', () => {
  const unadjudicatedWriteIns: WriteInEntry[] = [
    { type: 'image', dataUrl: 'data:image/png;base64,img1' },
    { type: 'text', text: 'Pending Candidate' },
  ];

  render(
    AdminWriteInImageReport({
      ...BASE_PROPS,
      contestWriteInsById: makeContestWriteInsById([], unadjudicatedWriteIns),
      qualifiedWriteInsEnabled: true,
    })
  );

  screen.getByText(/Unadjudicated/);
  expect(
    screen.queryByText(
      'No qualified write-in candidates have received votes in this contest.'
    )
  ).not.toBeInTheDocument();
});

test('qualified write-ins disabled - no votes cast', () => {
  render(
    AdminWriteInImageReport({
      ...BASE_PROPS,
      contestWriteInsById: makeContestWriteInsById([]),
      qualifiedWriteInsEnabled: false,
    })
  );

  screen.getByText(
    'No write-in candidates have received votes in this contest.'
  );
});
