import {
  BallotType,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  VotesDict,
} from '@votingworks/ballot-encoder'
import { strictEqual } from 'assert'
import * as jsfeat from 'jsfeat'
import { v4 as uuid } from 'uuid'
import findContestOptions from './hmpb/findContestOptions'
import findContests from './hmpb/findContests'
import findTargets from './hmpb/findTargets'
import { addVote } from './hmpb/votes'
import { DecodeQRCode, detect } from './metadata'
import {
  BallotPageLayout,
  BallotPageMetadata,
  InterpretedBallot,
  Rect,
} from './types'
import defined from './utils/defined'
import { rectPoints } from './utils/geometry'
import { map, reversed, zip, zipMin } from './utils/iterators'
import { diffImagesScore } from './utils/jsfeat/diff'
import matToImageData from './utils/jsfeat/matToImageData'
import readGrayscaleImage from './utils/jsfeat/readGrayscaleImage'

export interface Options {
  readonly election: Election
  decodeQRCode?: DecodeQRCode
}

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
  private election: Election
  private decodeQRCode?: DecodeQRCode

  public constructor(election: Election)
  public constructor(options: Options)
  public constructor(optionsOrElection: Options | Election) {
    if ('election' in optionsOrElection) {
      this.election = optionsOrElection.election
      this.decodeQRCode = optionsOrElection.decodeQRCode
    } else {
      this.election = optionsOrElection
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
    metadata =
      metadata ?? (await detect(imageData, { decodeQRCode: this.decodeQRCode }))
    const grayscale = readGrayscaleImage(imageData)
    const contests = findContestOptions([
      ...map(findContests(grayscale), ({ bounds }) => ({
        bounds,
        targets: [
          ...map(
            reversed(findTargets(grayscale, bounds)),
            ({ bounds }) => bounds
          ),
        ],
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
    metadata?: BallotPageMetadata
  ): Promise<InterpretedBallot> {
    if (this.hasMissingTemplates()) {
      throw new Error(
        'Refusing to interpret ballots before all templates are added.'
      )
    }

    metadata =
      metadata ?? (await detect(imageData, { decodeQRCode: this.decodeQRCode }))
    const ballotMat = readGrayscaleImage(imageData)
    const contests = findContests(ballotMat)
    const ballotLayout: BallotPageLayout = {
      ballotImage: { imageData, metadata },
      contests: [...map(contests, ({ bounds }) => ({ bounds, options: [] }))],
    }

    const { election } = this
    const { ballotStyleId, pageNumber, precinctId } = metadata
    const templatesForBallotStyle = this.templates.get(ballotStyleId) ?? []
    const matchedTemplate = defined(templatesForBallotStyle[pageNumber - 1])
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId,
        election,
      })
    )
    const precinct = defined(
      getPrecinctById({
        precinctId,
        election,
      })
    )
    const contestOffset = templatesForBallotStyle
      .slice(0, pageNumber - 1)
      .reduce(
        (offset, template) => offset + (template?.contests.length ?? 0),
        0
      )
    const votes = this.getVotesForBallot(
      ballotLayout,
      matchedTemplate,
      getContests({ ballotStyle, election }).slice(
        contestOffset,
        contestOffset + matchedTemplate.contests.length
      )
    )

    const ballot: CompletedBallot = {
      ballotId: uuid(),
      ballotStyle,
      ballotType: BallotType.Standard,
      election: this.election,
      isTestBallot: false,
      precinct,
      votes,
    }

    return { matchedTemplate, ballot }
  }

  private getVotesForBallot(
    ballotLayout: BallotPageLayout,
    template: BallotPageLayout,
    contests: Contests
  ): VotesDict {
    const mappedBallot = this.mapBallotOntoTemplate(ballotLayout, template)
    const templateMat = readGrayscaleImage(template.ballotImage.imageData)
    const ballotMat = readGrayscaleImage(mappedBallot)
    const votes: VotesDict = {}

    strictEqual(template.contests.length, contests.length)

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
          if (this.isTargetMarked(ballotMat, templateMat, option.target)) {
            addVote(votes, contest, candidate)
          }
        }

        if (contest.allowWriteIns) {
          const writeInOptions = options.slice(contest.candidates.length)

          for (const writeInOption of writeInOptions) {
            if (
              this.isTargetMarked(ballotMat, templateMat, writeInOption.target)
            ) {
              addVote(votes, contest, {
                id: '__write-in',
                name: 'Write-In',
                isWriteIn: true,
              })
            }
          }
        }
      } else {
        if (options.length !== 2) {
          throw new Error(
            `Contest ${contest.id} is supposed to have two options (yes/no), but found ${options.length}.`
          )
        }

        const [yesOption, noOption] = options
        const yesMarked = this.isTargetMarked(
          ballotMat,
          templateMat,
          yesOption.target
        )
        const noMarked = this.isTargetMarked(
          ballotMat,
          templateMat,
          noOption.target
        )

        if (yesMarked && noMarked) {
          // TODO: communicate this overvote somehow
        } else if (yesMarked || noMarked) {
          addVote(votes, contest, yesMarked ? 'yes' : 'no')
        }
      }
    }

    return votes
  }

  private isTargetMarked(
    ballotMat: jsfeat.matrix_t,
    templateMat: jsfeat.matrix_t,
    target: Rect,
    { threshold = 0.3 } = {}
  ): boolean {
    const score = diffImagesScore(ballotMat, templateMat, target, target)

    return score >= threshold
  }

  private mapBallotOntoTemplate(
    ballot: BallotPageLayout,
    template: BallotPageLayout
  ): ImageData {
    const ballotMat = readGrayscaleImage(ballot.ballotImage.imageData)
    const templateMat = readGrayscaleImage(template.ballotImage.imageData)
    const ballotPoints = []
    const templatePoints = []

    for (const [
      { bounds: ballotContestBounds },
      { bounds: templateContestBounds },
    ] of zip(ballot.contests, template.contests)) {
      ballotPoints.push(...rectPoints(ballotContestBounds))
      templatePoints.push(...rectPoints(templateContestBounds))
    }

    const homography = new jsfeat.motion_model.homography2d()
    const transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)

    homography.run(templatePoints, ballotPoints, transform, ballotPoints.length)

    const mappedImage = new jsfeat.matrix_t(
      templateMat.cols,
      templateMat.rows,
      jsfeat.U8C1_t
    )
    jsfeat.imgproc.warp_perspective(ballotMat, mappedImage, transform, 255)

    return matToImageData(mappedImage)
  }
}
