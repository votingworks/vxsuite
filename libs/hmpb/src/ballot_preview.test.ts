import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BallotType,
  type BaseBallotProps,
  hasSplits,
} from '@votingworks/types';
import { expect, test } from 'vitest';
import type { NhBallotProps, NhStateBallotProps } from '@votingworks/hmpb';
import { assert, deepEqual, find, iter } from '@votingworks/basics';
import {
  createBallotPropsForTemplate,
  getBallotPdfFileName,
} from './ballot_preview.js';

const election = readElectionGeneral();

test('createBallotPropsForTemplate', () => {
  const vxDefaultBallotProps = createBallotPropsForTemplate(
    'VxDefaultBallot',
    election,
    false
  ) as BaseBallotProps[];
  for (const props of vxDefaultBallotProps) {
    expect(props.compact).toEqual(false);
  }

  const msBallotProps = createBallotPropsForTemplate(
    'MsBallot',
    election,
    false
  );
  expect(msBallotProps).toEqual(vxDefaultBallotProps);

  const nhBallotProps = createBallotPropsForTemplate(
    'NhBallot',
    election,
    true
  ) as NhBallotProps[];
  assert(election.precincts.some((p) => hasSplits(p)));
  for (const props of nhBallotProps) {
    expect(props.compact).toEqual(true);
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (hasSplits(precinct)) {
      expect('electionTitleOverride' in props).toEqual(true);
      expect('electionSealOverride' in props).toEqual(true);
      expect('clerkSignatureImage' in props).toEqual(true);
      expect('clerkSignatureCaption' in props).toEqual(true);
    }
  }

  const nhStateBallotProps: NhStateBallotProps[] = createBallotPropsForTemplate(
    'NhStateBallot',
    election,
    false
  );
  const [allDerivedProps, allRegularProps] = iter(nhStateBallotProps).partition(
    (props) => props.variant !== undefined
  );
  for (const regularProps of allRegularProps) {
    const matchingFooProps = allDerivedProps.find((derivedProps) =>
      deepEqual(derivedProps, {
        ...regularProps,
        variant: 'federalOfficeOnly',
      })
    );
    const matchingUocavaProps = allDerivedProps.find((derivedProps) =>
      deepEqual(derivedProps, { ...regularProps, variant: 'uocava' })
    );
    if (
      regularProps.ballotMode === 'official' &&
      regularProps.ballotType === BallotType.Absentee
    ) {
      expect(matchingFooProps).toBeDefined();
      expect(matchingUocavaProps).toBeDefined();
    } else {
      expect(matchingFooProps).toBeUndefined();
      expect(matchingUocavaProps).toBeUndefined();
    }
  }
});

const baseProps = {
  election,
  ballotStyle: find(election.ballotStyles, (b) => b.id === '12'),
  precinctId: '23',
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
} as const satisfies BaseBallotProps;

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
