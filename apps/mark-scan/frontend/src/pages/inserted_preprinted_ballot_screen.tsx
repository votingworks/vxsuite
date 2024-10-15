import React from 'react';

import { Button, Icons, P } from '@votingworks/ui';
import { BallotStyleId, PrecinctId, VotesDict } from '@votingworks/types';
import { assert } from '@votingworks/basics';

import * as api from '../api';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export interface InsertedPreprintedBallotScreenProps {
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  setVotes: (votes: VotesDict) => void;
}

export function InsertedPreprintedBallotScreen(
  props: InsertedPreprintedBallotScreenProps
): React.ReactNode {
  const { activateCardlessVoterSession, setVotes } = props;

  const startSessionWithPreprintedBallot =
    api.startSessionWithPreprintedBallot.useMutation().mutate;

  const returnPreprintedBallot =
    api.returnPreprintedBallot.useMutation().mutate;

  const interpretationQuery = api.getInterpretation.useQuery();
  const interpretation = interpretationQuery.data;

  const onPressReview = React.useCallback(() => {
    assert(interpretation);
    assert(interpretation.type === 'InterpretedBmdPage');

    const { ballotStyleId, precinctId } = interpretation.metadata;

    activateCardlessVoterSession(precinctId, ballotStyleId);
    startSessionWithPreprintedBallot();
    setVotes(interpretation.votes);
  }, [
    activateCardlessVoterSession,
    startSessionWithPreprintedBallot,
    interpretation,
    setVotes,
  ]);

  if (!interpretationQuery.isSuccess) {
    return null;
  }

  return (
    <CenteredCardPageLayout
      buttons={
        <React.Fragment>
          <Button onPress={returnPreprintedBallot}>Return Ballot</Button>
          <Button onPress={onPressReview} variant="primary">
            Review Ballot
          </Button>
        </React.Fragment>
      }
      icon={<Icons.Info />}
      title="Ballot Detected"
      voterFacing={false}
    >
      <P>The inserted sheet is a printed ballot.</P>
      <P>
        The voter can review and cast their ballot or you can insert a new
        sheet.
      </P>
    </CenteredCardPageLayout>
  );
}
