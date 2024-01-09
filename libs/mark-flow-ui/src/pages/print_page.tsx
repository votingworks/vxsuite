import { useCallback, useEffect } from 'react';

import {
  BmdPaperBallot,
  H1,
  Main,
  printElement as DefaultPrintElement,
  Screen,
  useLock,
  PrintingBallotImage,
  appStrings,
  Font,
  ReadOnLoad,
} from '@votingworks/ui';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PrintOptions,
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
  printElement?: (
    element: JSX.Element,
    printOptions: PrintOptions
  ) => Promise<void>;
  largeTopMargin?: boolean;
}

export function PrintPage({
  electionDefinition,
  ballotStyleId,
  precinctId,
  isLiveMode,
  votes,
  generateBallotId,
  onPrintStarted,
  printElement = DefaultPrintElement,
  largeTopMargin,
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
        largeTopMargin={largeTopMargin}
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
    printElement,
    largeTopMargin,
  ]);

  useEffect(() => {
    void printBallot();
  }, [printBallot]);

  return (
    <Screen>
      <Main centerChild padded>
        <Font align="center">
          <PrintingBallotImage />
          <ReadOnLoad>
            <H1>{appStrings.titleBmdPrintScreen()}</H1>
          </ReadOnLoad>
        </Font>
      </Main>
    </Screen>
  );
}
