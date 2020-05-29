import election from '../../../test/fixtures/election-4e31cb17d8f2f3bac574c6d2f6e22fb2528dcdf8-ballot-style-77-precinct-oaklawn-branch-library/election'
import { parseOptions } from './interpret'
import { join } from 'path'

test('parse options: --election', async () => {
  expect(
    await parseOptions([
      '--election',
      join(
        __dirname,
        '../../../test/fixtures/election-4e31cb17d8f2f3bac574c6d2f6e22fb2528dcdf8-ballot-style-77-precinct-oaklawn-branch-library/election.json'
      ),
    ])
  ).toEqual(
    expect.objectContaining({
      election,
    })
  )

  expect(
    await parseOptions([
      '-e',
      join(
        __dirname,
        '../../../test/fixtures/election-4e31cb17d8f2f3bac574c6d2f6e22fb2528dcdf8-ballot-style-77-precinct-oaklawn-branch-library/election.json'
      ),
    ])
  ).toEqual(
    expect.objectContaining({
      election,
    })
  )
})
