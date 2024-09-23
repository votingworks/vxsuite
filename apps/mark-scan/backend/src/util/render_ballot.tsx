import {
  PAPER_DIMENSIONS,
  PaperDimensions,
  renderToPdf,
} from '@votingworks/printing';
import {
  ElectionDefinition,
  LanguageCode,
  SimpleRenderer,
  VotesDict,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';

import { assertDefined } from '@votingworks/basics';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
  BmdBallotSheetSize,
} from '@votingworks/ui';
import { randomBallotId } from '@votingworks/utils';
import { Store } from '../store';
import { getMarkScanBmdModel } from './hardware';

export interface RenderBallotProps {
  store: Store;
  renderer: SimpleRenderer;
  precinctId: string;
  ballotStyleId: string;
  votes: VotesDict;
  languageCode: LanguageCode;
}

function getPaperDimensions(): PaperDimensions {
  /* istanbul ignore next - hardware support in flux */
  return getMarkScanBmdModel() === 'bmd-150'
    ? PAPER_DIMENSIONS['Bmd150']
    : PAPER_DIMENSIONS['Letter'];
}

function getSheetSize(): BmdBallotSheetSize {
  /* istanbul ignore next - hardware support in flux */
  return getMarkScanBmdModel() === 'bmd-150' ? 'bmd150' : 'letter';
}

export async function renderTestModeBallotWithoutLanguageContext(
  renderer: SimpleRenderer,
  electionDefinition: ElectionDefinition,
  precinctId: string,
  ballotStyleId: string,
  votes: VotesDict
): Promise<Buffer> {
  const ballot = (
    <BmdPaperBallot
      binarize
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={false}
      generateBallotId={randomBallotId}
      machineType="markScan"
      sheetSize={getSheetSize()}
    />
  );

  return (
    await renderToPdf(
      {
        document: ballot,
        paperDimensions: getPaperDimensions(),
      },
      renderer
    )
  ).unsafeUnwrap();
}

export async function renderBallot({
  store,
  renderer,
  precinctId,
  ballotStyleId,
  votes,
  languageCode,
}: RenderBallotProps): Promise<Buffer> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const isLiveMode = !store.getTestMode();

  const ballot = (
    <BackendLanguageContextProvider
      currentLanguageCode={languageCode}
      uiStringsPackage={store.getUiStringsStore().getAllUiStrings()}
    >
      <BmdPaperBallot
        binarize
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votes={votes}
        isLiveMode={isLiveMode}
        generateBallotId={randomBallotId}
        machineType="markScan"
        sheetSize={getSheetSize()}
      />
    </BackendLanguageContextProvider>
  );

  return (
    await renderToPdf(
      {
        document: ballot,
        paperDimensions: getPaperDimensions(),
      },
      renderer
    )
  ).unsafeUnwrap();
}
