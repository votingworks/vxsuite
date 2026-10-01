import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  assert,
  assertDefined,
  deepEqual,
  find,
  groupBy,
  iter,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BALLOT_MODES,
  type BallotStyleId,
  BallotType,
  type BaseBallotProps,
  type Election,
  type ElectionDefinition,
  type ElectionSerializationFormat,
  type GridPosition,
  type HmpbBallotPageMetadata,
  type Outset,
  type SheetPositions,
  ballotPositionsFromGridPositions,
  convertVxfElectionToCdfBallotDefinition,
  formatBallotHash,
  safeParseElection,
  convertLatestElectionToV4p0,
  ElectionV4p0Schema,
  type SoftwareVersion,
  safeParseElectionDefinitionForAnySoftwareVersion,
  safeParse,
  LATEST_SOFTWARE_VERSION,
  type SystemSettings,
  type BallotPositions,
} from '@votingworks/types';
import { QrCode } from '@votingworks/ui';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { computeBallotHashVxf, HashingPassthrough } from '@votingworks/backend';
import type {
  DocumentElement,
  RenderDocument,
  Renderer,
  RendererPool,
} from './renderer.js';
import {
  BUBBLE_CLASS,
  BALLOT_HASH_SLOT_CLASS,
  CANDIDATE_OPTION_CLASS,
  type OptionInfo,
  PAGE_CLASS,
  QR_CODE_SIZE,
  QR_CODE_SLOT_CLASS,
  WRITE_IN_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
} from './ballot_components.js';
import type { Pixels, Point } from './types.js';
import {
  measureTimingMarkGrid,
  renderBallotTemplate,
  type BallotLayoutError,
  type BallotPageTemplate,
  type GridMeasurements,
} from './render_common.js';

export function pixelsToGridHeight(
  grid: GridMeasurements,
  pixels: Pixels
): number {
  return pixels / grid.rowGap;
}

export function pixelsToGridWidth(
  grid: GridMeasurements,
  pixels: Pixels
): number {
  return pixels / grid.columnGap;
}

export function pixelPointToGridPoint(
  grid: GridMeasurements,
  point: Point<Pixels>
): { column: number; row: number } {
  return {
    column: pixelsToGridWidth(grid, point.x - grid.origin.x),
    row: pixelsToGridHeight(grid, point.y - grid.origin.y),
  };
}

async function extractBallotPositions(
  document: RenderDocument,
  ballotStyleId: BallotStyleId,
  isAllBubbleBallot = false
): Promise<{
  ballotStyleId: BallotStyleId;
  ballotPositions: SheetPositions[];
}> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const optionPositionsPerPage = await Promise.all(
    pages.map(async (_, i) => {
      const pageNumber = i + 1;
      const grid = await measureTimingMarkGrid(document, pageNumber);

      const bubbles = await document.inspectElements(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
      );
      const optionPositions = bubbles.map((bubble): GridPosition => {
        // Use the grid coordinates for the center of the bubble
        const bubbleGridCoordinates = pixelPointToGridPoint(grid, {
          x: bubble.x + bubble.width / 2,
          y: bubble.y + bubble.height / 2,
        });
        const positionInfo = {
          sheetNumber: Math.ceil(pageNumber / 2),
          side: pageNumber % 2 === 1 ? 'front' : 'back',
          ...bubbleGridCoordinates,
        } as const;
        const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
        switch (optionInfo.type) {
          case 'option':
            return {
              ...positionInfo,
              ...optionInfo,
            };
          case 'write-in': {
            return {
              ...positionInfo,
              ...optionInfo,
              writeInArea: {
                x: positionInfo.column - optionInfo.writeInArea.left,
                y: positionInfo.row - optionInfo.writeInArea.top,
                width:
                  optionInfo.writeInArea.left + optionInfo.writeInArea.right,
                height:
                  optionInfo.writeInArea.top + optionInfo.writeInArea.bottom,
              },
            };
          }
          default:
            return throwIllegalValue(optionInfo);
        }
      });
      return optionPositions;
    })
  );
  const gridPositions = optionPositionsPerPage.flat();

  // To compute the bounds of options, we'll look at the first write-in option
  // box we find. We use this value for every contest option on the ballot.
  // We use a write-in option box rather than a candidate option box because
  // it is the larger of the two and gives us more margin for error. If there
  // are no write-ins, we fallback to a candidate option and then a ballot measure
  // option. We may want to eventually switch to a data model where we compute bounds
  // for every contest option we care about individually, since write-in and candidate
  // options are not the same size.
  const optionBoundsFromTargetMark: Outset<number> = await (async () => {
    // All bubble ballots are a special case of a valid ballot with no contest options
    if (isAllBubbleBallot) {
      return { top: 0, left: 0, right: 0, bottom: 0 };
    }

    let optionElement: DocumentElement | null = null;
    let bubbleElement: DocumentElement | null = null;

    const writeInOptions = await document.inspectElements(
      `.${WRITE_IN_OPTION_CLASS}`
    );
    // @coverage-defer
    if (writeInOptions.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      optionElement = writeInOptions[0]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      bubbleElement = (
        await document.inspectElements(
          `.${WRITE_IN_OPTION_CLASS} .${BUBBLE_CLASS}`
        )
      )[0]!;
    }

    // @coverage-defer
    if (optionElement === null) {
      const candidateOptions = await document.inspectElements(
        `.${CANDIDATE_OPTION_CLASS}`
      );
      if (candidateOptions.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        optionElement = candidateOptions[0]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        bubbleElement = (
          await document.inspectElements(
            `.${CANDIDATE_OPTION_CLASS} .${BUBBLE_CLASS}`
          )
        )[0]!;
      }
    }

    // @coverage-defer
    if (optionElement === null) {
      const ballotMeasureOptions = await document.inspectElements(
        `.${BALLOT_MEASURE_OPTION_CLASS}`
      );
      if (ballotMeasureOptions.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        optionElement = ballotMeasureOptions[0]!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        bubbleElement = (
          await document.inspectElements(
            `.${BALLOT_MEASURE_OPTION_CLASS} .${BUBBLE_CLASS}`
          )
        )[0]!;
      }
    }

    assert(
      optionElement !== null && bubbleElement !== null,
      'No contest option elements found on the ballot but at least one is required.'
    );

    const bubbleElementCenter: Point<Pixels> = {
      x: bubbleElement.x + bubbleElement.width / 2,
      y: bubbleElement.y + bubbleElement.height / 2,
    };
    const grid = await measureTimingMarkGrid(document, 1);
    const bounds: Outset<number> = {
      top: pixelsToGridHeight(grid, bubbleElementCenter.y - optionElement.y),
      left: pixelsToGridWidth(grid, bubbleElementCenter.x - optionElement.x),
      right: pixelsToGridWidth(
        grid,
        optionElement.x + optionElement.width - bubbleElementCenter.x
      ),
      bottom: pixelsToGridHeight(
        grid,
        optionElement.y + optionElement.height - bubbleElementCenter.y
      ),
    };
    return bounds;
  })();

  // MVP: derive each option's bounds from the single shared
  // optionBoundsFromTargetMark outset, reproducing the bounds the interpreter
  // historically computed. Per-option/per-contest bounds now live on the ballot
  // style's ballotPositions instead of a flat election-level gridLayout.
  return {
    ballotStyleId,
    ballotPositions: ballotPositionsFromGridPositions(
      gridPositions,
      optionBoundsFromTargetMark
    ),
  };
}

async function addQrCodesAndBallotHashes(
  document: RenderDocument,
  election: Election,
  metadata: Omit<HmpbBallotPageMetadata, 'pageNumber'>,
  version: SoftwareVersion
) {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const i of pages.keys()) {
    const pageNumber = i + 1;
    const encodedMetadata = encodeHmpbBallotPageMetadata(
      election,
      {
        ...metadata,
        pageNumber,
      },
      version
    );
    const qrCode = (
      <div
        style={{
          height: `${QR_CODE_SIZE.height}in`,
          width: `${QR_CODE_SIZE.width}in`,
        }}
      >
        <QrCode
          value={Buffer.from(encodedMetadata).toString('base64')}
          level="L"
        />
      </div>
    );
    await document.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${QR_CODE_SLOT_CLASS}`,
      qrCode
    );
    await document.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BALLOT_HASH_SLOT_CLASS}`,
      <>{formatBallotHash(metadata.ballotHash)}</>
    );
  }
}

/**
 * Given a ballot render document, renders the ballot as a PDF. Adds a QR code
 * with the ballot metadata (unless it's a sample ballot).
 */
export async function renderBallotPdfWithMetadataQrCode(
  props: BaseBallotProps,
  document: RenderDocument,
  electionDefinition: ElectionDefinition,
  version: SoftwareVersion
): Promise<Uint8Array> {
  if (props.ballotMode !== 'sample') {
    await addQrCodesAndBallotHashes(
      document,
      electionDefinition.election,
      {
        ballotHash: electionDefinition.ballotHash,
        ballotStyleId: props.ballotStyleId,
        precinctId: props.precinctId,
        ballotType: props.ballotType,
        isTestMode: props.ballotMode !== 'official',
        ballotAuditId: props.ballotAuditId,
      },
      version
    );
  }

  return await document.renderToPdf();
}

/**
 * Given a {@link BallotPageTemplate} and a single set of props, renders a
 * ballot and returns the resulting PDF. Does not insert a QR code.
 */
export async function renderBallotPreviewToPdf<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P
): Promise<Result<Uint8Array, BallotLayoutError>> {
  const result = await renderBallotTemplate(renderer, template, props);
  // @coverage-defer
  if (result.isErr()) {
    return result;
  }
  const document = result.ok();
  const pdf = await document.renderToPdf();
  return ok(pdf);
}

export interface ElectionSerializationOptions {
  /** If `true`, the election is serialized without indentation. */
  compact?: boolean;
  format: ElectionSerializationFormat;
  version: SoftwareVersion;
}

function serializeElection(
  election: Election,
  options: ElectionSerializationOptions
): string {
  const electionToSerialize = (() => {
    // @coverage-defer
    switch (options.format) {
      case 'vxf':
        // Re-parse the election to ensure it is being saved in a consistent format.
        // Zod parsing can change the order of fields when parsing the json object.
        // This ensures that those changes occur before saving the file so that if
        // that file is loaded back through this code path the resulting election is
        // identical and hashes to the same value.
        switch (options.version) {
          case 'v4.0':
            return safeParse(
              ElectionV4p0Schema,
              convertLatestElectionToV4p0(election)
            ).unsafeUnwrap();
          case 'v4.1':
            return safeParseElection(election).unsafeUnwrap();
          default:
            return throwIllegalValue(options.version);
        }
      case 'cdf':
        assert(
          options.version === LATEST_SOFTWARE_VERSION,
          `CDF export only supported for software version ${LATEST_SOFTWARE_VERSION}`
        );
        return convertVxfElectionToCdfBallotDefinition(election);
      default:
        throwIllegalValue(options.format);
    }
  })();

  return options.compact
    ? JSON.stringify(electionToSerialize)
    : JSON.stringify(electionToSerialize, null, 2);
}

/**
 * Temporary staging area for ballot layout files. Intermediate HTML layouts are
 * written to disk to avoid memory exhaustion when processing large elections.
 *
 * Can be wiped after final PDFs are generated.
 */
export interface ScratchDir {
  path: string;
}

/**
 * Given a {@link BallotPageTemplate} and a list of ballot props, lays out
 * each ballot for each set of props. Then, extracts the grid layout from the
 * ballot and creates an election definition.
 *
 * Returns the path to the HTML content for each ballot (stored in
 * {@link scratchDir}) alongside the election definition.
 *
 * Note: This function does not insert metadata QR codes into the ballots.
 */
export async function layOutBallotsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  rendererPool: RendererPool,
  template: BallotPageTemplate<P>,
  ballotProps: P[],
  serializationOptions: ElectionSerializationOptions,
  systemSettings: SystemSettings,
  scratchDir: ScratchDir,
  emitProgress?: (label: string, progress: number, total: number) => void
): Promise<{
  ballotPositionsPath?: string;
  layoutPaths: string[];
  electionDefinition: ElectionDefinition;
}> {
  assert(ballotProps.length > 0, 'No ballot props provided');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const baseElection = ballotProps[0]!.election;
  assert(ballotProps.every((props) => props.election === baseElection));

  const positionsByBallotStyle = new Map<BallotStyleId, SheetPositions[]>();

  const layoutPaths = await rendererPool.runTasks(
    ballotProps.map((props) => async (renderer) => {
      // We currently only need to return errors to the user in ballot preview -
      // we assume the ballot was proofed by the time this function is called.
      const document = (
        await renderBallotTemplate(renderer, template, props)
      ).unsafeUnwrap();

      if (isScannedBallotStyle(props)) {
        const positions = await extractBallotPositions(
          document,
          props.ballotStyleId,
          template.isAllBubbleBallot
        );
        recordBallotPositions(positions);
      }

      const layoutPath = await writeScratchFile(scratchDir, {
        data: await document.getContent(),
        extension: 'html',
      });

      return layoutPath;
    }),
    // @coverage-defer
    emitProgress &&
      // @coverage-defer
      ((progress, total) => emitProgress('Laying out ballots', progress, total))
  );

  function isScannedBallotStyle(props: P) {
    // NH state ballots have variants that aren't tabulated by machine and so
    // don't need to share bubble positions with the scanned ballots
    return (
      !('variant' in props && props.variant) &&
      !('isHandCount' in props && props.isHandCount)
    );
  }

  function recordBallotPositions(p: {
    ballotStyleId: BallotStyleId;
    ballotPositions: SheetPositions[];
  }) {
    const firstSeenPositions = positionsByBallotStyle.get(p.ballotStyleId);

    if (firstSeenPositions) {
      // All ballots of a given ballot style must have the same positions.
      // Changing precinct/ballot type/ballot mode shouldn't matter. We need to
      // check sample ballots as well. Even though they don't have visible
      // timing marks, we can still compute positions for them, and it's
      // important that their bubble positions match official ballots.
      assert(
        deepEqual(firstSeenPositions, p.ballotPositions),
        `Found multiple distinct ballot positions for ballot style ${p.ballotStyleId}`
      );
    } else {
      positionsByBallotStyle.set(p.ballotStyleId, p.ballotPositions);
    }
  }

  const contests = baseElection.contests
    // Temporary workaround for candidate rotation to ensure that VxMark's voting
    // flow and tally reports in VxAdmin/VxScan list candidates in the same order
    // that they appear on the HMPB. (Eventually, we should use the gridLayouts
    // for that ordering instead of the election contests.)
    //
    // For each candidate contest: if all ballot styles have the same
    // orderedCandidatesByContest ordering, change the election definition to also
    // have that ordering of candidates.
    .map((contest) => {
      if (template.isAllBubbleBallot) return contest;
      if (contest.type !== 'candidate') return contest;
      const ballotStylesWithContest = baseElection.ballotStyles.filter(
        ({ orderedCandidatesByContest: orderedDisplayCandidatesByContest }) =>
          orderedDisplayCandidatesByContest &&
          contest.id in orderedDisplayCandidatesByContest
      );
      if (ballotStylesWithContest.length === 0) return contest;
      const [firstBallotStyle, ...restBallotStyles] = ballotStylesWithContest;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const firstLayoutOrder = assertDefined(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        firstBallotStyle!.orderedCandidatesByContest
      )[contest.id]!;
      if (
        restBallotStyles.every((ballotStyle) =>
          deepEqual(
            assertDefined(ballotStyle.orderedCandidatesByContest)[contest.id],
            firstLayoutOrder
          )
        )
      ) {
        return {
          ...contest,
          candidates: firstLayoutOrder.map(({ id }) =>
            find(contest.candidates, (c) => c.id === id)
          ),
        };
      }
      return contest;
    });

  const election: Election = { ...baseElection, contests };

  const isSplitElectionDef =
    serializationOptions.format === 'vxf' &&
    systemSettings.splitElectionDefinition;

  // [TODO] Replace with a software version check when setting is on by default.
  if (!isSplitElectionDef) {
    const electionDefinition = electionWithBallotPositions(
      election,
      positionsByBallotStyle,
      serializationOptions
    );

    return { electionDefinition, layoutPaths };
  }

  const electionData = serializeElection(election, serializationOptions);

  function* ballotPositionLines() {
    for (const bs of election.ballotStyles) {
      const positions = positionsByBallotStyle.get(bs.id);
      if (!positions) continue;

      const data: BallotPositions = { ballotStyleId: bs.id, positions };
      yield `${JSON.stringify(data)}\n`;
    }
  }

  const ballotPositionsFile = await writeAndHashScratchFile(scratchDir, {
    data: Readable.from(ballotPositionLines()),
    extension: 'jsonl',
  });

  const ballotHash = computeBallotHashVxf({
    ballotPositions: ballotPositionsFile.hash,
    election: createHash('sha256').update(electionData).digest('hex'),
  });

  return {
    ballotPositionsPath: ballotPositionsFile.path,
    electionDefinition: { ballotHash, election, electionData },
    layoutPaths,
  };
}

function electionWithBallotPositions(
  baseElection: Election,
  positionsByBallotStyle: Map<BallotStyleId, SheetPositions[]>,
  opts: ElectionSerializationOptions
): ElectionDefinition {
  const ballotStyles = baseElection.ballotStyles.map((ballotStyle) => {
    const ballotPositions = positionsByBallotStyle.get(ballotStyle.id);

    // @coverage-defer
    return ballotPositions ? { ...ballotStyle, ballotPositions } : ballotStyle;
  });

  const withPositions: Election = { ...baseElection, ballotStyles };
  const electionData = serializeElection(withPositions, opts);
  const parsed = safeParseElectionDefinitionForAnySoftwareVersion(electionData);

  return parsed.unsafeUnwrap();
}

// @coverage-defer
export async function renderAllBallotPdfsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  rendererPool: RendererPool,
  template: BallotPageTemplate<P>,
  ballotProps: P[],
  electionSerializationOptions: ElectionSerializationOptions,
  systemSettings: SystemSettings,
  scratchDir: ScratchDir,
  emitProgress?: (label: string, progress: number, total: number) => void
): Promise<{
  ballotPaths: string[];
  ballotPositionsPath?: string;
  electionDefinition: ElectionDefinition;
}> {
  const { ballotPositionsPath, layoutPaths, electionDefinition } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      template,
      ballotProps,
      electionSerializationOptions,
      systemSettings,
      scratchDir,
      emitProgress
    );

  const ballotPaths = await rendererPool.runTasks(
    iter(ballotProps)
      .zip(layoutPaths)
      .map(([props, layoutPath]) => async (renderer: Renderer) => {
        const document = await renderer.documentFromPath(layoutPath);

        // No need to throw on failed single-file cleanup. Scratch directories
        // are expected to be cleaned up after each run. If failures pile up for
        // a very large job, we can expect a "no space" error later downstream.
        void fs.rm(layoutPath).catch((error) => {
          // eslint-disable-next-line no-console
          console.error(`cleanup failed for temp layout ${layoutPath}:`, error);
        });

        const pdf = await renderBallotPdfWithMetadataQrCode(
          props,
          document,
          electionDefinition,
          electionSerializationOptions.version
        );

        return writeScratchFile(scratchDir, { data: pdf, extension: 'pdf' });
      })
      .toArray(),

    emitProgress &&
      ((progress, total) =>
        emitProgress('Rendering ballot PDFs', progress, total))
  );

  return {
    ballotPaths,
    ballotPositionsPath,
    electionDefinition,
  };
}

/**
 * Creates a list of the {@link BaseBallotProps} for all possible ballots -
 * every combination of ballot style, precinct, ballot type (precinct/absentee),
 * and ballot mode (official/test/sample).
 */
export function allBaseBallotProps(election: Election): BaseBallotProps[] {
  const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
  return election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.flatMap((precinctId) =>
      ballotTypes.flatMap((ballotType) =>
        BALLOT_MODES.map((ballotMode) => ({
          election,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType,
          ballotMode,
        }))
      )
    )
  );
}

/**
 * Lays out the minimal set of ballots required to create an election definition
 * with grid layouts included. Each ballot style will have exactly one grid
 * layout regardless of precinct, ballot type, or ballot mode. So we just need
 * to render a single ballot per ballot style to create the election definition
 */
export async function layOutMinimalBallotsToCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  rendererPool: RendererPool,
  template: BallotPageTemplate<P>,
  allBallotProps: P[],
  electionSerializationOptions: ElectionSerializationOptions,
  systemSettings: SystemSettings,
  scratchDir: ScratchDir
): Promise<ElectionDefinition> {
  const minimalBallotProps = groupBy(
    allBallotProps,
    (props) => props.ballotStyleId
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  ).map(([, [, props]]) => props!);

  const { electionDefinition } = await layOutBallotsAndCreateElectionDefinition(
    rendererPool,
    template,
    minimalBallotProps,
    electionSerializationOptions,
    systemSettings,
    scratchDir
  );

  return electionDefinition;
}

export function randomScratchFilePath(
  dir: ScratchDir,
  cfg: { extension: string }
): string {
  return path.join(dir.path, `${randomUUID()}.${cfg.extension}`);
}

/**
 * Writes to a new file in the given scratch dir and returns the resulting
 * file path.
 */
export async function writeScratchFile(
  dir: ScratchDir,
  p: {
    data: string | Buffer | Readable | Uint8Array;
    extension: string;
  }
): Promise<string> {
  const filePath = randomScratchFilePath(dir, p);
  await fs.writeFile(filePath, p.data);

  return filePath;
}

/**
 * Writes to a new file in the given scratch dir and returns the resulting
 * file path and a sha256 hash of the written contents.
 */
async function writeAndHashScratchFile(
  dir: ScratchDir,
  p: { data: Readable; extension: string }
): Promise<{ hash: string; path: string }> {
  const hashingStream = new HashingPassthrough(createHash('sha256'));

  const filePath = await writeScratchFile(dir, {
    data: p.data.pipe(hashingStream),
    extension: p.extension,
  });

  return {
    hash: hashingStream.digest('hex'),
    path: filePath,
  };
}
