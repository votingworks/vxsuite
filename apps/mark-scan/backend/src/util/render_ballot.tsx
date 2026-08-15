import {
  PAPER_DIMENSIONS,
  PaperDimensions,
  renderToPdf,
} from '@votingworks/printing';
import {
  BallotStyleId,
  BallotType,
  Election,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  HmpbBallotPaperSize,
  VotesDict,
} from '@votingworks/types';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';

import { assertDefined } from '@votingworks/basics';
import { randomUUID } from 'node:crypto';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
  BmdBallotSheetSize,
  getLayout,
  MachineType,
  ORDERED_BMD_BALLOT_LAYOUTS,
} from '@votingworks/ui';
import { getPdfPageCount } from '@votingworks/image-utils';
import { Store } from '../store.js';
import { getMarkScanBmdModel } from './hardware.js';

export interface RenderBallotProps {
  store: Store;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
  languageCode: string;
}

const MACHINE_TYPE: MachineType = 'markScan';

function getPaperDimensions(election: Election): PaperDimensions {
  if (getMarkScanBmdModel() === 'bmd-150') {
    return election.ballotLayout.paperSize === HmpbBallotPaperSize.Letter
      ? PAPER_DIMENSIONS.Custom8x11
      : PAPER_DIMENSIONS.Custom8x13pt25;
  }
  return PAPER_DIMENSIONS.Letter;
}

function getSheetSize(election: Election): BmdBallotSheetSize {
  if (getMarkScanBmdModel() === 'bmd-150') {
    return election.ballotLayout.paperSize === HmpbBallotPaperSize.Letter
      ? 'custom8x11'
      : 'custom8x13pt25';
  }
  return 'letter';
}

export async function renderTestModeBallotWithoutLanguageContext(
  electionDefinition: ElectionDefinition,
  precinctId: string,
  ballotStyleId: BallotStyleId,
  votes: VotesDict
): Promise<Uint8Array> {
  const layout = getLayout(
    MACHINE_TYPE,
    ballotStyleId,
    electionDefinition
  ).unsafeUnwrap();

  const ballotStyle = assertDefined(
    getBallotStyle({ election: electionDefinition.election, ballotStyleId })
  );
  const contests = getContests({
    election: electionDefinition.election,
    ballotStyle,
  });

  const ballotAuditId = randomUUID();
  const ballot = (
    <BmdPaperBallot
      binarize
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={false}
      sheetSize={getSheetSize(electionDefinition.election)}
      layout={layout}
      machineType={MACHINE_TYPE}
      pageNumber={1}
      totalPages={1}
      contestsForPage={contests}
      encodedBallot={encodeSummaryBallotPage(electionDefinition.election, {
        ballotHash: electionDefinition.ballotHash,
        ballotStyleId,
        precinctId,
        votes,
        isTestMode: true,
        ballotType: BallotType.Precinct,
        pageNumber: 1,
        totalPages: 1,
        ballotAuditId,
        contests,
      })}
    />
  );

  return (
    await renderToPdf({
      document: ballot,
      paperDimensions: getPaperDimensions(electionDefinition.election),
    })
  ).unsafeUnwrap();
}

export async function renderBallot({
  store,
  precinctId,
  ballotStyleId,
  votes,
  languageCode,
}: RenderBallotProps): Promise<Uint8Array> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const isLiveMode = !store.getTestMode();

  const ballotStyle = assertDefined(
    getBallotStyle({ election: electionDefinition.election, ballotStyleId })
  );
  const contests = getContests({
    election: electionDefinition.election,
    ballotStyle,
  });
  const ballotAuditId = randomUUID();

  const maxRenderAttempts = ORDERED_BMD_BALLOT_LAYOUTS.markScan.length;

  for (let i = 0; i < maxRenderAttempts; i += 1) {
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
          sheetSize={getSheetSize(electionDefinition.election)}
          layout={layout.ok()}
          machineType={MACHINE_TYPE}
          pageNumber={1}
          totalPages={1}
          contestsForPage={contests}
          encodedBallot={encodeSummaryBallotPage(electionDefinition.election, {
            ballotHash: electionDefinition.ballotHash,
            ballotStyleId,
            precinctId,
            votes,
            isTestMode: !isLiveMode,
            ballotType: BallotType.Precinct,
            pageNumber: 1,
            totalPages: 1,
            ballotAuditId,
            contests,
          })}
        />
      </BackendLanguageContextProvider>
    );

    const pdfData = (
      await renderToPdf({
        document: ballot,
        paperDimensions: getPaperDimensions(electionDefinition.election),
      })
    ).unsafeUnwrap();

    const numPages = await getPdfPageCount(Uint8Array.from(pdfData));
    if (numPages === 1) {
      return pdfData;
    }
  }

  throw new Error('Unable to render ballot contents in a single page');
}
