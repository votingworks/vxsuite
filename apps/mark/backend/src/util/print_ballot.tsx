import { Buffer } from 'node:buffer';
import { v4 as uuid } from 'uuid';

import {
  getPdfPageCount,
  PrintSides,
  Printer,
  renderToPdf,
  SummaryBallotLayoutRenderer,
} from '@votingworks/printing';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { generateMarkOverlay } from '@votingworks/hmpb';
import { getBallotStyle, getContests } from '@votingworks/types';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
  filterVotesForContests,
} from '@votingworks/ui';
import { Store } from '../store';
import { PrintBallotProps as ClientParams } from '../types';

/**
 * Shared renderer instance for measuring ballot layouts.
 * Initialized lazily on first use.
 */
let sharedRenderer: SummaryBallotLayoutRenderer | null = null;

/**
 * Closes the shared renderer. Call this on application shutdown.
 */
export async function closeLayoutRenderer(): Promise<void> {
  /* istanbul ignore next - @preserve */
  if (sharedRenderer) {
    await sharedRenderer.close();
    sharedRenderer = null;
  }
}

export interface PrintBallotProps extends ClientParams {
  printer: Printer;
  store: Store;
}

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
    /* istanbul ignore next  - @preserve */
    default:
      throwIllegalValue(printMode, 'bmdPrintMode');
  }

  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const isLiveMode = !store.getTestMode();
  const uiStringsPackage = store.getUiStringsStore().getAllUiStrings();

  // Optimistically render as a single-page ballot
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
    const page = pageBreaks.pages.find((pg) => pg.pageNumber === pageNumber);
    assert(page, `Page ${pageNumber} not found`);
    const ballotStyle = getBallotStyle({ ballotStyleId, election });
    assert(ballotStyle);
    const allContests = getContests({ ballotStyle, election });
    const contestIdSet = new Set(page.contestIds);
    return allContests.filter((c) => contestIdSet.has(c.id));
  }

  const ballotAuditId = uuid();

  const ballotDocument = (
    <div>
      {pageBreaks.pages.map((pageBreak) => {
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
              totalPages={pageBreaks.totalPages}
              ballotAuditId={ballotAuditId}
              contestsForPage={pageContests}
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
  });
}

async function printBubbleBallot(p: PrintBallotProps): Promise<void> {
  const { electionDefinition } = assertDefined(p.store.getElectionRecord());
  const { election } = electionDefinition;

  const isLiveMode = !p.store.getTestMode();

  // Get the base ballot PDF from the election package
  const ballotEntry = p.store.getBallot({
    ballotStyleId: p.ballotStyleId,
    precinctId: p.precinctId,
    isLiveMode,
  });

  assert(
    ballotEntry,
    `No ballot PDF found for precinct ID: ${p.precinctId} and ballot style ID: ${p.ballotStyleId}`
  );

  // Decode the base64 ballot PDF
  const baseBallotPdf = Uint8Array.from(
    Buffer.from(ballotEntry.encodedBallot, 'base64')
  );

  // Generate the mark overlay composited with the base ballot PDF
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
