import { expect, test } from 'vitest';
import { SYSTEM_LIMITS, SystemLimitViolation } from '@votingworks/types';

import { systemLimitViolationToString } from './system_limits';

test.each<{ violation: SystemLimitViolation; expectedString: string }>([
  {
    violation: {
      limitScope: 'election',
      limitType: 'ballotStyles',
      valueExceedingLimit: SYSTEM_LIMITS.election.ballotStyles + 1,
    },
    expectedString:
      'Number of ballot styles in election (1001) exceeds system limit of 1000.',
  },
  {
    violation: {
      limitScope: 'election',
      limitType: 'candidates',
      valueExceedingLimit: SYSTEM_LIMITS.election.candidates + 1,
    },
    expectedString:
      'Number of candidates in election (1001) exceeds system limit of 1000.',
  },
  {
    violation: {
      limitScope: 'election',
      limitType: 'contests',
      valueExceedingLimit: SYSTEM_LIMITS.election.contests + 1,
    },
    expectedString:
      'Number of contests in election (1001) exceeds system limit of 1000.',
  },
  {
    violation: {
      limitScope: 'election',
      limitType: 'precincts',
      valueExceedingLimit: SYSTEM_LIMITS.election.precincts + 1,
    },
    expectedString:
      'Number of precincts in election (1001) exceeds system limit of 1000.',
  },
  {
    violation: {
      limitScope: 'contest',
      limitType: 'candidates',
      valueExceedingLimit: SYSTEM_LIMITS.contest.candidates + 1,
      contestId: 'contest-1',
    },
    expectedString:
      'Number of candidates in contest contest-1 (101) exceeds system limit of 100.',
  },
  {
    violation: {
      limitScope: 'contest',
      limitType: 'seats',
      valueExceedingLimit: SYSTEM_LIMITS.contest.seats + 1,
      contestId: 'contest-1',
    },
    expectedString:
      'Number of seats in contest contest-1 (51) exceeds system limit of 50.',
  },
  {
    violation: {
      limitScope: 'textField',
      limitType: 'characters',
      valueExceedingLimit: SYSTEM_LIMITS.textField.characters + 1,
      fieldValue: 'A'.repeat(SYSTEM_LIMITS.textField.characters + 1),
    },
    expectedString:
      'Number of characters in text field AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA… (101) exceeds system limit of 100.',
  },
  {
    violation: {
      limitScope: 'propositionDescription',
      limitType: 'characters',
      valueExceedingLimit: SYSTEM_LIMITS.propositionDescription.characters + 1,
      fieldValue: 'A'.repeat(
        SYSTEM_LIMITS.propositionDescription.characters + 1
      ),
    },
    expectedString:
      'Number of characters in proposition description AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA… (10001) exceeds system limit of 10000.',
  },
  {
    violation: {
      limitScope: 'markScanBallotStyle',
      limitType: 'contests',
      valueExceedingLimit: SYSTEM_LIMITS.markScanBallotStyle.contests + 1,
      ballotStyleId: 'ballot-style-1',
    },
    expectedString:
      'Number of contests in ballot style ballot-style-1 (26) exceeds VxMarkScan system limit of 25.',
  },
  {
    violation: {
      limitScope: 'markScanBallotStyle',
      limitType: 'candidatesSummedAcrossContests',
      valueExceedingLimit:
        SYSTEM_LIMITS.markScanBallotStyle.candidatesSummedAcrossContests + 1,
      ballotStyleId: 'ballot-style-1',
    },
    expectedString:
      'Number of candidates summed across contests in ballot style ballot-style-1 (136) exceeds VxMarkScan system limit of 135.',
  },
  {
    violation: {
      limitScope: 'markScanBallotStyle',
      limitType: 'seatsSummedAcrossContests',
      valueExceedingLimit:
        SYSTEM_LIMITS.markScanBallotStyle.seatsSummedAcrossContests + 1,
      ballotStyleId: 'ballot-style-1',
    },
    expectedString:
      'Number of seats summed across contests in ballot style ballot-style-1 (76) exceeds VxMarkScan system limit of 75.',
  },
  {
    violation: {
      limitScope: 'markScanContest',
      limitType: 'seats',
      valueExceedingLimit: SYSTEM_LIMITS.markScanContest.seats + 1,
      contestId: 'contest-1',
    },
    expectedString:
      'Number of seats in contest contest-1 (26) exceeds VxMarkScan system limit of 25.',
  },
  {
    violation: {
      limitScope: 'markContest',
      limitType: 'seats',
      valueExceedingLimit: SYSTEM_LIMITS.markContest.seats + 1,
      contestId: 'contest-1',
    },
    expectedString:
      'Number of seats in contest contest-1 (26) exceeds VxMark system limit of 25.',
  },
])(
  'systemLimitViolationToString - $violation.limitScope $violation.limitType',
  ({ violation, expectedString }) => {
    expect(systemLimitViolationToString(violation)).toEqual(expectedString);
  }
);
