import { Candidate, Election, parseElection } from '@votingworks/ballot-encoder'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { table } from 'table'
import { OptionParseError } from '..'
import { Interpreter } from '../..'
import { DEFAULT_MARK_SCORE_VOTE_THRESHOLD } from '../../Interpreter'
import { Input, Interpreted } from '../../types'
import { loadImageData } from '../../utils/images'

export enum OutputFormat {
  JSON = 'json',
  Table = 'table',
}

export interface Options {
  election: Election
  autoInputs: readonly Input[]
  templateInputs: readonly Input[]
  ballotInputs: readonly Input[]
  markScoreVoteThreshold: number
  format: OutputFormat
}

function makeInputFromBallotArgument(arg: string): Input {
  const [ballotFile, metadataFile] = arg.split(':')
  const input: Input = {
    id: () => ballotFile,
    imageData: () => loadImageData(ballotFile),
    metadata: async () =>
      metadataFile
        ? JSON.parse(await fs.readFile(metadataFile, 'utf-8'))
        : undefined,
  }
  return input
}

export async function parseOptions(args: readonly string[]): Promise<Options> {
  let election: Election | undefined
  const autoInputs: Input[] = []
  const templateInputs: Input[] = []
  const ballotInputs: Input[] = []
  let markScoreVoteThreshold = DEFAULT_MARK_SCORE_VOTE_THRESHOLD
  let format = OutputFormat.Table

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    switch (arg) {
      case '-e':
      case '--election': {
        i += 1
        const electionJSONFile = args[i]

        if (!electionJSONFile || electionJSONFile.startsWith('-')) {
          throw new OptionParseError(
            `Expected election definition file after ${arg}, but got ${electionJSONFile}.`
          )
        }

        election = parseElection(
          JSON.parse(await fs.readFile(electionJSONFile, 'utf8'))
        )
        break
      }

      case '-m':
      case '--min-mark-score':
        i += 1
        markScoreVoteThreshold = parseFloat(args[i])
        if (isNaN(markScoreVoteThreshold)) {
          throw new OptionParseError(`Invalid minimum mark score: ${args[i]}`)
        }
        break

      case '-f':
      case '--format':
        i += 1
        format = args[i] as OutputFormat
        if (format !== OutputFormat.Table && format !== OutputFormat.JSON) {
          throw new OptionParseError(`Unknown output format: ${format}`)
        }
        break

      case '-t':
      case '--template': {
        i += 1
        const templateFile = args[i]

        if (!templateFile || templateFile.startsWith('-')) {
          throw new OptionParseError(
            `Expected template file after ${arg}, but got ${templateFile}`
          )
        }

        templateInputs.push(makeInputFromBallotArgument(templateFile))
        break
      }

      case '-b':
      case '--ballot': {
        i += 1
        const ballotFile = args[i]

        if (!ballotFile || ballotFile.startsWith('-')) {
          throw new OptionParseError(
            `Expected template file after ${arg}, but got ${ballotFile}`
          )
        }

        ballotInputs.push(makeInputFromBallotArgument(ballotFile))
        break
      }

      default: {
        if (arg.startsWith('-')) {
          throw new OptionParseError(`Unknown option: ${arg}`)
        }

        autoInputs.push(makeInputFromBallotArgument(arg))
        break
      }
    }
  }

  if (!election) {
    throw new OptionParseError(`Required option 'election' is missing.`)
  }

  return {
    election,
    autoInputs,
    templateInputs,
    ballotInputs,
    markScoreVoteThreshold,
    format,
  }
}

export default async function run(
  options: Options,
  stdin: typeof process.stdin,
  stdout: typeof process.stdout
): Promise<number> {
  const interpreter = new Interpreter({
    election: options.election,
    markScoreVoteThreshold: options.markScoreVoteThreshold,
  })
  const ballotInputs = [...options.ballotInputs]

  for (const templateInput of options.templateInputs) {
    await interpreter.addTemplate(
      await templateInput.imageData(),
      await templateInput.metadata?.()
    )
  }

  for (const autoInput of options.autoInputs) {
    const metadata = await autoInput.metadata?.()
    if (!(metadata && interpreter.canScanBallot(metadata))) {
      await interpreter.addTemplate(await autoInput.imageData(), metadata)
    } else {
      ballotInputs.push(autoInput)
    }
  }

  const results: { input: Input; interpreted: Interpreted }[] = []

  for (const ballotInput of ballotInputs) {
    results.push({
      input: ballotInput,
      interpreted: await interpreter.interpretBallot(
        await ballotInput.imageData(),
        await ballotInput.metadata?.()
      ),
    })
  }

  switch (options.format) {
    case OutputFormat.JSON:
      stdout.write(
        JSON.stringify(
          results.map(({ input, interpreted }) => ({
            input: input.id(),
            interpreted: {
              metadata: interpreted.metadata,
              votes: interpreted.ballot.votes,
              marks: interpreted.marks
                .filter((mark) =>
                  mark.type === 'candidate' || mark.type === 'yesno'
                    ? mark.score > 0
                    : true
                )
                .map((mark) =>
                  mark.type === 'candidate'
                    ? {
                        type: mark.type,
                        contest: mark.contest.id,
                        option: mark.option.id,
                        score: mark.score,
                        bounds: mark.bounds,
                        target: mark.target,
                      }
                    : mark.type === 'yesno'
                    ? {
                        type: mark.type,
                        contest: mark.contest.id,
                        option: mark.option,
                        score: mark.score,
                        bounds: mark.bounds,
                        target: mark.target,
                      }
                    : {
                        type: mark.type,
                        contest: mark.contest?.id,
                        option:
                          typeof mark.option === 'string'
                            ? mark.option
                            : mark.option?.id,
                        bounds: mark.bounds,
                      }
                ),
            },
          })),
          undefined,
          2
        )
      )
      break

    case OutputFormat.Table:
      stdout.write(
        table([
          [
            chalk.bold('Contest'),
            ...results.map(({ input }) => chalk.bold(input.id())),
          ],
          ...options.election.contests.map((contest) => [
            contest.title,
            ...results.map(({ interpreted }) => {
              const vote = interpreted.ballot.votes[contest.id]

              if (contest.type === 'candidate') {
                const candidates = vote as Candidate[] | undefined
                return (
                  candidates
                    ?.map(({ name, isWriteIn }) =>
                      isWriteIn ? chalk.italic(name) : name
                    )
                    .join(', ') ?? ''
                )
              } else {
                const yesnos = vote as ('yes' | 'no')[] | undefined
                return (
                  yesnos
                    ?.map((v) =>
                      v === 'yes'
                        ? chalk.green(v)
                        : v === 'no'
                        ? chalk.red(v)
                        : ''
                    )
                    .join(', ') ?? ''
                )
              }
            }),
          ]),
        ])
      )
      break
  }

  return 0
}
