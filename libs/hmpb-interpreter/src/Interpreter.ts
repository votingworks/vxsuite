import {
  BallotType,
  Candidate,
  CandidateContest,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  MsEitherNeitherContest,
  YesNoContest,
  YesNoOption,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import makeDebug from 'debug'
import * as jsfeat from 'jsfeat'
import { inspect } from 'util'
import { v4 as uuid } from 'uuid'
import getVotesFromMarks from './getVotesFromMarks'
import findContestOptions from './hmpb/findContestOptions'
import findContests, {
  ContestShape,
  findBallotLayoutCorrespondance,
} from './hmpb/findContests'
import findTargets, { TargetShape } from './hmpb/findTargets'
import { detect } from './metadata'
import {
  BallotCandidateTargetMark,
  BallotLocales,
  BallotMark,
  BallotMsEitherNeitherTargetMark,
  BallotPageContestOptionLayout,
  BallotPageLayout,
  BallotPageMetadata,
  BallotYesNoTargetMark,
  DetectQRCode,
  FindMarksResult,
  Interpreted,
  Offset,
  Point,
  Rect,
  Size,
} from './types'
import { binarize, PIXEL_BLACK, PIXEL_WHITE } from './utils/binarize'
import crop from './utils/crop'
import defined from './utils/defined'
import { vh as flipVH } from './utils/flip'
import { rectCorners } from './utils/geometry'
import { map, reversed, zip, zipMin } from './utils/iterators'
import diff, { countPixels } from './utils/jsfeat/diff'
import matToImageData from './utils/jsfeat/matToImageData'
import readGrayscaleImage from './utils/jsfeat/readGrayscaleImage'
import KeyedMap from './utils/KeyedMap'
import offsets from './utils/offsets'
import outline from './utils/outline'

const debug = makeDebug('hmpb-interpreter:Interpreter')

export interface Options {
  readonly election: Election
  readonly detectQRCode?: DetectQRCode
  readonly markScoreVoteThreshold?: number
  readonly testMode?: boolean

  /** @deprecated */
  decodeQRCode?: DetectQRCode
}

export const DEFAULT_MARK_SCORE_VOTE_THRESHOLD = 0.12

type TemplateKey = Pick<
  BallotPageMetadata,
  'ballotStyleId' | 'precinctId' | 'locales' | 'pageNumber'
>

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
export default class Interpreter {
  private templates = new KeyedMap<
    [
      BallotLocales | undefined,
      BallotPageMetadata['ballotStyleId'],
      BallotPageMetadata['precinctId'],
      number
    ],
    BallotPageLayout | undefined
  >(([locales, ballotStyleId, precinctId, pageNumber]) =>
    [
      locales?.primary,
      locales?.secondary,
      ballotStyleId,
      precinctId,
      pageNumber,
    ].join('-')
  )
  private readonly election: Election
  private readonly testMode: boolean
  private readonly detectQRCode?: DetectQRCode
  private readonly markScoreVoteThreshold: number

  public constructor(election: Election)
  public constructor(options: Options)
  public constructor(optionsOrElection: Options | Election) {
    if ('election' in optionsOrElection) {
      this.election = optionsOrElection.election
      this.detectQRCode =
        optionsOrElection.detectQRCode ?? optionsOrElection.decodeQRCode
      this.markScoreVoteThreshold =
        optionsOrElection.markScoreVoteThreshold ??
        this.election.markThresholds?.definite ??
        DEFAULT_MARK_SCORE_VOTE_THRESHOLD
      this.testMode = optionsOrElection.testMode ?? false
    } else {
      this.election = optionsOrElection
      this.markScoreVoteThreshold =
        this.election.markThresholds?.definite ??
        DEFAULT_MARK_SCORE_VOTE_THRESHOLD
      this.testMode = false
    }
  }

  /**
   * Adds a template so that this `Interpreter` will be able to scan ballots
   * printed from it. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async addTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped }?: { flipped?: boolean }
  ): Promise<BallotPageLayout>
  public async addTemplate(
    template: BallotPageLayout
  ): Promise<BallotPageLayout>
  public async addTemplate(
    imageDataOrTemplate: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata,
    { flipped }: { flipped?: boolean } = {}
  ): Promise<BallotPageLayout> {
    const template =
      'data' in imageDataOrTemplate
        ? await this.interpretTemplate(imageDataOrTemplate, metadata, {
            flipped,
          })
        : imageDataOrTemplate
    if (!metadata) {
      metadata = template.ballotImage.metadata
    }

    if (metadata.isTestMode !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot add templates with isTestMode=${metadata.isTestMode}`
      )
    }

    this.setTemplate(metadata, template)
    return template
  }

  /**
   * Gets a template by ballot style, precinct, and page number if present.
   */
  private getTemplate({
    locales,
    ballotStyleId,
    precinctId,
    pageNumber,
  }: TemplateKey): BallotPageLayout | undefined {
    return this.templates.get([locales, ballotStyleId, precinctId, pageNumber])
  }

  /**
   * Sets a template by ballot style, precinct, and page number.
   */
  private setTemplate(
    { locales, ballotStyleId, precinctId, pageNumber }: TemplateKey,
    template: BallotPageLayout
  ): void {
    this.templates.set(
      [locales, ballotStyleId, precinctId, pageNumber],
      template
    )
  }

  /**
   * Interprets an image as a template, returning the layout information read
   * from the image. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async interpretTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<BallotPageLayout> {
    debug(
      'interpretTemplate: looking for contests in %d×%d image',
      imageData.width,
      imageData.height
    )
    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata,
      {
        flipped,
      }
    ))

    debug('using metadata for template: %O', metadata)

    const contests = findContestOptions([
      ...map(this.findContests(imageData).contests, ({ bounds, corners }) => ({
        bounds,
        corners,
        targets: [...reversed(findTargets(imageData, bounds))],
      })),
    ])

    return {
      ballotImage: { imageData, metadata },
      contests,
    }
  }

  private findContests(
    imageData: ImageData
  ): { contests: ContestShape[]; columns: number } {
    // Try three columns, i.e. candidate pages.
    const shapesWithThreeColumns = [
      ...findContests(imageData, {
        columns: [true, true, true],
      }),
    ]

    if (shapesWithThreeColumns.length > 0) {
      return { contests: shapesWithThreeColumns, columns: 3 }
    }

    // Try two columns, i.e. measure pages.
    return {
      contests: [
        ...findContests(imageData, {
          columns: [true, true],
        }),
      ],
      columns: 2,
    }
  }

  /**
   * Determines whether enough of the template images have been added to allow
   * scanning a ballot with the given metadata.
   */
  public canScanBallot(metadata: BallotPageMetadata): boolean {
    debug('canScanBallot metadata=%O', metadata)

    for (
      let pageNumber = 1;
      pageNumber <= metadata.pageNumber;
      pageNumber += 1
    ) {
      const pageTemplate = this.getTemplate({ ...metadata, pageNumber })
      if (!pageTemplate) {
        debug(
          'cannot scan ballot because template page %d is missing',
          pageNumber
        )
        return false
      }

      if (
        pageNumber === metadata.pageNumber &&
        pageTemplate.ballotImage.metadata.isTestMode !== metadata.isTestMode
      ) {
        debug(
          'cannot scan ballot because template page %d does not match the expected test ballot value (%s)',
          pageNumber,
          metadata.isTestMode
        )
        return false
      }
    }

    return true
  }

  /**
   * Interprets an image as a ballot, returning information about the votes cast.
   */
  public async interpretBallot(
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
    )
    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata,
      {
        flipped,
      }
    ))

    if (metadata.isTestMode !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot interpret ballots with isTestMode=${metadata.isTestMode}`
      )
    }

    debug('using metadata: %O', metadata)
    const marked = await this.findMarks(imageData, metadata)
    const ballot = this.interpretMarks(marked, { markScoreVoteThreshold })
    return { ...marked, ballot }
  }

  private async findMarks(
    imageData: ImageData,
    metadata: BallotPageMetadata
  ): Promise<FindMarksResult> {
    debug('looking for marks in %d×%d image', imageData.width, imageData.height)

    if (!this.canScanBallot(metadata)) {
      throw new Error(
        'Cannot scan ballot because not all required templates have been added'
      )
    }

    const { contests } = this.findContests(imageData)
    const ballotLayout: BallotPageLayout = {
      ballotImage: { imageData, metadata },
      contests: [
        ...map(contests, ({ bounds, corners }) => ({
          bounds,
          corners,
          options: [],
        })),
      ],
    }
    debug(
      'found contest areas: %O',
      ballotLayout.contests.map(({ bounds }) => bounds)
    )

    const { locales, ballotStyleId, precinctId, pageNumber } = metadata
    const matchedTemplate = defined(
      this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber })
    )
    const [mappedBallot, marks] = this.getMarksForBallot(
      ballotLayout,
      matchedTemplate,
      this.getContestsForTemplate(matchedTemplate)
    )

    return { matchedTemplate, mappedBallot, metadata, marks }
  }

  /**
   * Get the contests for the given template.
   */
  private getContestsForTemplate(template: BallotPageLayout): Contests {
    const { election } = this
    const {
      locales,
      ballotStyleId,
      pageNumber,
      precinctId,
    } = template.ballotImage.metadata
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId,
        election,
      })
    )

    let contestOffset = 0
    for (let i = 1; i < pageNumber; i += 1) {
      const pageTemplate = defined(
        this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber: i })
      )
      contestOffset += pageTemplate.contests.length
    }

    return getContests({ ballotStyle, election }).slice(
      contestOffset,
      contestOffset + template.contests.length
    )
  }

  private interpretMarks(
    { marks, metadata }: FindMarksResult,
    {
      markScoreVoteThreshold = this.markScoreVoteThreshold,
    }: { markScoreVoteThreshold?: number }
  ): CompletedBallot {
    const { election } = this
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId: metadata.ballotStyleId,
        election,
      })
    )
    const precinct = defined(
      getPrecinctById({
        election,
        precinctId: metadata.precinctId,
      })
    )
    return {
      ballotId: uuid(),
      ballotStyle,
      ballotType: BallotType.Standard,
      isTestMode: metadata.isTestMode,
      precinct,
      votes: getVotesFromMarks(marks, { markScoreVoteThreshold }),
    }
  }

  private async normalizeImageDataAndMetadata(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<{ imageData: ImageData; metadata: BallotPageMetadata }> {
    binarize(imageData)

    if (metadata) {
      if (flipped) {
        flipVH(imageData)
      }
    } else {
      const detectResult = await detect(this.election, imageData, {
        detectQRCode: this.detectQRCode,
      })
      metadata = detectResult.metadata
      if (detectResult.flipped) {
        debug('detected image is flipped, correcting orientation')
        flipVH(imageData)
      }
    }

    return { imageData, metadata }
  }

  private getMarksForBallot(
    ballotLayout: BallotPageLayout,
    template: BallotPageLayout,
    contests: Contests
  ): [ImageData, BallotMark[]] {
    assert.equal(
      template.contests.length,
      contests.length,
      `template and election definition have different numbers of contests (${template.contests.length} vs ${contests.length}); maybe the template is from an old version of the election definition?`
    )

    assert.equal(
      ballotLayout.contests.length,
      contests.length,
      `ballot and election definition have different numbers of contests (${ballotLayout.contests.length} vs ${contests.length}); maybe the ballot is from an old version of the election definition?`
    )

    const correspondance = findBallotLayoutCorrespondance(
      contests,
      ballotLayout,
      template
    )

    assert(
      correspondance.corresponds,
      `ballot and template contest shapes do not correspond: ${inspect(
        correspondance,
        undefined,
        null
      )}`
    )

    const mappedBallot = this.mapBallotOntoTemplate(ballotLayout, template, {
      leftSideOnly: false,
    })
    const marks: BallotMark[] = []

    const addCandidateMark = (
      contest: CandidateContest,
      layout: BallotPageContestOptionLayout,
      option: Candidate
    ): void => {
      const { score, offset } = this.targetMarkScore(
        template.ballotImage.imageData,
        mappedBallot,
        layout.target
      )
      debug(`'${option.id}' mark score: %d`, score)
      const mark: BallotCandidateTargetMark = {
        type: 'candidate',
        bounds: layout.target.bounds,
        contest,
        option,
        score,
        scoredOffset: offset,
        target: layout.target,
      }
      marks.push(mark)
    }

    const addYesNoMark = (
      contest: YesNoContest,
      layout: BallotPageContestOptionLayout,
      option: 'yes' | 'no'
    ): void => {
      const { score, offset } = this.targetMarkScore(
        template.ballotImage.imageData,
        mappedBallot,
        layout.target
      )
      debug(`'${option}' mark score: %d`, score)
      const mark: BallotYesNoTargetMark = {
        type: 'yesno',
        bounds: layout.target.bounds,
        contest,
        option,
        score,
        scoredOffset: offset,
        target: layout.target,
      }
      marks.push(mark)
    }

    const addEitherNeitherMark = (
      contest: MsEitherNeitherContest,
      layout: BallotPageContestOptionLayout,
      option: YesNoOption
    ): void => {
      const { score, offset } = this.targetMarkScore(
        template.ballotImage.imageData,
        mappedBallot,
        layout.target
      )
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
      )
      const mark: BallotMsEitherNeitherTargetMark = {
        type: 'ms-either-neither',
        bounds: layout.target.bounds,
        contest,
        option,
        score,
        scoredOffset: offset,
        target: layout.target,
      }
      marks.push(mark)
    }

    for (const [{ options }, contest] of zip(template.contests, contests)) {
      debug(`getting marks for %s contest '%s'`, contest.type, contest.id)

      if (contest.type === 'candidate') {
        const expectedOptions =
          contest.candidates.length +
          (contest.allowWriteIns ? contest.seats : 0)

        if (options.length !== expectedOptions) {
          throw new Error(
            `Contest ${contest.id} is supposed to have ${expectedOptions} options(s), but found ${options.length}.`
          )
        }

        for (const [layout, candidate] of zipMin(options, contest.candidates)) {
          addCandidateMark(contest, layout, candidate)
        }

        if (contest.allowWriteIns) {
          const writeInOptions = options.slice(contest.candidates.length)

          for (const [index, layout] of writeInOptions.entries()) {
            addCandidateMark(contest, layout, {
              id: `__write-in-${index}`,
              name: 'Write-In',
              isWriteIn: true,
            })
          }
        }
      } else if (contest.type === 'ms-either-neither') {
        if (options.length !== 4) {
          throw new Error(
            `Contest ${contest.id} is supposed to have four options (either/neither/first/second), but found ${options.length}.`
          )
        }

        const [eitherLayout, neitherLayout, firstLayout, secondLayout] = options
        addEitherNeitherMark(contest, eitherLayout, contest.eitherOption)
        addEitherNeitherMark(contest, neitherLayout, contest.neitherOption)
        addEitherNeitherMark(contest, firstLayout, contest.firstOption)
        addEitherNeitherMark(contest, secondLayout, contest.secondOption)
      } else {
        if (options.length !== 2) {
          throw new Error(
            `Contest ${contest.id} is supposed to have two options (yes/no), but found ${options.length}.`
          )
        }

        const [yesLayout, noLayout] = options
        addYesNoMark(contest, yesLayout, 'yes')
        addYesNoMark(contest, noLayout, 'no')
      }
    }

    return [mappedBallot, marks]
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
    )

    let bestMatchNewTemplatePixels: number | undefined
    let bestMatchOffset: Offset | undefined
    let bestMatchScore: number | undefined
    const templateTarget = outline(crop(template, target.bounds))
    const templateTargetInner = outline(crop(template, target.inner))

    binarize(templateTarget)
    binarize(templateTargetInner)

    const templatePixelCountAvailableToFill = countPixels(templateTargetInner, {
      color: PIXEL_WHITE,
    })

    for (const { x, y } of offsets()) {
      const xOver = Math.abs(x) > maximumCorrectionPixelsX
      const yOver = Math.abs(y) > maximumCorrectionPixelsY

      if (xOver && yOver) {
        break
      }

      if (xOver || yOver) {
        continue
      }

      const offsetTargetInner: Rect = {
        ...target.inner,
        x: target.inner.x + x,
        y: target.inner.y + y,
      }
      const newBallotPixels = diff(
        templateTarget,
        ballot,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        },
        offsetTargetInner
      )
      const newTemplatePixels = diff(
        ballot,
        templateTarget,
        offsetTargetInner,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        }
      )
      const ballotTargetInnerNewBlackPixelCount = countPixels(newBallotPixels, {
        color: PIXEL_BLACK,
      })
      const score =
        ballotTargetInnerNewBlackPixelCount / templatePixelCountAvailableToFill
      const newTemplatePixelsCount = countPixels(newTemplatePixels)

      if (
        typeof bestMatchNewTemplatePixels === 'undefined' ||
        newTemplatePixelsCount < bestMatchNewTemplatePixels
      ) {
        bestMatchNewTemplatePixels = newTemplatePixelsCount
        bestMatchOffset = { x, y }
        bestMatchScore = score
      }
    }

    debug(
      'using score %d from best template match (%d new template pixels) at offset (x=%d, y=%d)',
      bestMatchScore,
      bestMatchNewTemplatePixels,
      bestMatchOffset?.x,
      bestMatchOffset?.y
    )
    assert(
      typeof bestMatchScore === 'number' && typeof bestMatchOffset === 'object'
    )

    return { score: bestMatchScore, offset: bestMatchOffset }
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
    )

    if (fromPoints.length === 0) {
      // Nothing to guide mapping, so all we actually want to do is resize.
      // Note also that jsfeat generates a blank image if we try to do a warp
      // perspective with a homography containing no points.
      jsfeat.imgproc.resample(
        imageMat,
        mappedImage,
        mappedSize.width,
        mappedSize.height
      )
    } else {
      const homography = new jsfeat.motion_model.homography2d()
      const transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)

      homography.run(toPoints, fromPoints, transform, toPoints.length)
      jsfeat.imgproc.warp_perspective(imageMat, mappedImage, transform, 255)
    }

    return matToImageData(mappedImage)
  }

  private mapBallotOntoTemplate(
    ballot: BallotPageLayout,
    template: BallotPageLayout,
    { leftSideOnly }: { leftSideOnly: boolean }
  ): ImageData {
    const ballotMat = readGrayscaleImage(ballot.ballotImage.imageData)
    const templateSize = {
      width: template.ballotImage.imageData.width,
      height: template.ballotImage.imageData.height,
    }
    const ballotPoints: Point[] = []
    const templatePoints: Point[] = []

    for (const [
      { corners: ballotContestCorners },
      { bounds: templateContestBounds },
    ] of zip(ballot.contests, template.contests)) {
      const [
        ballotTopLeft,
        ballotTopRight,
        ballotBottomLeft,
        ballotBottomRight,
      ] = ballotContestCorners
      const [
        templateTopLeft,
        templateTopRight,
        templateBottomLeft,
        templateBottomRight,
      ] = rectCorners(templateContestBounds)

      if (leftSideOnly) {
        ballotPoints.push(ballotTopLeft, ballotBottomLeft)
        templatePoints.push(templateTopLeft, templateBottomLeft)
      } else {
        ballotPoints.push(
          ballotTopLeft,
          ballotTopRight,
          ballotBottomLeft,
          ballotBottomRight
        )
        templatePoints.push(
          templateTopLeft,
          templateTopRight,
          templateBottomLeft,
          templateBottomRight
        )
      }
    }

    const result = this.mapImageWithPoints(
      ballotMat,
      templateSize,
      ballotPoints,
      templatePoints
    )
    binarize(result)
    return result
  }
}
