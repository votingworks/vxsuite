import { renderToPdf } from '@votingworks/printing';
import { LanguageCode, UiStringsPackage, VotesDict } from '@votingworks/types';
import { Buffer } from 'buffer';

import { assertDefined } from '@votingworks/basics';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
} from '@votingworks/ui';
import { Store } from '../store';

export interface RenderBallotProps {
  store: Store;
  precinctId: string;
  ballotStyleId: string;
  votes: VotesDict;
  ballotId: string;
  languageCode: LanguageCode;
}

export async function renderBallot({
  store,
  precinctId,
  ballotStyleId,
  ballotId,
  votes,
  languageCode,
}: RenderBallotProps): Promise<Buffer> {
  const electionDefinition = assertDefined(store.getElectionDefinition());
  const isLiveMode = !store.getTestMode();

  const uiStringsPackage: UiStringsPackage = {};
  for (const language of store.getUiStringsStore().getLanguages()) {
    uiStringsPackage[language] =
      store.getUiStringsStore().getUiStrings(language) ?? undefined;
  }

  const ballot = (
    <BackendLanguageContextProvider
      currentLanguageCode={languageCode}
      uiStringsPackage={uiStringsPackage}
    >
      <BmdPaperBallot
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votes={votes}
        isLiveMode={isLiveMode}
        generateBallotId={() => ballotId}
        machineType="markScan"
      />
    </BackendLanguageContextProvider>
  );

  return renderToPdf({
    document: ballot,
  });
}
