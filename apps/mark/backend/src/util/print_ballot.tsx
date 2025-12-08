import { Buffer } from 'node:buffer';

import { PrintSides, Printer, renderToPdf } from '@votingworks/printing';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { generateMarkOverlay } from '@votingworks/hmpb';
import {
  BmdPaperBallot,
  BackendLanguageContextProvider,
} from '@votingworks/ui';
import { Store } from '../store';
import { PrintBallotProps as ClientParams } from '../types';

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
  const isLiveMode = !store.getTestMode();

  const ballot = (
    <BackendLanguageContextProvider
      // [TODO] Derive languageCode from the ballot style instead.
      currentLanguageCode={languageCode}
      uiStringsPackage={store.getUiStringsStore().getAllUiStrings()}
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

  return printer.print({
    data: (await renderToPdf({ document: ballot })).unsafeUnwrap(),
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
