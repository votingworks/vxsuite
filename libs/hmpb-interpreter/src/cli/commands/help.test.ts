import { run, parseOptions } from './help'
import { Readable } from 'stream'
import MemoryStream from 'memorystream'

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
