import React from 'react';

import {
  BmdPaperBallot,
  H1,
  Main,
  Screen,
  PrintingBallotImage,
  appStrings,
  Font,
  ReadOnLoad,
  MachineType,
  PrintToPdf,
  PrintElement,
} from '@votingworks/ui';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';

export const printingMessageTimeoutSeconds = 5;

export type PrintPageProps = {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  isLiveMode: boolean;
  votes: VotesDict;
  generateBallotId: () => string;
  machineType: MachineType;
} & (
  | {
      printToPdf: true;
      onPrint: (pdfData: Uint8Array) => void;
    }
  | {
      printToPdf?: false;
      onPrint: () => void;
    }
);

export function PrintPage({
  electionDefinition,
  ballotStyleId,
  precinctId,
  isLiveMode,
  votes,
  generateBallotId,
  onPrint,
  printToPdf,
  machineType,
}: PrintPageProps): JSX.Element {
  const paperBallotContents = (
    <BmdPaperBallot
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      generateBallotId={generateBallotId}
      isLiveMode={isLiveMode}
      precinctId={precinctId}
      votes={votes}
      machineType={machineType}
    />
  );

  return (
    <React.Fragment>
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
      {printToPdf ? (
        <PrintToPdf onDataReady={onPrint}>{paperBallotContents}</PrintToPdf>
      ) : (
        <PrintElement
          onPrintStarted={onPrint}
          printOptions={{ sides: 'one-sided' }}
        >
          {paperBallotContents}
        </PrintElement>
      )}
    </React.Fragment>
  );
}
