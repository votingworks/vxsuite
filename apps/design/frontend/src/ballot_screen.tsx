import { useParams } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import { getPrecinctById, getBallotStyle } from '@votingworks/types';
import { Screen } from '@votingworks/ui';
import { getElection } from './api';
import { BallotViewer } from './ballot_viewer';

export function BallotScreen(): JSX.Element | null {
  const { electionId, ballotStyleId, precinctId } = useParams<{
    electionId: string;
    ballotStyleId: string;
    precinctId: string;
  }>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null; // Initial loading state
  }

  const { election, layoutOptions, nhCustomContent } = getElectionQuery.data;
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );

  return (
    <Screen>
      <BallotViewer
        election={election}
        precinct={precinct}
        ballotStyle={ballotStyle}
        layoutOptions={layoutOptions}
        nhCustomContent={nhCustomContent[ballotStyle.id] ?? {}}
      />
    </Screen>
  );
}
