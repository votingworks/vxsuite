import { Buffer } from 'node:buffer';
import { randomUUID as uuid } from 'node:crypto';

import {
  getPdfPageCount,
  PrintSides,
  Printer,
  renderToPdf,
  SummaryBallotLayoutRenderer,
} from '@votingworks/printing';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { generateMarkOverlay } from '@votingworks/hmpb';
import {
  BallotStyleId,
  BallotType,
  Contest,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
  filterVotesForContests,
} from '@votingworks/ui';
import { Store } from '../store.js';
import { PrintBallotProps as ClientParams } from '../types.js';

/**
 * Shared renderer instance for measuring ballot layouts.
 * Initialized lazily on first use.
 */
let sharedRenderer: SummaryBallotLayoutRenderer | null = null;

/**
 * Closes the shared renderer. Call this on application shutdown.
 */
export async function closeLayoutRenderer(): Promise<void> {
  /* istanbul ignore next */
  if (sharedRenderer) {
    await sharedRenderer.close();
    sharedRenderer = null;
  }
}

export interface PrintBallotProps extends ClientParams {
  printer: Printer;
  store: Store;
}

type PrintBlankBallotProps = Omit<PrintBallotProps, 'votes' | 'languageCode'>;

export async function printBallot(p: PrintBallotProps): Promise<void> {
  const { printer, store, precinctId, ballotStyleId, votes, languageCode } = p;

  const systemSettings = assertDefined(store.getSystemSettings());
  const printMode = systemSettings.bmdPrintMode ?? 'summary';

  switch (printMode) {
    case 'summary':
      break;
    case 'marks_on_preprinted_ballot':
      return printMarkOverlay(p);
    case 'bubble_ballot':
      return printBubbleBallot(p);
    default:
      /* istanbul ignore next  */
      throwIllegalValue(printMode, 'bmdPrintMode');
  }

  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const isLiveMode = !store.getTestMode();
  const uiStringsPackage = store.getUiStringsStore().getAllUiStrings();

  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId, election })
  );
  const allContests = getContests({ ballotStyle, election });
  const ballotAuditId = uuid();

  function encodePage(
    pageNumber: number,
    totalPages: number,
    contestsForPage: readonly Contest[]
  ) {
    return encodeSummaryBallotPage(election, {
      ballotHash: electionDefinition.ballotHash,
      ballotStyleId,
      precinctId,
      votes,
      isTestMode: !isLiveMode,
      ballotType: BallotType.Precinct,
      pageNumber,
      totalPages,
      ballotAuditId,
      contests: contestsForPage,
    });
  }

  // Optimistically render as a single-page-equivalent ballot (totalPages: 1)
  const singlePageBallot = (
    <BackendLanguageContextProvider
      // [TODO] Derive languageCode from the ballot style instead.
      currentLanguageCode={languageCode}
      uiStringsPackage={uiStringsPackage}
    >
      <BmdPaperBallot
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votes={votes}
        isLiveMode={isLiveMode}
        machineType="mark"
        pageNumber={1}
        totalPages={1}
        contestsForPage={allContests}
        encodedBallot={encodePage(1, 1, allContests)}
      />
    </BackendLanguageContextProvider>
  );

  const pdfData = (
    await renderToPdf({ document: singlePageBallot })
  ).unsafeUnwrap();

  const pageCount = await getPdfPageCount(pdfData);

  // If the ballot fits on a single page, print directly without computing
  // page breaks. This is the common case and avoids launching a separate
  // Chromium instance for layout measurement.
  if (pageCount === 1) {
    return printer.print({
      data: pdfData,
      sides: PrintSides.OneSided,
      isM404nSupportRequired: true,
    });
  }

  // Multi-page fallback: compute page breaks for proper per-page QR codes.
  // Pass pageCount as knownMinPages to skip the redundant single-page check.
  if (!sharedRenderer) {
    sharedRenderer = new SummaryBallotLayoutRenderer();
  }

  const pageBreaks = await sharedRenderer.computePageBreaks(
    electionDefinition,
    ballotStyleId,
    precinctId,
    votes,
    'mark',
    { languageCode, uiStringsPackage },
    pageCount
  );

  // Helper to get contests for a specific page
  function getPageContests(pageNumber: number) {
    const page = pageBreaks.find((pg) => pg.pageNumber === pageNumber);
    assert(page, `Page ${pageNumber} not found`);
    const contestIdSet = new Set(page.contestIds);
    return allContests.filter((c) => contestIdSet.has(c.id));
  }

  const ballotDocument = (
    <div>
      {pageBreaks.map((pageBreak) => {
        const pageContests = getPageContests(pageBreak.pageNumber);
        return (
          <BackendLanguageContextProvider
            key={pageBreak.pageNumber}
            currentLanguageCode={languageCode}
            uiStringsPackage={uiStringsPackage}
          >
            <BmdPaperBallot
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              votes={filterVotesForContests(votes, pageContests)}
              isLiveMode={isLiveMode}
              machineType="mark"
              pageNumber={pageBreak.pageNumber}
              totalPages={pageBreaks.length}
              contestsForPage={pageContests}
              encodedBallot={encodePage(
                pageBreak.pageNumber,
                pageBreaks.length,
                pageContests
              )}
              layout={pageBreak.layout}
            />
          </BackendLanguageContextProvider>
        );
      })}
    </div>
  );

  const multiPagePdfData = (
    await renderToPdf({ document: ballotDocument })
  ).unsafeUnwrap();

  return printer.print({
    data: multiPagePdfData,
    sides: PrintSides.OneSided,
    isM404nSupportRequired: true,
  });
}

function getBaseBallotPdf(
  store: Store,
  ballotStyleId: BallotStyleId,
  precinctId: string
): { election: Election; baseBallotPdf: Uint8Array } {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;

  const isLiveMode = !store.getTestMode();

  const ballotEntry = store.getBallot({
    ballotStyleId,
    precinctId,
    isLiveMode,
  });

  assert(
    ballotEntry,
    `No ballot PDF found for precinct ID: ${precinctId} and ballot style ID: ${ballotStyleId}`
  );

  const baseBallotPdf = Uint8Array.from(
    Buffer.from(ballotEntry.encodedBallot, 'base64')
  );

  return { election, baseBallotPdf };
}

async function printBubbleBallot(p: PrintBallotProps): Promise<void> {
  const { election, baseBallotPdf } = getBaseBallotPdf(
    p.store,
    p.ballotStyleId,
    p.precinctId
  );

  const markedBallotPdf = await generateMarkOverlay(
    election,
    p.ballotStyleId,
    p.votes,
    { offsetMmX: 0, offsetMmY: 0 }, // No calibration applied for bubble ballots
    baseBallotPdf
  );

  return p.printer.print({
    data: markedBallotPdf,
    sides: PrintSides.TwoSidedLongEdge,
    size: election.ballotLayout.paperSize,
  });
}

export async function printBlankBallot(
  p: PrintBlankBallotProps
): Promise<void> {
  const { election, baseBallotPdf } = getBaseBallotPdf(
    p.store,
    p.ballotStyleId,
    p.precinctId
  );

  return p.printer.print({
    data: baseBallotPdf,
    sides: PrintSides.TwoSidedLongEdge,
    size: election.ballotLayout.paperSize,
  });
}

async function printMarkOverlay(p: PrintBallotProps): Promise<void> {
  const { electionDefinition } = assertDefined(p.store.getElectionRecord());
  const { election } = electionDefinition;

  const markOverlayPdf = await generateMarkOverlay(
    election,
    p.ballotStyleId,
    p.votes,
    p.store.getPrintCalibration()
  );

  return p.printer.print({
    data: markOverlayPdf,
    sides: PrintSides.TwoSidedLongEdge,
    size: election.ballotLayout.paperSize,
  });
}
