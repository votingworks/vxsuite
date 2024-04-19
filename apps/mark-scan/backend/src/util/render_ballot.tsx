import { renderToPdf } from '@votingworks/printing';
import { LanguageCode, VotesDict } from '@votingworks/types';
import type { Resource } from 'i18next';
import { Buffer } from 'buffer';

import { assertDefined } from '@votingworks/basics';
import { BackendBmdPaperBallot } from '@votingworks/ui';
import i18next from 'i18next';
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

  const availableLanguages = store.getUiStringsStore().getLanguages();
  const initialI18nStore: Resource = {};
  console.log(availableLanguages);
  for (const language of availableLanguages) {
    initialI18nStore[language] = {
      translation: assertDefined(
        store.getUiStringsStore().getUiStrings(language)
      ),
    };
  }

  const ballot = (
    <BackendBmdPaperBallot
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={isLiveMode}
      generateBallotId={() => ballotId}
      machineType="markScan"
      initialI18nStore={initialI18nStore}
      languageCode={languageCode}
    />
  );

  return renderToPdf({
    document: ballot,
    outputPath: './test.pdf',
  });
}
