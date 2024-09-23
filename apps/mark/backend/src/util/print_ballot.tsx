import { renderToPdf, PrintSides, Printer } from '@votingworks/printing';
import { LanguageCode, SimpleRenderer, VotesDict } from '@votingworks/types';

import { assertDefined } from '@votingworks/basics';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
} from '@votingworks/ui';
import { randomBallotId } from '@votingworks/utils';
import { Store } from '../store';

export interface PrintBallotProps {
  printer: Printer;
  store: Store;
  precinctId: string;
  ballotStyleId: string;
  votes: VotesDict;
  languageCode: LanguageCode;
  renderer: SimpleRenderer;
}

export async function printBallot({
  printer,
  store,
  precinctId,
  ballotStyleId,
  votes,
  languageCode,
  renderer,
}: PrintBallotProps): Promise<void> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const isLiveMode = !store.getTestMode();

  const ballot = (
    <BackendLanguageContextProvider
      currentLanguageCode={languageCode}
      uiStringsPackage={store.getUiStringsStore().getAllUiStrings()}
    >
      <BmdPaperBallot
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votes={votes}
        isLiveMode={isLiveMode}
        generateBallotId={randomBallotId}
        machineType="mark"
      />
    </BackendLanguageContextProvider>
  );

  return printer.print({
    data: (await renderToPdf({ document: ballot }, renderer)).unsafeUnwrap(),
    sides: PrintSides.OneSided,
  });
}
