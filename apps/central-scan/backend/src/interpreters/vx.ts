import { QrCodePageResult } from '@votingworks/ballot-interpreter-vx';
import { pdfToImages } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  PageInterpretationWithFiles,
} from '@votingworks/types';
import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import { Interpreter } from '../interpreter';
import { Store } from '../store';
import { saveSheetImages } from '../util/save_images';

const debug = makeDebug('scan:vx:interpret');

let interpreter: Interpreter | undefined;

/**
 * Reads election configuration from the database.
 */
export async function configure(store: Store): Promise<void> {
  interpreter = undefined;

  debug('configuring from %s', store.getDbPath());

  const electionDefinition = store.getElectionDefinition();
  if (!electionDefinition) {
    debug('no election configured');
    return;
  }
  debug('election: %s', electionDefinition.election.title);

  const precinctSelection = store.getPrecinctSelection();
  if (!precinctSelection) {
    debug('no precinct selected');
    return;
  }
  debug('precinctSelection: %o', precinctSelection);

  const templates = store.getHmpbTemplates();

  debug('creating a new interpreter');
  interpreter = new Interpreter({
    electionDefinition,
    precinctSelection,
    testMode: store.getTestMode(),
    markThresholdOverrides: store.getMarkThresholdOverrides(),
    adjudicationReasons: electionDefinition.election
      .centralScanAdjudicationReasons ?? [AdjudicationReason.MarginalMark],
  });

  debug('hand-marked paper ballot templates: %d', templates.length);
  for (const [pdf, layouts] of templates) {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const ballotPageLayout = layouts[pageNumber - 1];
      interpreter.addHmpbTemplate({
        ballotPageLayout,
        imageData: page,
      });
    }
  }
}

export async function interpret(
  ballotImagePath: string,
  sheetId: string,
  ballotImagesPath: string,
  detectQrcodeResult: QrCodePageResult
): Promise<PageInterpretationWithFiles> {
  debug('interpret ballot image: %s', ballotImagePath);
  assert(interpreter, 'interpreter not configured');

  const result = await interpreter.interpretFile({
    ballotImagePath,
    detectQrcodeResult,
  });
  debug(
    'interpreted ballot image as %s: %s',
    result.interpretation.type,
    ballotImagePath
  );
  const images = await saveSheetImages(
    sheetId,
    ballotImagesPath,
    ballotImagePath,
    result.normalizedImage
  );
  return {
    interpretation: result.interpretation,
    originalFilename: images.original,
    normalizedFilename: images.normalized,
  };
}
