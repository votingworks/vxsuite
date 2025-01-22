import { BallotType, Election } from '@votingworks/types';
import {
  BALLOT_MODES,
  BallotPageTemplate,
  BaseBallotProps,
  NhBallotProps,
  nhBallotTemplate,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb';
import { find } from '@votingworks/basics';
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

export function selectTemplateAndCreateBallotProps(
  election: Election,
  precincts: Precinct[],
  ballotStyles: BallotStyle[]
): {
  template: BallotPageTemplate<BaseBallotProps>;
  allBallotProps: BaseBallotProps[];
} {
  const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
  const baseBallotProps: BaseBallotProps[] = election.ballotStyles.flatMap(
    (ballotStyle) =>
      ballotStyle.precincts.flatMap((precinctId) =>
        ballotTypes.flatMap((ballotType) =>
          BALLOT_MODES.map((ballotMode) => ({
            election,
            ballotStyleId: ballotStyle.id,
            precinctId,
            ballotType,
            ballotMode,
          }))
        )
      )
  );

  switch (normalizeState(election.state)) {
    case UsState.NEW_HAMPSHIRE: {
      const nhBallotProps = baseBallotProps.map((props): NhBallotProps => {
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
      // TODO how can we use the type system to ensure that the template and
      // props match?
      return {
        template: nhBallotTemplate,
        allBallotProps: nhBallotProps,
      };
    }

    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return {
        template: vxDefaultBallotTemplate,
        allBallotProps: baseBallotProps,
      };
  }
}
