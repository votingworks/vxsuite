import { useContext } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import { ReviewPage } from '@votingworks/mark-flow-ui';
import { isOpenPrimary } from '@votingworks/types';
import { P } from '@votingworks/ui';

import { BallotContext } from '../contexts/ballot_context';

export function ReviewScreen(): JSX.Element {
  const history = useHistory();
  const location = useLocation();
  const {
    contests,
    electionDefinition,
    precinctId,
    ballotStyleId,
    selectedPartyId,
    votes,
  } = useContext(BallotContext);

  const searchParams = new URLSearchParams(location.search);
  const fromContest = searchParams.get('fromContest');
  const isFinalReview = !fromContest;
  const backUrl = !isFinalReview ? `/contests/${fromContest}` : undefined;

  const election = electionDefinition?.election;
  const selectedPartyName =
    election &&
    isOpenPrimary(election) &&
    selectedPartyId &&
    election.parties.find((p) => p.id === selectedPartyId)?.fullName;

  return (
    <ReviewPage
      backUrl={backUrl}
      ballotStyleId={ballotStyleId}
      contests={contests}
      electionDefinition={electionDefinition}
      headerContent={
        selectedPartyName ? (
          <P>
            <strong>Party:</strong> {selectedPartyName}
          </P>
        ) : undefined
      }
      precinctId={precinctId}
      printScreenUrl="/print"
      returnToContest={(contestId) => {
        const contestIndex = contests.findIndex(({ id }) => id === contestId);
        history.push(
          isFinalReview
            ? `/contests/${contestIndex}#review`
            : `/contests/${contestIndex}`
        );
      }}
      votes={votes}
    />
  );
}
