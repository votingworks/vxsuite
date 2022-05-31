import {
  BallotCandidateTargetMark,
  BallotIdSchema,
  BallotLocales,
  BallotMark,
  BallotMsEitherNeitherTargetMark,
  BallotPageContestOptionLayout,
  BallotPageLayout,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  BallotType,
  BallotYesNoTargetMark,
  Candidate,
  CandidateContest,
  CompletedBallot,
  Contests,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  MsEitherNeitherContest,
  Offset,
  Point,
  Rect,
  Size,
  TargetShape,
  unsafeParse,
  YesNoContest,
  YesNoOption,
} from '@votingworks/types';
import { assert, map, zip, zipMin } from '@votingworks/utils';
import makeDebug from 'debug';
import * as jsfeat from 'jsfeat';
import { inspect } from 'util';
import { v4 as uuid } from 'uuid';
import { getVotesFromMarks } from '../get_votes_from_marks';
import { findBallotLayoutCorrespondence } from '../hmpb/find_contests';
import {
  findContestsWithUnknownColumnLayout,
  interpretTemplate,
} from '../layout';
import { detect } from '../metadata';
import { FindMarksResult, Interpreted } from '../types';
import { binarize, PIXEL_BLACK, PIXEL_WHITE } from '../utils/binarize';
import { crop } from '../utils/crop';
import { defined } from '../utils/defined';
import { vh as flipVH } from '../utils/flip';
import { rectCorners } from '../utils/geometry';
import { countPixels, diff } from '../utils/jsfeat/diff';
import { matToImageData } from '../utils/jsfeat/mat_to_image_data';
import { readGrayscaleImage } from '../utils/jsfeat/read_grayscale_image';
import { KeyedMap } from '../utils/keyed_map';
import { offsets } from '../utils/offsets';
import { outline } from '../utils/outline';

const debug = makeDebug('ballot-interpreter-vx:Interpreter');

export interface Options {
  readonly electionDefinition: ElectionDefinition;
  readonly markScoreVoteThreshold?: number;
  readonly testMode?: boolean;
}

export const DEFAULT_MARK_SCORE_VOTE_THRESHOLD = 0.12;
export const WRITE_IN_REGION_UPWARD_SHIFT_HEIGHT_RATIO = 0.15;

type TemplateKey = Pick<
  BallotPageMetadata,
  'ballotStyleId' | 'precinctId' | 'locales' | 'pageNumber'
>;

/**
 * Interprets ballot images based on templates. A template is simply an empty
 * ballot and should be exactly what is given to a voter for them to mark.
 *
 * @example
 *
 * ```ts
 * const interpreter = new Interpreter(election)
 * await interpreter.addTemplate(templatePage1)
 * await interpreter.addTemplate(templatePage2)
 * console.log(await interpreter.interpretBallot(ballotPage1))
 * ```
 */
export class Interpreter {
  private readonly templates = new KeyedMap<
    [
      BallotLocales | undefined,
      BallotPageMetadata['ballotStyleId'],
      BallotPageMetadata['precinctId'],
      number
    ],
    BallotPageLayoutWithImage | undefined
  >(([locales, ballotStyleId, precinctId, pageNumber]) =>
    [
      locales?.primary,
      locales?.secondary,
      ballotStyleId,
      precinctId,
      pageNumber,
    ].join('-')
  );
  private readonly electionDefinition: ElectionDefinition;
  private readonly testMode: boolean;
  private readonly markScoreVoteThreshold: number;

  constructor(options: Options) {
    this.electionDefinition = options.electionDefinition;
    this.markScoreVoteThreshold =
      options.markScoreVoteThreshold ??
      this.electionDefinition.election.markThresholds?.definite ??
      DEFAULT_MARK_SCORE_VOTE_THRESHOLD;
    this.testMode = options.testMode ?? false;
  }

  /**
   * Adds a template so that this `Interpreter` will be able to scan ballots
   * printed from it. The template is an object describing the layout of the
   * ballot.
   */
  addTemplate(template: BallotPageLayoutWithImage): BallotPageLayoutWithImage {
    const effectiveMetadata = template.ballotPageLayout.metadata;

    if (effectiveMetadata.isTestMode !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot add templates with isTestMode=${effectiveMetadata.isTestMode}`
      );
    }

    this.setTemplate(effectiveMetadata, template);
    return template;
  }

  /**
   * Gets a template by ballot style, precinct, and page number if present.
   */
  private getTemplate({
    locales,
    ballotStyleId,
    precinctId,
    pageNumber,
  }: TemplateKey): BallotPageLayoutWithImage | undefined {
    return this.templates.get([locales, ballotStyleId, precinctId, pageNumber]);
  }

  /**
   * Sets a template by ballot style, precinct, and page number.
   */
  private setTemplate(
    { locales, ballotStyleId, precinctId, pageNumber }: TemplateKey,
    template: BallotPageLayoutWithImage
  ): void {
    this.templates.set(
      [locales, ballotStyleId, precinctId, pageNumber],
      template
    );
  }

  /**
   * Interprets an image as a template, returning the layout information read
   * from the image. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  async interpretTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayoutWithImage> {
    return interpretTemplate({
      electionDefinition: this.electionDefinition,
      imageData,
      metadata,
    });
  }

  /**
   * Determines whether enough of the template images have been added to allow
   * scanning a ballot with the given metadata.
   */
  canScanBallot(metadata: BallotPageMetadata): boolean {
    debug('canScanBallot metadata=%O', metadata);

    for (
      let pageNumber = 1;
      pageNumber <= metadata.pageNumber;
      pageNumber += 1
    ) {
      const pageTemplate = this.getTemplate({ ...metadata, pageNumber });
      if (!pageTemplate) {
        debug(
          'cannot scan ballot because template page %d is missing',
          pageNumber
        );
        return false;
      }

      if (
        pageNumber === metadata.pageNumber &&
        pageTemplate.ballotPageLayout.metadata.isTestMode !==
          metadata.isTestMode
      ) {
        debug(
          'cannot scan ballot because template page %d does not match the expected test ballot value (%s)',
          pageNumber,
          metadata.isTestMode
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Interprets an image as a ballot, returning information about the votes cast.
   */
  async interpretBallot(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    {
      flipped = false,
      markScoreVoteThreshold = this.markScoreVoteThreshold,
    } = {}
  ): Promise<Interpreted> {
    debug(
      'interpretBallot: looking in %d×%d image',
      imageData.width,
      imageData.height
    );
    const normalized = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata,
      {
        flipped,
      }
    );

    if (normalized.metadata.isTestMode !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot interpret ballots with isTestMode=${normalized.metadata.isTestMode}`
      );
    }

    debug('using metadata: %O', normalized.metadata);
    const marked = this.findMarks(normalized.imageData, normalized.metadata);
    const ballot = this.interpretMarks(marked, { markScoreVoteThreshold });
    return { ...marked, ballot };
  }

  private findMarks(
    imageData: ImageData,
    metadata: BallotPageMetadata
  ): FindMarksResult {
    debug(
      'looking for marks in %d×%d image',
      imageData.width,
      imageData.height
    );

    if (!this.canScanBallot(metadata)) {
      throw new Error(
        'Cannot scan ballot because not all required templates have been added'
      );
    }

    const { contests } = findContestsWithUnknownColumnLayout(imageData);
    const ballotLayout: BallotPageLayoutWithImage = {
      imageData,
      ballotPageLayout: {
        pageSize: {
          width: imageData.width,
          height: imageData.height,
        },
        metadata,
        contests: [
          ...map(contests, ({ bounds, corners }) => ({
            bounds,
            corners,
            options: [],
          })),
        ],
      },
    };
    debug(
      'found contest areas: %O',
      ballotLayout.ballotPageLayout.contests.map(({ bounds }) => bounds)
    );

    const { locales, ballotStyleId, precinctId, pageNumber } = metadata;
    const matchedTemplate = defined(
      this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber })
    );
    const [mappedBallot, marks] = this.getMarksForBallot(
      ballotLayout,
      matchedTemplate,
      this.getContestsForTemplate(matchedTemplate.ballotPageLayout)
    );

    return { matchedTemplate, mappedBallot, metadata, marks };
  }

  /**
   * Get the contests for the given template.
   */
  private getContestsForTemplate(template: BallotPageLayout): Contests {
    const {
      electionDefinition: { election },
    } = this;
    const { locales, ballotStyleId, pageNumber, precinctId } =
      template.metadata;
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId,
        election,
      })
    );

    let contestOffset = 0;
    for (let i = 1; i < pageNumber; i += 1) {
      const pageTemplate = defined(
        this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber: i })
      );
      contestOffset += pageTemplate.ballotPageLayout.contests.length;
    }

    return getContests({ ballotStyle, election }).slice(
      contestOffset,
      contestOffset + template.contests.length
    );
  }

  private interpretMarks(
    { marks, metadata }: FindMarksResult,
    {
      markScoreVoteThreshold = this.markScoreVoteThreshold,
    }: { markScoreVoteThreshold?: number }
  ): CompletedBallot {
    return {
      electionHash: metadata.electionHash,
      ballotId: unsafeParse(BallotIdSchema, uuid()),
      ballotStyleId: metadata.ballotStyleId,
      ballotType: BallotType.Standard,
      isTestMode: metadata.isTestMode,
      precinctId: metadata.precinctId,
      votes: getVotesFromMarks(this.electionDefinition.election, marks, {
        markScoreVoteThreshold,
      }),
    };
  }

  private async normalizeImageDataAndMetadata(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<{ imageData: ImageData; metadata: BallotPageMetadata }> {
    binarize(imageData);

    if (metadata) {
      if (flipped) {
        flipVH(imageData);
      }

      return { imageData, metadata };
    }

    const detectResult = await detect(this.electionDefinition, imageData);

    if (detectResult.flipped) {
      debug('detected image is flipped, correcting orientation');
      flipVH(imageData);
    }

    return { imageData, metadata: detectResult.metadata };
  }

  private getMarksForBallot(
    ballotLayout: BallotPageLayoutWithImage,
    template: BallotPageLayoutWithImage,
    contests: Contests
  ): [ImageData, BallotMark[]] {
    assert(
      template.ballotPageLayout.contests.length === contests.length,
      `template and election definition have different numbers of contests (${template.ballotPageLayout.contests.length} vs ${contests.length}); maybe the template is from an old version of the election definition?`
    );

    assert(
      ballotLayout.ballotPageLayout.contests.length === contests.length,
      `ballot and election definition have different numbers of contests (${ballotLayout.ballotPageLayout.contests.length} vs ${contests.length}); maybe the ballot is from an old version of the election definition?`
    );

    const correspondence = findBallotLayoutCorrespondence(
      contests,
      ballotLayout.ballotPageLayout,
      template.ballotPageLayout
    );

    assert(
      correspondence.corresponds,
      `ballot and template contest shapes do not correspond: ${inspect(
        correspondence,
        undefined,
        null
      )}`
    );

    const mappedBallot = this.mapBallotOntoTemplate(
      ballotLayout,
      template.ballotPageLayout,
      { leftSideOnly: false }
    );
    const marks: BallotMark[] = [];

    const addCandidateMark = (
      contest: CandidateContest,
      layout: BallotPageContestOptionLayout,
      option: Candidate
    ): void => {
      let writeInTextScore: BallotCandidateTargetMark['writeInTextScore'];

      if (option.isWriteIn) {
        writeInTextScore = this.writeInTextScore(
          template.imageData,
          mappedBallot,
          layout,
          contest,
          option
        );
      }

      const { score, offset } = this.targetMarkScore(
        template.imageData,
        mappedBallot,
        layout.target
      );
      debug(`'${option.id}' mark score: %d`, score);
      const mark: BallotCandidateTargetMark = {
        type: 'candidate',
        bounds: layout.target.bounds,
        contestId: contest.id,
        optionId: option.id,
        score,
        scoredOffset: offset,
        target: layout.target,
        writeInTextScore,
      };
      marks.push(mark);
    };

    const addYesNoMark = (
      contest: YesNoContest,
      layout: BallotPageContestOptionLayout,
      optionId: 'yes' | 'no'
    ): void => {
      const { score, offset } = this.targetMarkScore(
        template.imageData,
        mappedBallot,
        layout.target
      );
      debug(`'${optionId}' mark score: %d`, score);
      const mark: BallotYesNoTargetMark = {
        type: 'yesno',
        bounds: layout.target.bounds,
        contestId: contest.id,
        optionId,
        score,
        scoredOffset: offset,
        target: layout.target,
      };
      marks.push(mark);
    };

    const addEitherNeitherMark = (
      contest: MsEitherNeitherContest,
      layout: BallotPageContestOptionLayout,
      option: YesNoOption
    ): void => {
      const { score, offset } = this.targetMarkScore(
        template.imageData,
        mappedBallot,
        layout.target
      );
      debug(
        `'${
          option === contest.eitherOption
            ? 'either'
            : option === contest.neitherOption
            ? 'neither'
            : option === contest.firstOption
            ? 'first'
            : 'second'
        }' mark score: %d`,
        score
      );
      const mark: BallotMsEitherNeitherTargetMark = {
        type: 'ms-either-neither',
        bounds: layout.target.bounds,
        contestId: contest.id,
        optionId: option.id,
        score,
        scoredOffset: offset,
        target: layout.target,
      };
      marks.push(mark);
    };

    for (const [{ options }, contest] of zip(
      template.ballotPageLayout.contests,
      contests
    )) {
      debug(`getting marks for %s contest '%s'`, contest.type, contest.id);

      if (contest.type === 'candidate') {
        const expectedOptions =
          contest.candidates.length +
          (contest.allowWriteIns ? contest.seats : 0);

        if (options.length !== expectedOptions) {
          throw new Error(
            `Contest ${contest.id} is supposed to have ${expectedOptions} options(s), but found ${options.length}.`
          );
        }

        for (const [layout, candidate] of zipMin(options, contest.candidates)) {
          addCandidateMark(contest, layout, candidate);
        }

        if (contest.allowWriteIns) {
          const writeInOptions = options.slice(contest.candidates.length);

          for (const [index, layout] of writeInOptions.entries()) {
            addCandidateMark(contest, layout, {
              id: `write-in-${index}`,
              name: 'Write-In',
              isWriteIn: true,
            });
          }
        }
      } else if (contest.type === 'ms-either-neither') {
        if (options.length !== 4) {
          throw new Error(
            `Contest ${contest.id} is supposed to have four options (either/neither/first/second), but found ${options.length}.`
          );
        }

        const [eitherLayout, neitherLayout, firstLayout, secondLayout] =
          options;
        addEitherNeitherMark(contest, eitherLayout, contest.eitherOption);
        addEitherNeitherMark(contest, neitherLayout, contest.neitherOption);
        addEitherNeitherMark(contest, firstLayout, contest.firstOption);
        addEitherNeitherMark(contest, secondLayout, contest.secondOption);
      } else {
        if (options.length !== 2) {
          throw new Error(
            `Contest ${contest.id} is supposed to have two options (yes/no), but found ${options.length}.`
          );
        }

        const [yesLayout, noLayout] = options;
        addYesNoMark(contest, yesLayout, 'yes');
        addYesNoMark(contest, noLayout, 'no');
      }
    }

    return [mappedBallot, marks];
  }

  private targetMarkScore(
    template: ImageData,
    ballot: ImageData,
    target: TargetShape,
    {
      zeroScoreThreshold = 0,
      highScoreThreshold = 0.25,
      maximumCorrectionPixelsX = 2,
      maximumCorrectionPixelsY = 2,
    } = {}
  ): { offset: Offset; score: number } {
    debug(
      'computing target mark score for target at (x=%d, y=%d) with zero threshold %d and high threshold %d',
      target.inner.x,
      target.inner.y,
      zeroScoreThreshold,
      highScoreThreshold
    );

    let bestMatchNewTemplatePixels: number | undefined;
    let bestMatchOffset: Offset | undefined;
    let bestMatchScore: number | undefined;
    const templateTarget = outline(crop(template, target.bounds));
    const templateTargetInner = outline(crop(template, target.inner));

    binarize(templateTarget);
    binarize(templateTargetInner);

    const templatePixelCountAvailableToFill = countPixels(templateTargetInner, {
      color: PIXEL_WHITE,
    });

    for (const { x, y } of offsets()) {
      const xOver = Math.abs(x) > maximumCorrectionPixelsX;
      const yOver = Math.abs(y) > maximumCorrectionPixelsY;

      if (xOver && yOver) {
        break;
      }

      if (xOver || yOver) {
        continue;
      }

      const offsetTargetInner: Rect = {
        ...target.inner,
        x: target.inner.x + x,
        y: target.inner.y + y,
      };
      const newBallotPixels = diff(
        templateTarget,
        ballot,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        },
        offsetTargetInner
      );
      const newTemplatePixels = diff(
        ballot,
        templateTarget,
        offsetTargetInner,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        }
      );
      const ballotTargetInnerNewBlackPixelCount = countPixels(newBallotPixels, {
        color: PIXEL_BLACK,
      });
      const score =
        ballotTargetInnerNewBlackPixelCount / templatePixelCountAvailableToFill;
      const newTemplatePixelsCount = countPixels(newTemplatePixels);

      if (
        typeof bestMatchNewTemplatePixels === 'undefined' ||
        newTemplatePixelsCount < bestMatchNewTemplatePixels
      ) {
        bestMatchNewTemplatePixels = newTemplatePixelsCount;
        bestMatchOffset = { x, y };
        bestMatchScore = score;
      }
    }

    debug(
      'using score %d from best template match (%d new template pixels) at offset (x=%d, y=%d)',
      bestMatchScore,
      bestMatchNewTemplatePixels,
      bestMatchOffset?.x,
      bestMatchOffset?.y
    );
    assert(
      typeof bestMatchScore === 'number' && typeof bestMatchOffset === 'object'
    );

    return { score: bestMatchScore, offset: bestMatchOffset };
  }

  private writeInTextScore(
    template: ImageData,
    ballot: ImageData,
    layout: BallotPageContestOptionLayout,
    contest: CandidateContest,
    candidate: Candidate
  ): number {
    const writeInRegion: Rect = {
      x: layout.target.bounds.x + layout.target.bounds.width,
      y:
        layout.bounds.y -
        Math.round(
          layout.bounds.height * WRITE_IN_REGION_UPWARD_SHIFT_HEIGHT_RATIO
        ),
      width: layout.bounds.width - layout.target.bounds.width,
      height: layout.bounds.height,
    };

    debug(
      'contest=%s/candidate=%s checking region for write-in text: %o',
      contest.id,
      candidate.id,
      writeInRegion
    );

    const templateWriteInRegionImage = outline(
      outline(crop(template, writeInRegion))
    );
    const scannedWriteInRegionImage = crop(ballot, writeInRegion);

    binarize(templateWriteInRegionImage);
    binarize(scannedWriteInRegionImage);

    const newScannedPixels = diff(
      templateWriteInRegionImage,
      scannedWriteInRegionImage
    );
    const newScannedPixelsCount = countPixels(newScannedPixels);
    const totalRegionPixelCount = writeInRegion.width * writeInRegion.height;
    const score = newScannedPixelsCount / totalRegionPixelCount;

    debug(
      'contest=%s/candidate=%s computed write-in text score: %d (%d / %d pixels)',
      contest.id,
      candidate.id,
      score,
      newScannedPixelsCount,
      totalRegionPixelCount
    );

    return score;
  }

  private mapImageWithPoints(
    imageMat: jsfeat.matrix_t,
    mappedSize: Size,
    fromPoints: Point[],
    toPoints: Point[]
  ): ImageData {
    const mappedImage = new jsfeat.matrix_t(
      mappedSize.width,
      mappedSize.height,
      jsfeat.U8C1_t
    );

    if (fromPoints.length === 0) {
      // Nothing to guide mapping, so all we actually want to do is resize.
      // Note also that jsfeat generates a blank image if we try to do a warp
      // perspective with a homography containing no points.
      jsfeat.imgproc.resample(
        imageMat,
        mappedImage,
        mappedSize.width,
        mappedSize.height
      );
    } else {
      const homography = new jsfeat.motion_model.homography2d();
      const transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t);

      homography.run(toPoints, fromPoints, transform, toPoints.length);
      jsfeat.imgproc.warp_perspective(imageMat, mappedImage, transform, 255);
    }

    return matToImageData(mappedImage);
  }

  private mapBallotOntoTemplate(
    ballot: BallotPageLayoutWithImage,
    template: BallotPageLayout,
    { leftSideOnly }: { leftSideOnly: boolean }
  ): ImageData {
    const ballotMat = readGrayscaleImage(ballot.imageData);
    const templateSize = template.pageSize;
    const ballotPoints: Point[] = [];
    const templatePoints: Point[] = [];

    for (const [
      { corners: ballotContestCorners },
      { bounds: templateContestBounds },
    ] of zip(ballot.ballotPageLayout.contests, template.contests)) {
      const [
        ballotTopLeft,
        ballotTopRight,
        ballotBottomLeft,
        ballotBottomRight,
      ] = ballotContestCorners;
      const [
        templateTopLeft,
        templateTopRight,
        templateBottomLeft,
        templateBottomRight,
      ] = rectCorners(templateContestBounds);

      if (leftSideOnly) {
        ballotPoints.push(ballotTopLeft, ballotBottomLeft);
        templatePoints.push(templateTopLeft, templateBottomLeft);
      } else {
        ballotPoints.push(
          ballotTopLeft,
          ballotTopRight,
          ballotBottomLeft,
          ballotBottomRight
        );
        templatePoints.push(
          templateTopLeft,
          templateTopRight,
          templateBottomLeft,
          templateBottomRight
        );
      }
    }

    const result = this.mapImageWithPoints(
      ballotMat,
      templateSize,
      ballotPoints,
      templatePoints
    );
    binarize(result);
    return result;
  }
}
