import { electionSample } from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import { join } from 'path'
import { zipFile } from '../../test/util/zip'
import { readBallotPackage } from './ballot-package'

test('readBallotPackage finds all expected ballots', async () => {
  const file = new File(
    [
      await fs.readFile(
        join(__dirname, '../../test/fixtures/ballot-package-dallas-county.zip')
      ),
    ],
    'ballot-package-dallas-county.zip'
  )
  const { ballots, election } = await readBallotPackage(file)
  expect(election.title).toEqual('General Election')
  expect(election.state).toEqual('State of Texas')
  expect(ballots.length).toEqual(1)

  const [ballot] = ballots
  expect(ballot.ballotStyle.id).toEqual('77')
  expect(ballot.precinct.id).toEqual('42')
  expect(ballot.live).toBeInstanceOf(Buffer)
  expect(ballot.test).toBeInstanceOf(Buffer)
})

test('readBallotPackage throws when an election.json is not present', async () => {
  const pkg = await zipFile({})
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package does not have a file called 'election.json': election-ballot-package.zip (size=22)`
  )
})

test('readBallotPackage throws when a PDF not matching the file pattern is found', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'unexpected.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    'ballot package is malformed: PDF file name does not follow the expected format: unexpected.pdf'
  )
})

test('readBallotPackage throws when a live ballot is missing', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'test/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    'ballot package is malformed: some ballots do not have both live and test types: (12, 23)'
  )
})

test('readBallotPackage throws given an invalid ballot type first', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'life/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package is malformed: invalid ballot type 'life' for ballot style id=12 and precinct id=23`
  )
})

test('readBallotPackage throws given an invalid ballot type second', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'live/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
    'life/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package is malformed: invalid ballot type 'life' for ballot style id=12 and precinct id=23`
  )
})

test('readBallotPackage throws given duplicates of a live ballot', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'live/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
    'live/election-deadbeef-precinct-centre-springfield-id-23-style-12.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package is malformed: duplicate live ballot found with ballot style id=12 and precinct id=23`
  )
})

test('readBallotPackage throws given duplicates of a test ballot', async () => {
  const pkg = await zipFile({
    'election.json': JSON.stringify(electionSample),
    'test/election-deadbeef-precinct-center-springfield-id-23-style-12.pdf': Buffer.of(),
    'test/election-deadbeef-precinct-centre-springfield-id-23-style-12.pdf': Buffer.of(),
  })
  await expect(
    readBallotPackage(new File([pkg], 'election-ballot-package.zip'))
  ).rejects.toThrowError(
    `ballot package is malformed: duplicate test ballot found with ballot style id=12 and precinct id=23`
  )
})
