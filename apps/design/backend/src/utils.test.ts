import { readElectionGeneral } from '@votingworks/fixtures';
import { BallotType } from '@votingworks/types';
import { expect, test } from 'vitest';
import { NhStateBallotProps } from '@votingworks/hmpb';
import { getBallotPdfFileName } from './utils';

const election = readElectionGeneral();

const baseProps = {
  election,
  ballotStyleId: '12',
  precinctId: '23',
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
} as const;

test('getBallotPdfFileName base case replaces spaces in precinct name', () => {
  expect(getBallotPdfFileName(baseProps)).toEqual(
    'official-precinct-ballot-Center_Springfield-12.pdf'
  );
});

test('getBallotPdfFileName includes ballotAuditId when present', () => {
  expect(getBallotPdfFileName({ ...baseProps, ballotAuditId: '7' })).toEqual(
    'official-precinct-ballot-Center_Springfield-12-7.pdf'
  );
});

test('getBallotPdfFileName appends -foo when isFederalOfficeOnly is true', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    isFederalOfficeOnly: true,
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-precinct-ballot-Center_Springfield-12-foo.pdf'
  );
});

test('getBallotPdfFileName appends -uocava when isUocava is true', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    isUocava: true,
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-precinct-ballot-Center_Springfield-12-uocava.pdf'
  );
});
