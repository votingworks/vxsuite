import { assert } from '@votingworks/utils';
import React, { useCallback, useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';

import {
  BmdPaperBallot,
  Main,
  printElement,
  ProgressEllipsis,
  Prose,
  Screen,
  useLock,
} from '@votingworks/ui';

import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { BallotContext } from '../contexts/ballot_context';

export const printingMessageTimeoutSeconds = 5;

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`;

export function PrintPage(): JSX.Element {
  const {
    ballotStyleId,
    electionDefinition,
    isCardlessVoter,
    isLiveMode,
    markVoterCardPrinted,
    precinctId,
    resetBallot,
    updateTally,
    votes,
  } = useContext(BallotContext);
  assert(
    electionDefinition,
    'electionDefinition is required to render PrintPage'
  );
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
    if (!printLock.lock()) return;
    const isUsed = await markVoterCardPrinted();
    /* istanbul ignore else */
    if (isUsed) {
      await printElement(
        <BmdPaperBallot
          ballotStyleId={ballotStyleId}
          electionDefinition={electionDefinition}
          isLiveMode={isLiveMode}
          precinctId={precinctId}
          votes={votes}
        />,
        { sides: 'one-sided' }
      );
      updateTally();
      printerTimer.current = window.setTimeout(() => {
        resetBallot(isCardlessVoter ? 'cardless' : 'card');
      }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
    }
  }, [
    printLock,
    markVoterCardPrinted,
    ballotStyleId,
    electionDefinition,
    isLiveMode,
    precinctId,
    votes,
    updateTally,
    resetBallot,
    isCardlessVoter,
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
      <Main centerChild>
        <Prose textCenter id="audiofocus">
          <p>
            <Graphic
              src="/images/printing-ballot.svg"
              alt="Printing Ballot"
              aria-hidden
            />
          </p>
          <h1>
            <ProgressEllipsis aria-label="Printing your official ballot.">
              Printing Official Ballot
            </ProgressEllipsis>
          </h1>
        </Prose>
      </Main>
    </Screen>
  );
}
