import { Printer, renderToPdf } from '@votingworks/printing';
import { VotesDict } from '@votingworks/types';
import { BmdPaperBallot } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { Resource } from 'i18next';
import { useSSR } from 'react-i18next';
import { Store } from './store';

export interface PrintBallotProps {
  printer: Printer;
  store: Store;
  precinctId: string;
  ballotStyleId: string;
  votes: VotesDict;
  generateBallotId?: () => string;
}

export async function printBallot({
  printer,
  store,
  precinctId,
  ballotStyleId,
  votes,
  generateBallotId,
}: PrintBallotProps): Promise<void> {
  const electionDefinition = assertDefined(store.getElectionDefinition());
  const isLiveMode = !store.getTestMode();

  const availableLanguages = store.getUiStringsStore().getLanguages();
  const initialLanguage = 'en';
  const initialI18nStore: Resource = {};
  console.log('let us load the languages');
  for (const language of availableLanguages) {
    console.log('loading language', language);
    initialI18nStore[language] = {
      translation: assertDefined(
        store.getUiStringsStore().getUiStrings(language)
      ),
    };
  }

  function BallotWithTranslation() {
    useSSR(initialI18nStore, initialLanguage);

    return (
      <BmdPaperBallot
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votes={votes}
        isLiveMode={isLiveMode}
        generateBallotId={generateBallotId}
      />
    );
  }

  const pdfData = await renderToPdf(<BallotWithTranslation />);
  await printer.print({ data: pdfData });
}
