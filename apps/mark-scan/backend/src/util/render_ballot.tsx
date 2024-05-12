import { renderToPdf } from '@votingworks/printing';
import { LanguageCode, VotesDict } from '@votingworks/types';
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

  const uiStringTranslations =
    store.getUiStringsStore().getUiStrings(languageCode) ?? undefined;

  const ballot = (
    <BackendLanguageContextProvider
      languageCode={languageCode}
      uiStringTranslations={uiStringTranslations}
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
