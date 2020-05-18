import { promises as fs } from 'fs'
import { join } from 'path'
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
