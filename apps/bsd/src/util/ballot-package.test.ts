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
  expect(ballot.file).toBeInstanceOf(Buffer)
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
