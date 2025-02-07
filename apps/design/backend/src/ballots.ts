import { Election, UiStringsPackage } from '@votingworks/types';
import {
  allBaseBallotProps,
  BallotTemplateId,
  BaseBallotProps,
  NhBallotProps,
} from '@votingworks/hmpb';
import { find, throwIllegalValue } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import {
  BallotStyle,
  hasSplits,
  normalizeState,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  User,
  UsState,
} from './types';

function getPrecinctSplitForBallotStyle(
  precinct: PrecinctWithSplits,
  ballotStyle: BallotStyle
): PrecinctSplit {
  return find(precinct.splits, (split) =>
    ballotStyle.precinctsOrSplits.some(
      (precinctOrSplit) =>
        precinctOrSplit.precinctId === precinct.id &&
        precinctOrSplit.splitId === split.id
    )
  );
}

export function defaultBallotTemplate(
  state: string,
  user: User
): BallotTemplateId {
  if (user.isSliUser) {
    return 'VxDefaultBallot';
  }

  switch (normalizeState(state)) {
    case UsState.NEW_HAMPSHIRE:
      return 'NhBallot';
    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return 'VxDefaultBallot';
  }
}

export function formatElectionForExport(
  election: Election,
  ballotStrings: UiStringsPackage,
  precincts: Precinct[]
): Election {
  const splitPrecincts = precincts.filter((p) => hasSplits(p));

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

  const additionalHashInput: Record<string, Record<string, string>> = {
    precinctSplitSeals: Object.fromEntries(sealOverrideBySplit),
    precinctSplitSignatureImages: Object.fromEntries(signatureImageBySplit),
  };

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
  precincts: Precinct[],
  ballotStyles: BallotStyle[]
): BaseBallotProps[] {
  function buildNhBallotProps(props: BaseBallotProps): NhBallotProps {
    const precinct = find(precincts, (p) => p.id === props.precinctId);
    if (!hasSplits(precinct)) {
      return props;
    }
    const ballotStyle = find(
      ballotStyles,
      (bs) => bs.id === props.ballotStyleId
    );
    const split = getPrecinctSplitForBallotStyle(precinct, ballotStyle);
    return {
      ...props,
      electionTitleOverride: split.electionTitleOverride,
      electionSealOverride: split.electionSealOverride,
      clerkSignatureImage: split.clerkSignatureImage,
      clerkSignatureCaption: split.clerkSignatureCaption,
    };
  }

  const baseBallotProps = allBaseBallotProps(election);
  switch (templateId) {
    case 'NhBallot':
    case 'NhBallotV3': {
      return baseBallotProps.map(buildNhBallotProps);
    }

    case 'NhBallotCompact':
    case 'NhBallotV3Compact': {
      return baseBallotProps
        .map(buildNhBallotProps)
        .map((p) => ({ ...p, compact: true }));
    }

    case 'VxDefaultBallot':
      return baseBallotProps;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(templateId);
    }
  }
}
