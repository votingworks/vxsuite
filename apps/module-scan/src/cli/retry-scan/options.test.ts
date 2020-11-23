import { DiffWhen, parseOptions } from './options'

test('understands -h and --help', () => {
  expect(parseOptions(['-h'])).toEqual(expect.objectContaining({ help: true }))
  expect(parseOptions(['--help'])).toEqual(
    expect.objectContaining({ help: true })
  )
})

test('fails when no arguments are provided', () => {
  expect(() => parseOptions([])).toThrowError('no filters provided')
})

test('fails when no an unknown option is provided', () => {
  expect(() => parseOptions(['--foo'])).toThrowError('unexpected option: --foo')
})

test('can include unreadables', () => {
  expect(parseOptions(['--unreadable'])).toEqual(
    expect.objectContaining({ unreadable: true })
  )
})

test('can include uninterpreted', () => {
  expect(parseOptions(['--uninterpreted'])).toEqual(
    expect.objectContaining({ uninterpreted: true })
  )
})

test('can exclude unreadables', () => {
  expect(parseOptions(['--no-unreadable'])).toEqual(
    expect.objectContaining({ unreadable: false })
  )
})

test('can exclude uninterpreted', () => {
  expect(parseOptions(['--no-uninterpreted'])).toEqual(
    expect.objectContaining({ uninterpreted: false })
  )
})

test('can do no filtering with --all', () => {
  expect(parseOptions(['--all'])).toEqual(
    expect.objectContaining({ all: true })
  )
})

test('can filter by sheet id', () => {
  expect(parseOptions(['abcd', 'efgh'])).toEqual(
    expect.objectContaining({ sheetIds: ['abcd', 'efgh'] })
  )
})

test('can filter by sheet id and unreadable', () => {
  expect(parseOptions(['abcd', 'efgh', '--unreadable'])).toEqual(
    expect.objectContaining({ sheetIds: ['abcd', 'efgh'], unreadable: true })
  )
})

test('can configure when a diff is printed', () => {
  expect(parseOptions(['--diff-when', 'always', '--all'])).toEqual(
    expect.objectContaining({ diffWhen: DiffWhen.Always })
  )
  expect(parseOptions(['--diff-when', 'never', '--all'])).toEqual(
    expect.objectContaining({ diffWhen: DiffWhen.Never })
  )
  expect(parseOptions(['--diff-when', 'same-type', '--all'])).toEqual(
    expect.objectContaining({ diffWhen: DiffWhen.SameType })
  )
})

test('defaults to --diff-when same-type', () => {
  expect(parseOptions(['--all'])).toEqual(
    parseOptions(['--all', '-d', 'same-type'])
  )
})

test('can change the input database with --db', () => {
  expect(parseOptions(['--all', '--db', '/path/to/sqlite.db'])).toEqual(
    expect.objectContaining({ dbPath: '/path/to/sqlite.db' })
  )
})

test('can set an output database with --out-db', () => {
  expect(parseOptions(['--all', '--out-db', '/path/to/sqlite.db'])).toEqual(
    expect.objectContaining({ outDbPath: '/path/to/sqlite.db' })
  )
})
