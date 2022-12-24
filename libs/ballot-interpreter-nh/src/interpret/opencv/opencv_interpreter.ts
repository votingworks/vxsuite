import makeDebug from 'debug';

import {
  AdjudicationReason,
  BallotPaperSize,
  ElectionDefinition,
  err,
  Id,
  MarkThresholds,
  ok,
  Result,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { getScannedBallotCardGeometry } from '../../accuvote';
import { BallotCardGeometry } from '../../types';
import { PageInterpreter } from './page_interpreter';
import { BallotMetadata, OpenCvInterpretResult } from './types';
import { ovalTemplatePromise } from './oval_template';
import { DefaultMarkThresholds } from '..';

const debugLogger = makeDebug('ballot-interpreter-nh:interpret-opencv');

/**
 * OpenCV-powered ballot sheet interpreter
 */
export class OpenCvInterpreter {
  private readonly adjudicationReasons: readonly AdjudicationReason[];
  private readonly ballotImagesPath: string;
  private readonly electionDefinition: ElectionDefinition;
  private readonly geometry: BallotCardGeometry;
  private readonly isTestMode: boolean;
  private readonly markThresholds: MarkThresholds;
  private readonly paperSize: BallotPaperSize;

  constructor(settings: {
    ballotImagesPath: string;
    electionDefinition: ElectionDefinition;
    isTestMode: boolean;
    markThresholds?: MarkThresholds;
  }) {
    const paperSize =
      settings.electionDefinition.election.ballotLayout?.paperSize;
    if (!paperSize) {
      throw new Error('paperSize is required in election definition');
    }

    this.adjudicationReasons =
      settings.electionDefinition.election.precinctScanAdjudicationReasons ??
      [];
    this.ballotImagesPath = settings.ballotImagesPath;
    this.electionDefinition = settings.electionDefinition;
    this.geometry = getScannedBallotCardGeometry(paperSize);
    this.isTestMode = settings.isTestMode;
    this.markThresholds =
      settings.markThresholds ||
      settings.electionDefinition.election.markThresholds ||
      DefaultMarkThresholds;
    this.paperSize = paperSize;
  }

  async run(
    sheet: SheetOf<string>,
    sheetId: Id
  ): Promise<Result<SheetOf<OpenCvInterpretResult>, Error>> {
    // FIXME: simulating this being pre-loaded for timing purposes
    await ovalTemplatePromise;

    const timer = time(debugLogger, 'run');

    // FIXME: hack to enable prototyping with as much parallelism as possible
    let resolveBallotMetadataFn: (value: BallotMetadata) => void;
    const ballotMetadataPromise: Promise<BallotMetadata> = new Promise(
      (resolveFn) => {
        resolveBallotMetadataFn = resolveFn;
      }
    );

    const pageInterpreter = new PageInterpreter(
      this.electionDefinition,
      this.geometry,
      this.isTestMode,
      this.paperSize,
      this.adjudicationReasons,
      this.markThresholds,
      this.ballotImagesPath,
      sheetId,
      (ballotMetadata) => resolveBallotMetadataFn(ballotMetadata),
      ballotMetadataPromise
    );

    const [page1Result, page2Result] = await Promise.all([
      pageInterpreter.run(sheet[0], 0),
      pageInterpreter.run(sheet[1], 1),
    ]);

    if (page1Result.isErr()) {
      return err(page1Result.err());
    }

    if (page2Result.isErr()) {
      return err(page2Result.err());
    }

    timer.checkpoint('interpretedBothPages');

    timer.end();

    return ok([page1Result.ok(), page2Result.ok()]);
  }
}
