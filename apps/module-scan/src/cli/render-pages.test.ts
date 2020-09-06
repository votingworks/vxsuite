import main from './render-pages'
import { WritableStream } from 'memory-streams'
import { ballotPdf } from '../../test/fixtures/choctaw-2020-09-22-02f807b005'
import { promises as fs } from 'fs'
import sharp from 'sharp'
import { join } from 'path'
import { pathExists } from 'fs-extra'
import { tmpNameSync } from 'tmp'

function fakeOutput(): WritableStream & NodeJS.WriteStream {
  return new WritableStream() as WritableStream & NodeJS.WriteStream
}

test('fails when given no PDF paths', async () => {
  const stderr = fakeOutput()
  expect(await main([], { stderr })).not.toEqual(0)
  expect(stderr.toString()).toContain('render-pages')
})

test('prints help when asked', async () => {
  const stdout = fakeOutput()
  const stderr = fakeOutput()
  const code = await main(['--help'], { stdout, stderr })
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: expect.stringContaining('render-pages'),
    stderr: '',
  })
})

test('generates one PNG image per PDF page', async () => {
  const tmpDir = tmpNameSync()
  await fs.mkdir(tmpDir)
  const tmpBallotPath = join(tmpDir, 'ballot.pdf')
  await fs.copyFile(ballotPdf, tmpBallotPath)

  const stdout = fakeOutput()
  const stderr = fakeOutput()
  const code = await main([tmpBallotPath], { stdout, stderr })
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: `📝 ${join(tmpDir, 'ballot-p1.png')}\n📝 ${join(
      tmpDir,
      'ballot-p2.png'
    )}\n`,
    stderr: '',
  })

  expect(await sharp(join(tmpDir, 'ballot-p1.png')).metadata()).toEqual(
    expect.objectContaining({
      width: 1224,
      height: 1584,
    })
  )
  expect(await sharp(join(tmpDir, 'ballot-p2.png')).metadata()).toEqual(
    expect.objectContaining({
      width: 1224,
      height: 1584,
    })
  )
  expect(await pathExists(join(tmpDir, 'ballot-p3.png'))).toBe(false)
})
