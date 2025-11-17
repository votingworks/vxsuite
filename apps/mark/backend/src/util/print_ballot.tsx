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
      throw new Error('Not yet supported');
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

async function printMarkOverlay(p: PrintBallotProps): Promise<void> {
  const { electionDefinition } = assertDefined(p.store.getElectionRecord());
  const { election } = electionDefinition;

  const stream = generateMarkOverlay(
    election,
    p.ballotStyleId,
    p.votes,
    p.store.getPrintCalibration()
  );

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    assert(chunk instanceof Buffer);
    chunks.push(chunk);
  }

  const pdf = Buffer.concat(chunks);

  return p.printer.print({
    data: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.length),
    sides: PrintSides.TwoSidedLongEdge,
    size: election.ballotLayout.paperSize,
  });
}
