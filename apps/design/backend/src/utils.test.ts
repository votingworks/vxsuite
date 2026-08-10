import { readElectionGeneral } from '@votingworks/fixtures';
import { BallotType } from '@votingworks/types';
import { expect, test } from 'vitest';
import { NhStateBallotProps } from '@votingworks/hmpb';
import { getBallotPdfFileName } from './utils.js';

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

test('getBallotPdfFileName appends -foo for federalOfficeOnly variant', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    ballotType: BallotType.Absentee,
    variant: 'federalOfficeOnly',
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-absentee-ballot-Center_Springfield-12-foo.pdf'
  );
});

test('getBallotPdfFileName appends -uocava for uocava variant', () => {
  const props: NhStateBallotProps = {
    ...baseProps,
    ballotType: BallotType.Absentee,
    variant: 'uocava',
  };
  expect(getBallotPdfFileName(props)).toEqual(
    'official-absentee-ballot-Center_Springfield-12-uocava.pdf'
  );
});
