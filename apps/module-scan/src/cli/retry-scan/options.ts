import { join } from 'path'

export enum DiffWhen {
  Always = 'always',
  Never = 'never',
  SameType = 'same-type',
}

export interface Options {
  dbPath: string
  sheetIds?: string[]
  all?: boolean
  unreadable?: boolean
  uninterpreted?: boolean
  diffWhen: DiffWhen
  help?: boolean
}

export function parseOptions(args: readonly string[]): Options {
  const sheetIds: string[] = []
  let unreadable: boolean | undefined
  let uninterpreted: boolean | undefined
  let all: boolean | undefined
  let diffWhen = DiffWhen.SameType
  let help: boolean | undefined
  let dbPath = join(__dirname, '../../../ballots.db')

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--db') {
      dbPath = args[++i]
      if (!dbPath || dbPath.startsWith('-')) {
        throw new Error(
          `expected a path after ${arg} but got ${dbPath || 'nothing'}`
        )
      }
    } else if (arg === '--unreadable' || arg === '--no-unreadable') {
      unreadable = arg === '--unreadable'
    } else if (arg === '--uninterpreted' || arg === '--no-uninterpreted') {
      uninterpreted = arg === '--uninterpreted'
    } else if (arg === '--all') {
      all = true
    } else if (arg === '-d' || arg === '--diff-when') {
      diffWhen = args[++i] as DiffWhen
      if (!Object.values(DiffWhen).includes(diffWhen)) {
        throw new Error(`invalid value for ${arg}: ${diffWhen || 'nothing'}`)
      }
    } else if (arg === '-h' || arg === '--help') {
      help = true
    } else if (arg.startsWith('-')) {
      throw new Error(`unexpected option: ${arg}`)
    } else {
      sheetIds.push(arg)
    }
  }

  if (help) {
    return {
      all,
      dbPath,
      sheetIds,
      uninterpreted,
      unreadable,
      diffWhen,
      help,
    }
  }

  if (all) {
    if (
      typeof unreadable !== 'undefined' ||
      typeof uninterpreted !== 'undefined' ||
      sheetIds.length > 0
    ) {
      throw new Error(
        `cannot provide 'all' option with any of the other filters`
      )
    }

    return {
      dbPath,
      all,
      sheetIds: [],
      uninterpreted,
      unreadable,
      diffWhen,
      help,
    }
  }

  if (
    sheetIds.length === 0 &&
    typeof unreadable === 'undefined' &&
    typeof uninterpreted === 'undefined'
  ) {
    throw new Error(`no filters provided; did you want '--all'?`)
  }

  return { dbPath, all, sheetIds, unreadable, uninterpreted, diffWhen, help }
}
