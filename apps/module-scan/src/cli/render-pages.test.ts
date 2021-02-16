import main from './render-pages'
import { WritableStream } from 'memory-streams'
import {
  election,
  ballotPdf,
} from '../../test/fixtures/choctaw-2020-09-22-f30480cc99'
import { promises as fs } from 'fs'
import { join } from 'path'
import { pathExists } from 'fs-extra'
import { tmpNameSync } from 'tmp'
import { loadImageData } from '../util/images'
import Store from '../store'
import { BallotType } from '@votingworks/types'
import { BallotMetadata } from '../types'

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

  for (const filename of ['ballot-p1.png', 'ballot-p2.png']) {
    const { width, height } = await loadImageData(join(tmpDir, filename))
    expect({ width, height }).toEqual({
      width: 1224,
      height: 1584,
    })
  }
  expect(await pathExists(join(tmpDir, 'ballot-p3.png'))).toBe(false)
})

test('generates one PNG image per PDF page per DB', async () => {
  const tmpDir = tmpNameSync()
  await fs.mkdir(tmpDir)
  const tmpDbPath = join(tmpDir, 'ballots.db')
  const store = await Store.fileStore(tmpDbPath)
  await store.setElection({
    election,
    electionData: JSON.stringify(election),
    electionHash: '',
  })
  const metadata: BallotMetadata = {
    ballotStyleId: '1',
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: false,
    locales: { primary: 'en-US' },
    precinctId: '6538',
  }
  await store.addHmpbTemplate(await fs.readFile(ballotPdf), metadata, [
    { ballotImage: { metadata: { ...metadata, pageNumber: 1 } }, contests: [] },
    { ballotImage: { metadata: { ...metadata, pageNumber: 2 } }, contests: [] },
  ])

  const stdout = fakeOutput()
  const stderr = fakeOutput()
  const code = await main([tmpDbPath], { stdout, stderr })
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: `📝 ${join(tmpDir, 'ballots-1-Bywy-LIVE-p1.png')}\n📝 ${join(
      tmpDir,
      'ballots-1-Bywy-LIVE-p2.png'
    )}\n`,
    stderr: '',
  })

  for (const filename of [
    'ballots-1-Bywy-LIVE-p1.png',
    'ballots-1-Bywy-LIVE-p2.png',
  ]) {
    const { width, height } = await loadImageData(join(tmpDir, filename))
    expect({ width, height }).toEqual({
      width: 1224,
      height: 1584,
    })
  }
  expect(await pathExists(join(tmpDir, 'ballots-1-Bywy-LIVE-p3.png'))).toBe(
    false
  )
})

test('fails with unknown file types', async () => {
  const stdout = fakeOutput()
  const stderr = fakeOutput()

  expect(await main(['ballots.txt'], { stdout, stderr })).toEqual(1)
  expect(stderr.toString()).toEqual(
    '✘ ballots.txt is not a known template container type\n'
  )
})

test('fails when a DB has no election', async () => {
  const stdout = fakeOutput()
  const stderr = fakeOutput()
  const tmpDir = tmpNameSync()
  await fs.mkdir(tmpDir)
  const store = await Store.fileStore(join(tmpDir, 'ballots.db'))

  expect(await main([store.dbPath], { stdout, stderr })).toEqual(1)
  expect(stderr.toString()).toEqual(
    `✘ ${store.dbPath} has no election definition\n`
  )
})
