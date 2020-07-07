import { getBallotPath } from './election'
import { electionSample } from '@votingworks/ballot-encoder'

test('getBallotPath allows digits in file names', () => {
  expect(
    getBallotPath({
      election: electionSample,
      electionHash: 'd34db33f',
      ballotStyleId: '77',
      precinctId: '21',
      locales: { primary: 'en-US' },
      isLiveMode: true,
    })
  ).toEqual(
    'live/election-d34db33f-precinct-north-springfield-id-21-style-77-English.pdf'
  )
})
