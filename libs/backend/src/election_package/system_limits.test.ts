import { expect, test } from 'vitest';
import { err, ok, Result } from '@votingworks/basics';
import {
  electionGeneralFixtures,
  readElectionStraightPartyDefinition,
} from '@votingworks/fixtures';
import {
  ElectionDefinition,
  SYSTEM_LIMITS,
  SystemLimits,
  SystemLimitViolation,
} from '@votingworks/types';

import { validateElectionDefinitionAgainstSystemLimits } from './system_limits';

const straightPartyElectionDefinition = readElectionStraightPartyDefinition();

test.each<{
  electionDefinition?: ElectionDefinition;
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
  {
    electionDefinition: straightPartyElectionDefinition,
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
      contestId: 'straight-party-ticket',
    }),
  },
  // The straight-party contest counts its parties toward the election-wide
  // candidate limit (85 non-straight-party candidates + 9 parties = 94).
  {
    electionDefinition: straightPartyElectionDefinition,
    systemLimits: {
      ...SYSTEM_LIMITS,
      election: { ...SYSTEM_LIMITS.election, candidates: 85 },
    },
    expectedValidationResult: err({
      limitScope: 'election',
      limitType: 'candidates',
      valueExceedingLimit: 94,
    }),
  },
  // The straight-party contest counts 1 seat toward the mark-scan ballot-style
  // seat limit (ballot style 12: 25 other seats + 1 = 26).
  {
    electionDefinition: straightPartyElectionDefinition,
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        seatsSummedAcrossContests: 25,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanBallotStyle',
      limitType: 'seatsSummedAcrossContests',
      valueExceedingLimit: 26,
      ballotStyleId: '12',
    }),
  },
  // The straight-party contest counts its parties toward the mark-scan
  // ballot-style candidate limit (ballot style 12: 85 other candidates + 9 = 94).
  {
    electionDefinition: straightPartyElectionDefinition,
    systemLimits: {
      ...SYSTEM_LIMITS,
      markScanBallotStyle: {
        ...SYSTEM_LIMITS.markScanBallotStyle,
        candidatesSummedAcrossContests: 85,
      },
    },
    checkMarkScanSystemLimits: true,
    expectedValidationResult: err({
      limitScope: 'markScanBallotStyle',
      limitType: 'candidatesSummedAcrossContests',
      valueExceedingLimit: 94,
      ballotStyleId: '12',
    }),
  },
])(
  'validateElectionDefinitionAgainstSystemLimits',
  ({
    electionDefinition = electionGeneralFixtures.readElectionDefinition(),
    systemLimits,
    checkMarkScanSystemLimits,
    checkMarkSystemLimits,
    expectedValidationResult,
  }) => {
    const result = validateElectionDefinitionAgainstSystemLimits(
      electionDefinition,
      {
        checkMarkScanSystemLimits,
        checkMarkSystemLimits,
        systemLimitsOverride: systemLimits,
      }
    );
    expect(result).toEqual(expectedValidationResult);
  }
);
