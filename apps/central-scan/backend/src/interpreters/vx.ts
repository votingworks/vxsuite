import { QrCodePageResult } from '@votingworks/ballot-interpreter-vx';
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

export class VxInterpreter {
  private interpreter?: Interpreter;

  configure(store: Store): void {
    this.interpreter = undefined;

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

    debug('creating a new interpreter');
    this.interpreter = new Interpreter({
      electionDefinition,
      precinctSelection,
      testMode: store.getTestMode(),
      adjudicationReasons: electionDefinition.election
        .centralScanAdjudicationReasons ?? [AdjudicationReason.MarginalMark],
    });
  }

  async interpret(
    ballotImagePath: string,
    sheetId: string,
    ballotImagesPath: string,
    detectQrcodeResult: QrCodePageResult
  ): Promise<PageInterpretationWithFiles> {
    debug('interpret ballot image: %s', ballotImagePath);
    assert(this.interpreter, 'interpreter not configured');

    const result = this.interpreter.interpretFile({
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
}
