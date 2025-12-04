import { expect, test } from 'vitest';
import { err, ok, Result } from '@votingworks/basics';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import {
  SYSTEM_LIMITS,
  SystemLimits,
  SystemLimitViolation,
} from '@votingworks/types';

import { validateElectionDefinitionAgainstSystemLimits } from './system_limits';

test.each<{
  systemLimits: SystemLimits;
  checkMarkScanSystemLimits?: boolean;
  expectedValidationResult: Result<void, SystemLimitViolation>;
}>([
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      election: {
        ...SYSTEM_LIMITS.election,
        ballotStyles: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'election',
      limitType: 'ballotStyles',
      valueExceedingLimit: expect.any(Number),
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      election: {
        ...SYSTEM_LIMITS.election,
        candidates: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'election',
      limitType: 'candidates',
      valueExceedingLimit: expect.any(Number),
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      election: {
        ...SYSTEM_LIMITS.election,
        contests: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'election',
      limitType: 'contests',
      valueExceedingLimit: expect.any(Number),
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      election: {
        ...SYSTEM_LIMITS.election,
        precincts: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'election',
      limitType: 'precincts',
      valueExceedingLimit: expect.any(Number),
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      contest: {
        ...SYSTEM_LIMITS.contest,
        candidates: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'contest',
      limitType: 'candidates',
      valueExceedingLimit: expect.any(Number),
      contestId: 'president',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      contest: {
        ...SYSTEM_LIMITS.contest,
        seats: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'contest',
      limitType: 'seats',
      valueExceedingLimit: expect.any(Number),
      contestId: 'president',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      textField: {
        ...SYSTEM_LIMITS.textField,
        characters: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'textField',
      limitType: 'characters',
      valueExceedingLimit: expect.any(Number),
      fieldValue: 'English',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      propositionDescription: {
        ...SYSTEM_LIMITS.propositionDescription,
        characters: 0,
      },
    },
    expectedValidationResult: err({
      limitScope: 'propositionDescription',
      limitType: 'characters',
      valueExceedingLimit: expect.any(Number),
      fieldValue:
        'Shall Robert Demergue be retained as Chief Justice of the Hamilton Court of Appeals?',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        candidatesSummedAcrossContests: 0,
      },
    },
    expectedValidationResult: ok(),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        candidatesSummedAcrossContests: 0,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanBallotStyle',
      limitType: 'candidatesSummedAcrossContests',
      valueExceedingLimit: expect.any(Number),
      ballotStyleId: '12',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        seatsSummedAcrossContests: 0,
      },
    },
    expectedValidationResult: ok(),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        seatsSummedAcrossContests: 0,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanBallotStyle',
      limitType: 'seatsSummedAcrossContests',
      valueExceedingLimit: expect.any(Number),
      ballotStyleId: '12',
    }),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanContest: {
        ...SYSTEM_LIMITS.markScanContest,
        seats: 0,
      },
    },
    expectedValidationResult: ok(),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanContest: {
        ...SYSTEM_LIMITS.markScanContest,
        seats: 0,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanContest',
      limitType: 'seats',
      valueExceedingLimit: expect.any(Number),
      contestId: 'president',
    }),
  },
  {
    systemLimits: SYSTEM_LIMITS,
    checkMarkScanSystemLimits: true,
    expectedValidationResult: ok(),
  },
])(
  'validateElectionDefinitionAgainstSystemLimits',
  ({ systemLimits, checkMarkScanSystemLimits, expectedValidationResult }) => {
    const result = validateElectionDefinitionAgainstSystemLimits(
      electionGeneralFixtures.readElectionDefinition(),
      { checkMarkScanSystemLimits, systemLimitsOverride: systemLimits }
    );
    expect(result).toEqual(expectedValidationResult);
  }
);
