import { assert } from '@votingworks/basics';
import React, { useCallback, useContext, useEffect, useRef } from 'react';

import {
  BmdPaperBallot,
  H1,
  Main,
  printElement,
  Prose,
  Screen,
  useLock,
  PrintingBallotImage,
} from '@votingworks/ui';

import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { BallotContext } from '../contexts/ballot_context';
import { getElectionDefinition } from '../api';

export const printingMessageTimeoutSeconds = 5;

export function PrintPage(): JSX.Element {
  const {
    ballotStyleId,
    generateBallotId,
    isLiveMode,
    precinctId,
    resetBallot,
    updateTally,
    votes,
  } = useContext(BallotContext);
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const electionDefinition = getElectionDefinitionQuery.data ?? undefined;
  assert(
    typeof ballotStyleId === 'string',
    'ballotStyleId is required to render PrintPage'
  );
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render PrintPage'
  );
  const printerTimer = useRef(0);
  const printLock = useLock();

  const printBallot = useCallback(async () => {
    /* istanbul ignore if */
    if (!electionDefinition || !printLock.lock()) return;
    await printElement(
      <BmdPaperBallot
        ballotStyleId={ballotStyleId}
        electionDefinition={electionDefinition}
        generateBallotId={generateBallotId}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        votes={votes}
      />,
      { sides: 'one-sided' }
    );
    updateTally();
    printerTimer.current = window.setTimeout(() => {
      resetBallot(true);
    }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  }, [
    printLock,
    ballotStyleId,
    electionDefinition,
    generateBallotId,
    isLiveMode,
    precinctId,
    votes,
    updateTally,
    resetBallot,
  ]);

  useEffect(() => {
    void printBallot();
  }, [printBallot]);

  // Make sure we clean up any pending timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(printerTimer.current);
    };
  }, []);

  return (
    <Screen white>
      <Main centerChild padded>
        <Prose textCenter id="audiofocus">
          <PrintingBallotImage />
          <div>
            <H1>Printing Your Official Ballot...</H1>
          </div>
        </Prose>
      </Main>
    </Screen>
  );
}
