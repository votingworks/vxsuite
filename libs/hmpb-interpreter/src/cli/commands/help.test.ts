import run, { parseOptions } from './help'
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
  run({}, Readable.from('') as NodeJS.ReadStream, stdout as NodeJS.WriteStream)
  stdout.end()
  expect(await readStream(stdout)).toContain('Examples')
})

test('does not expect any arguments', async () => {
  expect(await parseOptions([])).toEqual({})
  await expect(parseOptions(['foo'])).rejects.toThrowError(
    `Unexpected argument to 'help': foo`
  )
})
