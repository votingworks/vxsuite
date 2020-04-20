import { Election, Candidate } from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import { OptionParseError } from '..'
import { Input, InterpretedBallot } from '../../types'
import { Interpreter } from '../..'
import { table } from 'table'
import chalk from 'chalk'
import { readImageData } from '../../utils/readImageData'

export enum OutputFormat {
  JSON = 'json',
  Table = 'table',
}

export interface Options {
  election: Election
  autoInputs: readonly Input[]
  templateInputs: readonly Input[]
  ballotInputs: readonly Input[]
  format: OutputFormat
}

export async function parseOptions(args: readonly string[]): Promise<Options> {
  let election: Election | undefined
  const autoInputs: Input[] = []
  const templateInputs: Input[] = []
  const ballotInputs: Input[] = []
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

        election = JSON.parse(await fs.readFile(electionJSONFile, 'utf8'))
        break
      }

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

        templateInputs.push({
          id: () => templateFile,
          imageData: () => readImageData(templateFile),
        })
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

        ballotInputs.push({
          id: () => ballotFile,
          imageData: () => readImageData(ballotFile),
        })
        break
      }

      default: {
        if (arg.startsWith('-')) {
          throw new OptionParseError(`Unknown option: ${arg}`)
        }

        autoInputs.push({
          id: () => arg,
          imageData: () => readImageData(arg),
        })
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
    format: format,
  }
}

export default async function run(
  options: Options,
  stdin: typeof process.stdin,
  stdout: typeof process.stdout
): Promise<number> {
  const interpreter = new Interpreter(options.election)
  const ballotInputs = [...options.ballotInputs]

  for (const templateInput of options.templateInputs) {
    interpreter.addTemplate(await templateInput.imageData())
  }

  for (const autoInput of options.autoInputs) {
    if (interpreter.hasMissingTemplates()) {
      await interpreter.addTemplate(await autoInput.imageData())
    } else {
      ballotInputs.push(autoInput)
    }
  }

  const results: { input: Input; interpreted: InterpretedBallot }[] = []

  for (const ballotInput of ballotInputs) {
    results.push({
      input: ballotInput,
      interpreted: await interpreter.interpretBallot(
        await ballotInput.imageData()
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
              votes: interpreted.ballot.votes,
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
                return vote === 'yes'
                  ? chalk.green(vote)
                  : vote === 'no'
                  ? chalk.red(vote)
                  : ''
              }
            }),
          ]),
        ])
      )
      break
  }

  return 0
}
