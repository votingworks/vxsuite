import { electionSample } from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import { join } from 'path'
import { zipFile } from '../../test/util/zip'
import { readBallotPackage, BallotPackageManifest } from './ballot-package'

test('readBallotPackage finds all expected ballots', async () => {
  const file = new File(
    [
      await fs.readFile(
        join(
          __dirname,
          '../../test/fixtures/ballot-package-state-of-hamilton.zip'
        )
      ),
    ],
    'ballot-package-state-of-hamilton.zip'
  )
  const {
    ballots,
    electionDefinition: { election },
  } = await readBallotPackage(file)
  const ballotStyleIds = election.ballotStyles.map(({ id }) => id)
  const precinctIds = election.precincts.map(({ id }) => id)
  expect(election.title).toEqual('General Election')
  expect(election.state).toEqual('State of Hamilton')
  expect(ballots.length).toEqual(16)

  for (const { ballotConfig, pdf } of ballots) {
    expect(ballotStyleIds).toContain(ballotConfig.ballotStyleId)
    expect(precinctIds).toContain(ballotConfig.precinctId)
    expect(pdf).toBeInstanceOf(Buffer)
  }
})

test('readBallotPackage throws when an election.json is not present', async () => {
  const pkg = await zipFile({})
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package does not have a file called 'election.json': election-ballot-package.zip`
  )
})

test('readBallotPackage throws when an manifest.json is not present', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package does not have a file called 'manifest.json': election-ballot-package.zip`
  )
})

test('readBallotPackage throws when the manifest does not match ballots', async () => {
  const manifest: BallotPackageManifest = {
    ballots: [
      {
        ballotStyleId: '5',
        precinctId: '21',
        filename: 'test/election-deadbeef-whatever.pdf',
        contestIds: ['1', '2'],
        isLiveMode: false,
        locales: { primary: 'en-US' },
      },
    ],
  }
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'manifest.json': JSON.stringify(manifest),
  })

  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package is malformed; found 0 file(s) matching entries in the manifest ('manifest.json'), but the manifest has 1. perhaps this ballot package is using a different version of the software?`
  )
})

test('readBallotPackage throws when given an invalid zip file', async () => {
  await expect(
    readBallotPackage(new File(['not-a-zip'], 'election-ballot-package.zip'))
  ).rejects.toThrowError()
})

test('readBallotPackage throws when the file cannot be read', async () => {
  await expect(
    readBallotPackage(({} as unknown) as File)
  ).rejects.toThrowError()
})
