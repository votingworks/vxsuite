import { err, ok, Result, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionDefinition,
  ElectionStringKey,
  SYSTEM_LIMITS,
  SystemLimits,
  SystemLimitViolation,
} from '@votingworks/types';
import {
  getContestIdsForBallotStyle,
  mapContestIdsToContests,
} from '@votingworks/utils';

import {
  extractElectionStrings,
  stripImagesFromRichText,
} from '../language_and_audio';

/**
 * Validates an {@link ElectionDefinition} against system limits, returning the first violation if
 * any.
 */
export function validateElectionDefinitionAgainstSystemLimits(
  electionDefinition: ElectionDefinition,
  options?: {
    checkMarkScanSystemLimits?: boolean;
    /** Used for testing */
    systemLimitsOverride?: SystemLimits;
  }
): Result<void, SystemLimitViolation> {
  const { election } = electionDefinition;
  const checkMarkScanSystemLimits = options?.checkMarkScanSystemLimits ?? false;
  const systemLimits = options?.systemLimitsOverride ?? SYSTEM_LIMITS;

  if (election.ballotStyles.length > systemLimits.election.ballotStyles) {
    return err({
      limitScope: 'election',
      limitType: 'ballotStyles',
      valueExceedingLimit: election.ballotStyles.length,
    });
  }
  if (election.contests.length > systemLimits.election.contests) {
    return err({
      limitScope: 'election',
      limitType: 'contests',
      valueExceedingLimit: election.contests.length,
    });
  }
  if (election.precincts.length > systemLimits.election.precincts) {
    return err({
      limitScope: 'election',
      limitType: 'precincts',
      valueExceedingLimit: election.precincts.length,
    });
  }

  let totalCandidates = 0;
  for (const contest of election.contests) {
    switch (contest.type) {
      case 'candidate': {
        if (contest.candidates.length > systemLimits.contest.candidates) {
          return err({
            limitScope: 'contest',
            limitType: 'candidates',
            valueExceedingLimit: contest.candidates.length,
            contestId: contest.id,
          });
        }
        if (contest.seats > systemLimits.contest.seats) {
          return err({
            limitScope: 'contest',
            limitType: 'seats',
            valueExceedingLimit: contest.seats,
            contestId: contest.id,
          });
        }
        totalCandidates += contest.candidates.length;
        break;
      }
      case 'yesno': {
        totalCandidates += 2;
        break;
      }
      /* istanbul ignore next - @preserve */
      default: {
        throwIllegalValue(contest, 'type');
      }
    }
  }
  if (totalCandidates > systemLimits.election.candidates) {
    return err({
      limitScope: 'election',
      limitType: 'candidates',
      valueExceedingLimit: totalCandidates,
    });
  }

  const textFieldsExcludingPropositionDescriptions = extractElectionStrings(
    election,
    { exclude: [ElectionStringKey.CONTEST_DESCRIPTION] }
  );
  for (const textField of textFieldsExcludingPropositionDescriptions) {
    if (textField.stringInEnglish.length > systemLimits.textField.characters) {
      return err({
        limitScope: 'textField',
        limitType: 'characters',
        valueExceedingLimit: textField.stringInEnglish.length,
        fieldValue: textField.stringInEnglish,
      });
    }
  }

  const propositionDescriptions = extractElectionStrings(election, {
    include: [ElectionStringKey.CONTEST_DESCRIPTION],
  });
  for (const propositionDescription of propositionDescriptions) {
    const propositionDescriptionWithoutImages = stripImagesFromRichText(
      propositionDescription.stringInEnglish
    );
    if (
      propositionDescriptionWithoutImages.length >
      systemLimits.propositionDescription.characters
    ) {
      return err({
        limitScope: 'propositionDescription',
        limitType: 'characters',
        valueExceedingLimit: propositionDescriptionWithoutImages.length,
        fieldValue: propositionDescriptionWithoutImages,
      });
    }
  }

  if (checkMarkScanSystemLimits) {
    for (const contest of election.contests) {
      if (
        contest.type === 'candidate' &&
        contest.seats > systemLimits.markScanContest.seats
      ) {
        return err({
          limitScope: 'markScanContest',
          limitType: 'seats',
          valueExceedingLimit: contest.seats,
          contestId: contest.id,
        });
      }
    }
    for (const ballotStyle of election.ballotStyles) {
      const ballotStyleContests = mapContestIdsToContests(
        electionDefinition,
        getContestIdsForBallotStyle(electionDefinition, ballotStyle.id)
      );

      if (
        ballotStyleContests.length > systemLimits.markScanBallotStyle.contests
      ) {
        return err({
          limitScope: 'markScanBallotStyle',
          limitType: 'contests',
          valueExceedingLimit: ballotStyleContests.length,
          ballotStyleId: ballotStyle.id,
        });
      }

      let seatsSummedAcrossContests = 0;
      let candidatesSummedAcrossContests = 0;
      for (const contest of ballotStyleContests) {
        switch (contest.type) {
          case 'candidate': {
            seatsSummedAcrossContests += contest.seats;
            candidatesSummedAcrossContests += contest.candidates.length;
            break;
          }
          case 'yesno': {
            seatsSummedAcrossContests += 1;
            candidatesSummedAcrossContests += 2;
            break;
          }
          /* istanbul ignore next - @preserve */
          default: {
            throwIllegalValue(contest, 'type');
          }
        }
      }
      if (
        seatsSummedAcrossContests >
        systemLimits.markScanBallotStyle.seatsSummedAcrossContests
      ) {
        return err({
          limitScope: 'markScanBallotStyle',
          limitType: 'seatsSummedAcrossContests',
          valueExceedingLimit: seatsSummedAcrossContests,
          ballotStyleId: ballotStyle.id,
        });
      }
      if (
        candidatesSummedAcrossContests >
        systemLimits.markScanBallotStyle.candidatesSummedAcrossContests
      ) {
        return err({
          limitScope: 'markScanBallotStyle',
          limitType: 'candidatesSummedAcrossContests',
          valueExceedingLimit: candidatesSummedAcrossContests,
          ballotStyleId: ballotStyle.id,
        });
      }
    }
  }

  return ok();
}
