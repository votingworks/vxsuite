import {
  PAPER_DIMENSIONS,
  PaperDimensions,
  renderToPdf,
} from '@votingworks/printing';
import {
  BallotStyleId,
  ElectionDefinition,
  VotesDict,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';

import { assert, assertDefined, iter } from '@votingworks/basics';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
  BmdBallotSheetSize,
  getLayout,
  MachineType,
} from '@votingworks/ui';
import { randomBallotId } from '@votingworks/utils';
import { pdfToImages } from '@votingworks/image-utils';
import { Store } from '../store';
import { getMarkScanBmdModel } from './hardware';
import { PRINT_DPI, SCAN_DPI } from '../custom-paper-handler/constants';

export interface RenderBallotProps {
  store: Store;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
  languageCode: string;
}

const MACHINE_TYPE: MachineType = 'markScan';

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
  electionDefinition: ElectionDefinition,
  precinctId: string,
  ballotStyleId: BallotStyleId,
  votes: VotesDict
): Promise<Buffer> {
  const layout = getLayout(
    MACHINE_TYPE,
    ballotStyleId,
    electionDefinition
  ).unsafeUnwrap();

  const ballot = (
    <BmdPaperBallot
      binarize
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={false}
      generateBallotId={randomBallotId}
      sheetSize={getSheetSize()}
      layout={layout}
      machineType={MACHINE_TYPE}
    />
  );

  return (
    await renderToPdf({
      document: ballot,
      paperDimensions: getPaperDimensions(),
    })
  ).unsafeUnwrap();
}

export async function renderBallot({
  store,
  precinctId,
  ballotStyleId,
  votes,
  languageCode,
}: RenderBallotProps): Promise<Buffer> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const isLiveMode = !store.getTestMode();

  const maxRenderRetry = 2;

  for (let i = 0; i < maxRenderRetry; i += 1) {
    const layout = getLayout(
      MACHINE_TYPE,
      ballotStyleId,
      electionDefinition,
      i
    );

    // Error at this stage indicates that we attempted to render with the densest layout
    // but still couldn't fit the ballot onto a single page. There are no more layouts
    // to try, so we should short circuit and throw an error.
    if (layout.isErr()) {
      break;
    }

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
          sheetSize={getSheetSize()}
          layout={layout.ok()}
          machineType={MACHINE_TYPE}
        />
      </BackendLanguageContextProvider>
    );

    const pdfData = (
      await renderToPdf({
        document: ballot,
        paperDimensions: getPaperDimensions(),
      })
    ).unsafeUnwrap();

    const pageInfo = await iter(
      pdfToImages(pdfData, { scale: PRINT_DPI / SCAN_DPI })
    ).first();

    // A PDF must have at least 1 page but iter doesn't know this.
    // `pdfData` of length 0 will fail in `pdfToImages`.
    assert(pageInfo);

    if (pageInfo.pageCount === 1) {
      return pdfData;
    }
  }

  throw new Error('Unable to render ballot contents in a single page');
}
