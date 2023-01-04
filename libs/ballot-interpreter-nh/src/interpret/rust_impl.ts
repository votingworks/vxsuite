import {
  BallotPaperSizeSchema,
  ElectionDefinition,
  GridPositionSchema,
  Result,
  safeParseJson,
  SheetOf,
  SizeSchema,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { spawn } from 'child_process';
import makeDebug from 'debug';
import { writeFile as cbWriteFile } from 'fs';
import { tmpName as cbTmpName } from 'tmp';
import { promisify } from 'util';
import { z } from 'zod';
import {
  BackMarksMetadataSchema,
  FrontMarksMetadataSchema,
  MarksMetadataSchema,
  PointSchema,
} from '../types';

const debugLogger = makeDebug('ballot-interpreter-nh:rust-interpret');

const tmpName = promisify(cbTmpName);
const writeFile = promisify(cbWriteFile);

const RectSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

const GeometrySchema = z.object({
  ballotPaperSize: BallotPaperSizeSchema,
  pixelsPerInch: z.number(),
  canvasSize: SizeSchema,
  contentArea: RectSchema,
  ovalSize: SizeSchema,
  timingMarkSize: SizeSchema,
  gridSize: SizeSchema,
  frontUsableArea: RectSchema,
  backUsableArea: RectSchema,
});

const PartialTimingMarksSchema = z.object({
  geometry: GeometrySchema,
  topLeftCorner: PointSchema,
  topRightCorner: PointSchema,
  bottomLeftCorner: PointSchema,
  bottomRightCorner: PointSchema,
  topRects: z.array(RectSchema),
  bottomRects: z.array(RectSchema),
  leftRects: z.array(RectSchema),
  rightRects: z.array(RectSchema),
  topLeftRect: z.optional(RectSchema),
  topRightRect: z.optional(RectSchema),
  bottomLeftRect: z.optional(RectSchema),
  bottomRightRect: z.optional(RectSchema),
});

const CompleteTimingMarksSchema = z.object({
  geometry: GeometrySchema,
  topLeftCorner: PointSchema,
  topRightCorner: PointSchema,
  bottomLeftCorner: PointSchema,
  bottomRightCorner: PointSchema,
  topRects: z.array(RectSchema),
  bottomRects: z.array(RectSchema),
  leftRects: z.array(RectSchema),
  rightRects: z.array(RectSchema),
  topLeftRect: RectSchema,
  topRightRect: RectSchema,
  bottomLeftRect: RectSchema,
  bottomRightRect: RectSchema,
});

const TimingMarkGridSchema = z.object({
  geometry: GeometrySchema,
  partialTimingMarks: PartialTimingMarksSchema,
  completeTimingMarks: CompleteTimingMarksSchema,
  candidateTimingMarks: z.array(RectSchema),
  metadata: MarksMetadataSchema,
});

const GridLocationSchema = z.object({
  side: z.enum(['front', 'back']),
  column: z.number(),
  row: z.number(),
});

const ScoredOvalMarkSchema = z.object({
  location: GridLocationSchema,
  matchScore: z.number(),
  fillScore: z.number(),
  expectedBounds: RectSchema,
  matchedBounds: RectSchema,
});

const ScoredOvalMarksSchema = z.array(
  z.tuple([GridPositionSchema, z.optional(ScoredOvalMarkSchema)])
);

const InterpretedBallotPageSchema = z.object({
  grid: TimingMarkGridSchema,
  marks: ScoredOvalMarksSchema,
});

/**
 * A successfully interpreted ballot page.
 */
export type InterpretedBallotPage = z.infer<typeof InterpretedBallotPageSchema>;

const InterpretedBallotCardSchema = z.object({
  front: InterpretedBallotPageSchema,
  back: InterpretedBallotPageSchema,
});

/**
 * A successfully interpreted ballot card.
 */
export type InterpretedBallotCard = z.infer<typeof InterpretedBallotCardSchema>;

const BallotPageMetadataError = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ValueOutOfRange'),
    field: z.string(),
    value: z.number(),
    min: z.number(),
    max: z.number(),
    metadata: MarksMetadataSchema,
  }),
  z.object({
    type: z.literal('InvalidChecksum'),
    metadata: FrontMarksMetadataSchema,
  }),
  z.object({
    type: z.literal('InvalidEnderCode'),
    metadata: BackMarksMetadataSchema,
  }),
  z.object({
    type: z.literal('InvalidTimingMarkCount'),
    expected: z.number(),
    actual: z.number(),
  }),
  z.object({
    type: z.literal('AmbiguousMetadata'),
    frontMetadata: FrontMarksMetadataSchema,
    backMetadata: BackMarksMetadataSchema,
  }),
]);

const InterpretErrorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ImageOpenFailure'),
    path: z.string(),
  }),
  z.object({
    type: z.literal('InvalidCardMetadata'),
    sideA: MarksMetadataSchema,
    sideB: MarksMetadataSchema,
  }),
  z.object({
    type: z.literal('InvalidMetadata'),
    path: z.string(),
    error: BallotPageMetadataError,
  }),
]);

/**
 * Calls the Rust interpreter process to interpret the given ballot card.
 */
export async function interpret(
  electionDefinition: ElectionDefinition,
  sheet: SheetOf<string>
): Promise<Result<InterpretedBallotCard, Error>> {
  const timer = time(debugLogger, 'interpret');

  timer.checkpoint('start');

  const electionJsonPath = await tmpName();
  await writeFile(electionJsonPath, electionDefinition.electionData);

  timer.checkpoint('prepared');

  const interpreterProcess = spawn(
    'nh-interpret',
    ['-e', electionJsonPath, ...sheet],
    { stdio: 'pipe', env: { LOG: 'trace' } }
  );

  interpreterProcess.stdout.setEncoding('utf8');
  interpreterProcess.stderr.setEncoding('utf8');

  return await new Promise((resolve, reject) => {
    let stdout = '';

    interpreterProcess.stdout.on('readable', () => {
      stdout += interpreterProcess.stdout.read() || '';
    });

    interpreterProcess.stderr.on('readable', () => {
      debugLogger(interpreterProcess.stderr.read());
    });

    interpreterProcess.once('exit', (code) => {
      timer.checkpoint('interpreted');

      if (code === 0) {
        resolve(safeParseJson(stdout, InterpretedBallotCardSchema));
      } else {
        reject(safeParseJson(stdout, InterpretErrorSchema));
      }

      timer.checkpoint('parsedResult');
      timer.end();
    });
  });
}
