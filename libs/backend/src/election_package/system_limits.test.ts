import { expect, test } from 'vitest';
import { err, ok, Result } from '@votingworks/basics';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  SYSTEM_LIMITS,
  SystemLimits,
  SystemLimitViolation,
  StraightPartyContest,
} from '@votingworks/types';

import { validateElectionDefinitionAgainstSystemLimits } from './system_limits';

test.each<{
  systemLimits: SystemLimits;
  checkMarkScanSystemLimits?: boolean;
  checkMarkSystemLimits?: boolean;
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
        contests: 0,
      },
    },
    expectedValidationResult: ok(),
  },
  {
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        contests: 0,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanBallotStyle',
      limitType: 'contests',
      valueExceedingLimit: expect.any(Number),
      ballotStyleId: '12',
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
    systemLimits: {
      ...SYSTEM_LIMITS,
      markContest: {
        ...SYSTEM_LIMITS.markContest,
        seats: 0,
      },
    },
    checkMarkSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markContest',
      limitType: 'seats',
      valueExceedingLimit: expect.any(Number),
      contestId: 'president',
    }),
  },
  {
    systemLimits: SYSTEM_LIMITS,
    checkMarkScanSystemLimits: true,
    checkMarkSystemLimits: true,
    expectedValidationResult: ok(),
  },
])(
  'validateElectionDefinitionAgainstSystemLimits',
  ({
    systemLimits,
    checkMarkScanSystemLimits,
    checkMarkSystemLimits,
    expectedValidationResult,
  }) => {
    const result = validateElectionDefinitionAgainstSystemLimits(
      electionGeneralFixtures.readElectionDefinition(),
      {
        checkMarkScanSystemLimits,
        checkMarkSystemLimits,
        systemLimitsOverride: systemLimits,
      }
    );
    expect(result).toEqual(expectedValidationResult);
  }
);

test('counts straight-party contests against candidate and seat limits', () => {
  const baseDefinition = electionGeneralFixtures.readElectionDefinition();
  const spContest: StraightPartyContest = {
    id: 'sp-1',
    type: 'straight-party',
    title: 'Straight Party Ticket',
  };
  const definitionWithSp: ElectionDefinition = {
    ...baseDefinition,
    election: {
      ...baseDefinition.election,
      contests: [...baseDefinition.election.contests, spContest],
    },
  };

  // SP contributes election.parties.length candidates to the totalCandidates
  // tally. Set the limit just below that to force a violation.
  const tooFewCandidates =
    baseDefinition.election.contests.reduce((sum, c) => {
      if (c.type === 'candidate') return sum + c.candidates.length;
      if (c.type === 'yesno') return sum + 2;
      return sum;
    }, 0) +
    baseDefinition.election.parties.length -
    1;
  const result = validateElectionDefinitionAgainstSystemLimits(
    definitionWithSp,
    {
      systemLimitsOverride: {
        ...SYSTEM_LIMITS,
        election: {
          ...SYSTEM_LIMITS.election,
          candidates: tooFewCandidates,
        },
      },
    }
  );
  expect(result).toEqual(
    err({
      limitScope: 'election',
      limitType: 'candidates',
      valueExceedingLimit: expect.any(Number),
    })
  );
});

test('counts straight-party seats against mark-scan ballot style limits', () => {
  // SP contests are automatically included on every ballot style via
  // getContests(), so adding the contest to election.contests is enough to
  // make the mark-scan per-ballot-style aggregator visit the SP arm. We use
  // a unique ballotHash so the per-election contest-ID lookup cache doesn't
  // return a stale set without the SP contest.
  const baseDefinition = electionGeneralFixtures.readElectionDefinition();
  const spContest: StraightPartyContest = {
    id: 'sp-1',
    type: 'straight-party',
    title: 'Straight Party Ticket',
  };
  const definitionWithSp: ElectionDefinition = {
    ...baseDefinition,
    ballotHash: 'unique-hash-for-sp-test',
    election: {
      ...baseDefinition.election,
      contests: [...baseDefinition.election.contests, spContest],
    },
  };

  // Validation with defaults — succeeds, but the per-ballot-style aggregator
  // walks the SP case during the sum.
  const result = validateElectionDefinitionAgainstSystemLimits(
    definitionWithSp,
    { checkMarkScanSystemLimits: true }
  );
  expect(result).toEqual(ok());
});
