/* istanbul ignore file - @preserve - currently tested via apps. */

import { H4 } from '@votingworks/ui';
import {
  Election,
  getAllPrecinctsAndSplits,
  PrecinctSelection,
} from '@votingworks/types';
import { BallotStyleSelect, OnBallotStyleSelect } from './ballot_style_select';
import { VotingSession } from './elements';

export interface SectionSessionStartProps {
  election: Election;
  onChooseBallotStyle: OnBallotStyleSelect;
  precinctSelection: PrecinctSelection;
}

function getConfiguredPrecinctsAndSplits(
  election: Election,
  selection: PrecinctSelection
) {
  const all = getAllPrecinctsAndSplits(election);
  if (selection.kind === 'AllPrecincts') return all;

  return all.filter(({ precinct }) => selection.precinctId === precinct.id);
}

export function SectionSessionStart(
  props: SectionSessionStartProps
): JSX.Element {
  const { election, onChooseBallotStyle, precinctSelection } = props;

  return (
    <VotingSession>
      <H4 as="h2">Start a New Voting Session</H4>
      <BallotStyleSelect
        election={election}
        configuredPrecinctsAndSplits={getConfiguredPrecinctsAndSplits(
          election,
          precinctSelection
        )}
        onSelect={onChooseBallotStyle}
      />
    </VotingSession>
  );
}
