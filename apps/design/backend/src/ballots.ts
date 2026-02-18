import {
  BaseBallotProps,
  Election,
  hasSplits,
  UiStringsPackage,
  YesNoContest,
} from '@votingworks/types';
import {
  allBaseBallotProps,
  BallotTemplateId,
  NhBallotProps,
} from '@votingworks/hmpb';
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import { Jurisdiction } from './types';

export function defaultBallotTemplate(
  jurisdiction: Jurisdiction
): BallotTemplateId {
  switch (jurisdiction.stateCode) {
    case 'DEMO':
      return 'VxDefaultBallot';
    case 'MI':
      return 'MiBallot';
    case 'MS':
      return 'MsBallot';
    case 'NH':
      return 'NhBallot';
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(jurisdiction.stateCode);
    }
  }
}

export function formatElectionForExport(
  election: Election,
  ballotStrings: UiStringsPackage
): Election {
  const splitPrecincts = election.precincts.filter((p) => hasSplits(p));

  const signatureImageBySplit = splitPrecincts.flatMap((p) =>
    p.splits.flatMap((split) =>
      split.clerkSignatureImage
        ? [[`${p.id}-${split.id}`, sha256(split.clerkSignatureImage)]]
        : []
    )
  );
  const sealOverrideBySplit = splitPrecincts.flatMap((p) =>
    p.splits.flatMap((split) =>
      split.electionSealOverride
        ? [[`${p.id}-${split.id}`, sha256(split.electionSealOverride)]]
        : []
    )
  );

  // If a ballot measure contest has additional options, we transform it into a
  // candidate contest before export, which omits the description field. So we
  // add the description field to additionalHashInput.
  const contestDescriptionsForContestsWithAdditionalOptions =
    Object.fromEntries(
      election.contests
        .filter(
          (contest): contest is YesNoContest =>
            contest.type === 'yesno' &&
            contest.additionalOptions !== undefined &&
            contest.additionalOptions.length > 0
        )
        .map((contest) => [contest.id, contest.description])
    );

  const additionalHashInput = {
    precinctSplitSeals: Object.fromEntries(sealOverrideBySplit),
    precinctSplitSignatureImages: Object.fromEntries(signatureImageBySplit),
    contestDescriptionsForContestsWithAdditionalOptions,
  } as const;

  return {
    ...election,
    ballotStrings,
    additionalHashInput: {
      ...(election.additionalHashInput || {}),
      ...additionalHashInput,
    },
  };
}

export function createBallotPropsForTemplate(
  templateId: BallotTemplateId,
  election: Election,
  compact: boolean
): BaseBallotProps[] {
  function buildNhBallotProps(props: BaseBallotProps): NhBallotProps {
    const precinct = find(election.precincts, (p) => p.id === props.precinctId);
    if (!hasSplits(precinct)) {
      return { ...props };
    }
    const ballotStyle = find(
      election.ballotStyles,
      (bs) => bs.id === props.ballotStyleId
    );
    const split = find(precinct.splits, (ps) =>
      ballotStyleHasPrecinctOrSplit(ballotStyle, { precinct, split: ps })
    );
    return {
      ...props,
      electionTitleOverride: split.electionTitleOverride,
      electionSealOverride: split.electionSealOverride,
      clerkSignatureImage: split.clerkSignatureImage,
      clerkSignatureCaption: split.clerkSignatureCaption,
    };
  }

  assert(election.ballotStyles.length > 0, 'Election has no ballot styles');
  const baseBallotProps = allBaseBallotProps(election).map((props) => ({
    ...props,
    compact,
  }));
  switch (templateId) {
    case 'NhBallot':
      return baseBallotProps.map(buildNhBallotProps);

    case 'MiBallot':
    case 'MsBallot':
    case 'VxDefaultBallot':
      return baseBallotProps;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(templateId);
    }
  }
}
