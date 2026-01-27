/**
 * See https://docs.voting.works/vxsuite-tdp-v4/system-performance-and-specifications/system-limits
 */
export const SYSTEM_LIMITS = {
  election: {
    ballotStyles: 1000,
    candidates: 1000,
    contests: 1000,
    precincts: 1000,
  },
  contest: {
    candidates: 100,
    seats: 50,
  },
  textField: {
    characters: 100,
  },
  propositionDescription: {
    characters: 10000,
  },
  markScanBallotStyle: {
    contests: 25,
    candidatesSummedAcrossContests: 135,
    seatsSummedAcrossContests: 75,
  },
  markScanContest: {
    seats: 25,
  },
  /**
   * VxMark-specific limits for multi-page summary ballots.
   * VxMark supports dynamic page splitting, so it doesn't have
   * ballot-style-level limits (contests, candidatesSummedAcrossContests,
   * seatsSummedAcrossContests), but still has per-contest limits.
   */
  markContest: {
    seats: 25,
  },
} as const;

export type SystemLimits = {
  [S in keyof typeof SYSTEM_LIMITS]: {
    [T in keyof (typeof SYSTEM_LIMITS)[S]]: number;
  };
};

type SystemLimitScope = keyof SystemLimits;
type SystemLimitType<S extends SystemLimitScope> = keyof SystemLimits[S];

interface SystemLimitViolationBase<S extends SystemLimitScope> {
  limitScope: S;
  limitType: SystemLimitType<S>;
  valueExceedingLimit: number;
}

type ElectionSystemLimitViolation = SystemLimitViolationBase<'election'>;
type ContestSystemLimitViolation = SystemLimitViolationBase<'contest'> & {
  contestId: string;
};
type TextFieldSystemLimitViolation = SystemLimitViolationBase<'textField'> & {
  fieldValue: string;
};
type PropositionDescriptionFieldSystemLimitViolation =
  SystemLimitViolationBase<'propositionDescription'> & {
    fieldValue: string;
  };
type MarkScanBallotStyleSystemLimitViolation =
  SystemLimitViolationBase<'markScanBallotStyle'> & {
    ballotStyleId: string;
  };
type MarkScanContestSystemLimitViolation =
  SystemLimitViolationBase<'markScanContest'> & {
    contestId: string;
  };
type MarkContestSystemLimitViolation =
  SystemLimitViolationBase<'markContest'> & {
    contestId: string;
  };

export type SystemLimitViolation =
  | ElectionSystemLimitViolation
  | ContestSystemLimitViolation
  | TextFieldSystemLimitViolation
  | PropositionDescriptionFieldSystemLimitViolation
  | MarkScanBallotStyleSystemLimitViolation
  | MarkScanContestSystemLimitViolation
  | MarkContestSystemLimitViolation;
