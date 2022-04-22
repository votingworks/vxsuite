import { assert } from '@votingworks/utils';
import React, { useCallback, useContext, useEffect, useRef } from 'react';
import styled from 'styled-components';

import {
  BmdPrintedBallot as PrintedBallot,
  Main,
  MainChild,
  ProgressEllipsis,
} from '@votingworks/ui';

import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
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
    printer,
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

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted();
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print({ sides: 'one-sided' });
      updateTally();
      printerTimer.current = window.setTimeout(() => {
        resetBallot(isCardlessVoter ? 'cardless' : 'card');
      }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
    }
  }, [
    isCardlessVoter,
    markVoterCardPrinted,
    printer,
    resetBallot,
    updateTally,
  ]);

  useEffect(() => {
    const printedBallotSealImage = document
      .getElementById('printedBallotSealContainer')
      ?.getElementsByTagName('img')[0]; // for proper type: HTMLImageElement
    if (!printedBallotSealImage || printedBallotSealImage.complete) {
      void printBallot();
    } else {
      printedBallotSealImage.addEventListener('load', () => {
        void printBallot();
      });
    }
    return () => {
      clearTimeout(printerTimer.current);
    };
  }, [printBallot, votes]);

  return (
    <React.Fragment>
      <Screen white>
        <Main>
          <MainChild centerVertical maxWidth={false}>
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
          </MainChild>
        </Main>
      </Screen>
      <PrintedBallot
        ballotStyleId={ballotStyleId}
        electionDefinition={electionDefinition}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        votes={votes}
      />
    </React.Fragment>
  );
}
