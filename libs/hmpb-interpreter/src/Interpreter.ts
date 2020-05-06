import {
  BallotType,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
} from '@votingworks/ballot-encoder'
import { strict as assert } from 'assert'
import * as jsfeat from 'jsfeat'
import { v4 as uuid } from 'uuid'
import getVotesFromMarks from './getVotesFromMarks'
import findContestOptions from './hmpb/findContestOptions'
import findContests from './hmpb/findContests'
import findTargets, { TargetShape } from './hmpb/findTargets'
import { detect } from './metadata'
import {
  BallotCandidateTargetMark,
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  BallotYesNoTargetMark,
  DetectQRCode,
  FindMarksResult,
  Interpreted,
  Point,
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
import outline from './utils/outline'

export interface Options {
  readonly election: Election
  readonly detectQRCode?: DetectQRCode
  readonly markScoreVoteThreshold?: number

  /** @deprecated */
  decodeQRCode?: DetectQRCode
}

export const DEFAULT_MARK_SCORE_VOTE_THRESHOLD = 0.2

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
  private templates = new Map<
    BallotPageMetadata['ballotStyleId'],
    (BallotPageLayout | undefined)[]
  >()
  private readonly election: Election
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
        DEFAULT_MARK_SCORE_VOTE_THRESHOLD
    } else {
      this.election = optionsOrElection
      this.markScoreVoteThreshold = DEFAULT_MARK_SCORE_VOTE_THRESHOLD
    }
  }

  /**
   * Adds a template so that this `Interpreter` will be able to scan ballots
   * printed from it. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async addTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  public async addTemplate(
    template: BallotPageLayout
  ): Promise<BallotPageLayout>
  public async addTemplate(
    imageDataOrTemplate: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    const template =
      'data' in imageDataOrTemplate
        ? await this.interpretTemplate(imageDataOrTemplate, metadata)
        : imageDataOrTemplate
    const templates =
      this.templates.get(template.ballotImage.metadata.ballotStyleId) ??
      new Array(template.ballotImage.metadata.pageCount)
    templates[template.ballotImage.metadata.pageNumber - 1] = template
    this.templates.set(template.ballotImage.metadata.ballotStyleId, templates)
    return template
  }

  /**
   * Interprets an image as a template, returning the layout information read
   * from the image. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async interpretTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata
    ))

    const contests = findContestOptions([
      ...map(findContests(imageData), ({ bounds, corners }) => ({
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

  /**
   * Determines whether there are any templates missing, i.e. the existing
   * templates do not account for all contests in all ballot styles.
   */
  public hasMissingTemplates(): boolean {
    for (const ballotStyle of this.election.ballotStyles) {
      const templates = this.templates.get(ballotStyle.id)

      if (!templates) {
        return true
      }

      for (const template of templates) {
        if (!template) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Interprets an image as a ballot, returning information about the votes cast.
   */
  public async interpretBallot(
    imageData: ImageData,
    { metadata }: { metadata?: BallotPageMetadata } = {}
  ): Promise<Interpreted> {
    const marked = await this.findMarks(imageData, metadata)
    const ballot = this.interpretMarks(marked)
    return { ...marked, ballot }
  }

  private async findMarks(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<FindMarksResult> {
    if (this.hasMissingTemplates()) {
      throw new Error(
        'Refusing to interpret ballots before all templates are added.'
      )
    }

    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata
    ))

    const contests = findContests(imageData)
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

    const { election } = this
    const { ballotStyleId, pageNumber } = metadata
    const templatesForBallotStyle = this.templates.get(ballotStyleId) ?? []
    const matchedTemplate = defined(templatesForBallotStyle[pageNumber - 1])
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId,
        election,
      })
    )
    const contestOffset = templatesForBallotStyle
      .slice(0, pageNumber - 1)
      .reduce(
        (offset, template) => offset + (template?.contests.length ?? 0),
        0
      )
    const marks = this.getMarksForBallot(
      ballotLayout,
      matchedTemplate,
      getContests({ ballotStyle, election }).slice(
        contestOffset,
        contestOffset + matchedTemplate.contests.length
      )
    )

    return { matchedTemplate, metadata, marks }
  }

  private interpretMarks({
    marks,
    metadata,
  }: FindMarksResult): CompletedBallot {
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
      election,
      isTestBallot: metadata.isTestBallot,
      precinct,
      votes: getVotesFromMarks(marks, {
        markScoreVoteThreshold: this.markScoreVoteThreshold,
      }),
    }
  }

  private async normalizeImageDataAndMetadata(
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<{ imageData: ImageData; metadata: BallotPageMetadata }> {
    binarize(imageData)

    if (metadata) {
      return { imageData, metadata }
    }

    const detectResult = await detect(imageData, {
      detectQRCode: this.detectQRCode,
    })
    metadata = detectResult.metadata
    if (detectResult.flipped) {
      flipVH(imageData)
    }

    return { imageData, metadata }
  }

  private getMarksForBallot(
    ballotLayout: BallotPageLayout,
    template: BallotPageLayout,
    contests: Contests
  ): BallotMark[] {
    const mappedBallot = this.mapBallotOntoTemplate(ballotLayout, template)
    const marks: BallotMark[] = []

    assert.equal(template.contests.length, contests.length)

    for (const [{ options }, contest] of zip(template.contests, contests)) {
      if (contest.type === 'candidate') {
        const expectedOptions =
          contest.candidates.length +
          (contest.allowWriteIns ? contest.seats : 0)

        if (options.length !== expectedOptions) {
          throw new Error(
            `Contest ${contest.id} is supposed to have ${expectedOptions} options(s), but found ${options.length}.`
          )
        }

        for (const [option, candidate] of zipMin(options, contest.candidates)) {
          const score = this.targetMarkScore(
            template.ballotImage.imageData,
            mappedBallot,
            option.target
          )
          const mark: BallotCandidateTargetMark = {
            type: 'candidate',
            bounds: option.target.bounds,
            contest,
            score,
            target: option.target,
            option: candidate,
          }
          marks.push(mark)
        }

        if (contest.allowWriteIns) {
          const writeInOptions = options.slice(contest.candidates.length)

          for (const writeInOption of writeInOptions) {
            const score = this.targetMarkScore(
              template.ballotImage.imageData,
              mappedBallot,
              writeInOption.target
            )
            const mark: BallotCandidateTargetMark = {
              type: 'candidate',
              bounds: writeInOption.target.bounds,
              contest,
              score,
              target: writeInOption.target,
              option: {
                id: '__write-in',
                name: 'Write-In',
                isWriteIn: true,
              },
            }
            marks.push(mark)
          }
        }
      } else {
        if (options.length !== 2) {
          throw new Error(
            `Contest ${contest.id} is supposed to have two options (yes/no), but found ${options.length}.`
          )
        }

        const [yesOption, noOption] = options
        const yesScore = this.targetMarkScore(
          template.ballotImage.imageData,
          mappedBallot,
          yesOption.target
        )
        const yesMark: BallotYesNoTargetMark = {
          type: 'yesno',
          bounds: yesOption.target.bounds,
          contest,
          option: 'yes',
          score: yesScore,
          target: yesOption.target,
        }
        marks.push(yesMark)

        const noScore = this.targetMarkScore(
          template.ballotImage.imageData,
          mappedBallot,
          noOption.target
        )
        const noMark: BallotYesNoTargetMark = {
          type: 'yesno',
          bounds: noOption.target.bounds,
          contest,
          option: 'yes',
          score: noScore,
          target: noOption.target,
        }
        marks.push(noMark)
      }
    }

    return marks
  }

  private targetMarkScore(
    template: ImageData,
    ballot: ImageData,
    target: TargetShape
  ): number {
    const offsetAndScore = new Map<Point, number>()
    const templateTarget = outline(crop(template, target.bounds))
    const templateTargetInner = outline(crop(template, target.inner))
    const templatePixelCountAvailableToFill = countPixels(templateTargetInner, {
      color: PIXEL_WHITE,
    })

    for (const { x, y } of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const offsetTargetInner = {
        ...target.inner,
        x: target.inner.x + x,
        y: target.inner.y + y,
      }
      const diffImageInner = diff(
        templateTarget,
        ballot,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        },
        offsetTargetInner
      )
      const ballotTargetInnerNewBlackPixelCount = countPixels(diffImageInner, {
        color: PIXEL_BLACK,
      })
      offsetAndScore.set(
        { x, y },
        ballotTargetInnerNewBlackPixelCount / templatePixelCountAvailableToFill
      )
    }
    const [[, minScore]] = [...offsetAndScore].sort(([, a], [, b]) => a - b)
    return minScore
  }

  private mapImageWithPoints(
    imageMat: jsfeat.matrix_t,
    mappedSize: Size,
    fromPoints: Point[],
    toPoints: Point[]
  ): ImageData {
    const homography = new jsfeat.motion_model.homography2d()
    const transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)

    homography.run(toPoints, fromPoints, transform, toPoints.length)

    const mappedImage = new jsfeat.matrix_t(
      mappedSize.width,
      mappedSize.height,
      jsfeat.U8C1_t
    )
    jsfeat.imgproc.warp_perspective(imageMat, mappedImage, transform, 255)

    return matToImageData(mappedImage)
  }

  private mapBallotOntoTemplate(
    ballot: BallotPageLayout,
    template: BallotPageLayout
  ): ImageData {
    const ballotMat = readGrayscaleImage(ballot.ballotImage.imageData)
    const templateSize = {
      width: template.ballotImage.imageData.width,
      height: template.ballotImage.imageData.height,
    }
    const ballotPoints: Point[] = []
    const templatePoints: Point[] = []

    for (const [
      { bounds: ballotContestBounds },
      { bounds: templateContestBounds },
    ] of zip(ballot.contests, template.contests)) {
      ballotPoints.push(...rectCorners(ballotContestBounds))
      templatePoints.push(...rectCorners(templateContestBounds))
    }

    return this.mapImageWithPoints(
      ballotMat,
      templateSize,
      ballotPoints,
      templatePoints
    )
  }
}
