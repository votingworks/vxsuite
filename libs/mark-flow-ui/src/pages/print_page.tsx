import { useCallback, useEffect, useRef } from 'react';

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

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';

export const printingMessageTimeoutSeconds = 5;

export interface PrintPageProps {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  isLiveMode: boolean;
  votes: VotesDict;
  generateBallotId: () => string;
  updateTally: () => void;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
}

export function PrintPage({
  electionDefinition,
  ballotStyleId,
  precinctId,
  isLiveMode,
  votes,
  generateBallotId,
  updateTally,
  resetBallot,
}: PrintPageProps): JSX.Element {
  const printerTimer = useRef(0);
  const printLock = useLock();

  const printBallot = useCallback(async () => {
    /* istanbul ignore if */
    if (!printLock.lock()) return;
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
