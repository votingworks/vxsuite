import { Election } from '@votingworks/types';
import {
  allBaseBallotProps,
  BallotTemplateId,
  BaseBallotProps,
  NhBallotProps,
} from '@votingworks/hmpb';
import { find, throwIllegalValue } from '@votingworks/basics';
import {
  BallotStyle,
  hasSplits,
  normalizeState,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
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

export function defaultBallotTemplate(state: string): BallotTemplateId {
  switch (normalizeState(state)) {
    case UsState.NEW_HAMPSHIRE:
      return 'NhBallot';
    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return 'VxDefaultBallot';
  }
}

export function createBallotPropsForTemplate(
  templateId: BallotTemplateId,
  election: Election,
  precincts: Precinct[],
  ballotStyles: BallotStyle[]
): BaseBallotProps[] {
  const baseBallotProps = allBaseBallotProps(election);
  switch (templateId) {
    case 'NhBallot':
    case 'NhBallotV3': {
      return baseBallotProps.map((props): NhBallotProps => {
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
          clerkSignatureImage: split.clerkSignatureImage,
          clerkSignatureCaption: split.clerkSignatureCaption,
        };
      });
    }

    case 'VxDefaultBallot':
      return baseBallotProps;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(templateId);
    }
  }
}
