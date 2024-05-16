import { renderToPdf } from '@votingworks/printing';
import { LanguageCode, VotesDict } from '@votingworks/types';
import { Buffer } from 'buffer';

import { assertDefined } from '@votingworks/basics';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
} from '@votingworks/ui';
import { randomBallotId } from '@votingworks/utils';
import { Store } from '../store';

export interface RenderBallotProps {
  store: Store;
  precinctId: string;
  ballotStyleId: string;
  votes: VotesDict;
  languageCode: LanguageCode;
}

export async function renderBallot({
  store,
  precinctId,
  ballotStyleId,
  votes,
  languageCode,
}: RenderBallotProps): Promise<Buffer> {
  const electionDefinition = assertDefined(store.getElectionDefinition());
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
        machineType="markScan"
      />
    </BackendLanguageContextProvider>
  );

  return renderToPdf({
    document: ballot,
  });
}
