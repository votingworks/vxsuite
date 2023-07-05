import { useCallback, useEffect } from 'react';

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

export const printingMessageTimeoutSeconds = 5;

export interface PrintPageProps {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  isLiveMode: boolean;
  votes: VotesDict;
  generateBallotId: () => string;
  onPrintStarted?: () => void;
}

export function PrintPage({
  electionDefinition,
  ballotStyleId,
  precinctId,
  isLiveMode,
  votes,
  generateBallotId,
  onPrintStarted,
}: PrintPageProps): JSX.Element {
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
    onPrintStarted?.();
  }, [
    printLock,
    ballotStyleId,
    electionDefinition,
    generateBallotId,
    isLiveMode,
    precinctId,
    votes,
    onPrintStarted,
  ]);

  useEffect(() => {
    void printBallot();
  }, [printBallot]);

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
