import MemoryStream from 'memorystream'
import { Readable } from 'stream'
import { parseOptions, printHelp, run } from './help'

async function readStream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(chunks.join('')))
    stream.on('error', reject)
  })
}

test('prints usage examples to stdout', async () => {
  const stdout = new MemoryStream()
  run(
    { $0: 'hmpb-interpreter' },
    Readable.from('') as NodeJS.ReadStream,
    stdout as NodeJS.WriteStream
  )
  stdout.end()
  expect(await readStream(stdout)).toContain('hmpb-interpreter COMMAND')
})

test('expects an optional command', async () => {
  expect(
    await parseOptions({
      command: 'help',
      commandArgs: [],
      executablePath: 'hmpb-interpreter',
      nodePath: 'node',
      help: true,
    })
  ).toEqual({ $0: 'hmpb-interpreter', command: undefined })
  expect(
    await parseOptions({
      command: 'help',
      commandArgs: ['foo'],
      executablePath: 'hmpb-interpreter',
      nodePath: 'node',
      help: true,
    })
  ).toEqual({ $0: 'hmpb-interpreter', command: 'foo' })
})

test('help command help', () => {
  const stdout = new MemoryStream()

  printHelp({ $0: 'hmpb-interpret', command: 'help' }, stdout)
  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "Usage: hmpb-interpret help COMMAND

    Print usage information for COMMAND.
    "
  `)
})

test('interpret command help', () => {
  const stdout = new MemoryStream()

  printHelp({ $0: 'hmpb-interpret', command: 'interpret' }, stdout)
  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "hmpb-interpret interpret -e JSON IMG1 [IMG2 …]

    Examples

    # Interpret ballots based on a single template.
    hmpb-interpret interpret -e election.json -t template.png ballot*.png

    # Interpret test mode ballots.
    hmpb-interpret interpret -e election.json -T -t template.png ballot*.png

    # Interpret ballots to JSON.
    hmpb-interpret interpret -e election.json -f json template*.png ballot*.png

    # Specify image metadata (file:metdata-file).
    hmpb-interpret interpret -e election.json template1.png:template1-metadata.json template2.png:template2-metdata.json ballot1.png:ballot1-metadata.json

    # Set an explicit minimum mark score (0-1).
    hmpb-interpret interpret -e election.json -m 0.5 template*.png ballot*.png

    # Automatically process images as templates until all pages are found.
    hmpb-interpret interpret -e election.json image*.png
    "
  `)
})

test('layout command help', () => {
  const stdout = new MemoryStream()

  printHelp({ $0: 'hmpb-interpret', command: 'layout' }, stdout)
  expect(Buffer.from(stdout.read()).toString('utf-8')).toMatchInlineSnapshot(`
    "hmpb-interpret layout IMG1 [IMG2 …]

    Examples

    # Annotate layout for a single ballot page.
    hmpb-interpret layout ballot01.png

    # Annotate layout for many ballot pages.
    hmpb-interpret layout ballot*.png
    "
  `)
})

test('unknown command', () => {
  expect(() =>
    // @ts-expect-error - intentionally invalid command
    printHelp({ $0: 'hmpb-interpret', command: 'nope' }, new MemoryStream())
  ).toThrowError('unknown command: nope')
})
