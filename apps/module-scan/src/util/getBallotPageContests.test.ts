import { getBallotStyle, getContests } from '@votingworks/ballot-encoder'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import election from '../../test/fixtures/state-of-hamilton/election'
import { SerializableBallotPageLayout } from '../types'
import getBallotPageContests from './getBallotPageContests'

function metadataForPage(pageNumber: number): BallotPageMetadata {
  return {
    ballotStyleId: '12',
    precinctId: '23',
    isTestBallot: false,
    pageNumber,
    pageCount: 5,
    locales: { primary: 'en-US', secondary: 'es-US' },
  }
}
test('gets contests broken across pages according to the layout', () => {
  const ballotStyle = getBallotStyle({ ballotStyleId: '12', election })!
  const allContestsForBallot = getContests({ ballotStyle, election })
  const layouts = new Array(5)
    .fill(undefined)
    .map<SerializableBallotPageLayout>((_, i) => ({
      ballotImage: { metadata: metadataForPage(i) },
      contests: [
        {
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          corners: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          options: [],
        },
      ],
    }))

  for (let pageNumber = 1; pageNumber <= layouts.length; pageNumber++) {
    expect(
      getBallotPageContests(election, metadataForPage(pageNumber), layouts)
    ).toEqual(allContestsForBallot.slice(pageNumber - 1, pageNumber))
  }
})
