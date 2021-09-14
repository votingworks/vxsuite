import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  AdjudicationReason,
  BallotType,
  CandidateContest,
  getContests,
  HMPBBallotPageMetadata,
} from '@votingworks/types'
import { find } from '@votingworks/utils'
import React from 'react'
import renderInAppContext from '../../test/renderInAppContext'
import WriteInAdjudicationScreen from './WriteInAdjudicationScreen'

test('presents an adjudication workflow for write-ins', async () => {
  const { election } = electionSampleDefinition
  const ballotStyle = election.ballotStyles[0]
  const precinctId = ballotStyle.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const contest = find(
    contests,
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  )
  const metadata: HMPBBallotPageMetadata = {
    ballotStyleId: ballotStyle.id,
    precinctId,
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: true,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  }
  const onAdjudicationComplete = jest.fn()

  renderInAppContext(
    <WriteInAdjudicationScreen
      sheetId="test-sheet"
      side="front"
      imageURL="/test-sheet/front.jpg"
      interpretation={{
        type: 'InterpretedHmpbPage',
        markInfo: {
          ballotSize: { width: 1, height: 1 },
          marks: [],
        },
        metadata,
        adjudicationInfo: {
          requiresAdjudication: true,
          enabledReasons: [AdjudicationReason.WriteIn],
          allReasonInfos: [
            {
              type: AdjudicationReason.WriteIn,
              contestId: contest.id,
              optionId: '__write-in-0',
              optionIndex: 0,
            },
          ],
        },
        votes: {},
      }}
      layout={{
        ballotImage: { imageData: { width: 1, height: 1 }, metadata },
        contests: [
          {
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            corners: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
              { x: 0, y: 100 },
            ],
            options: [
              {
                bounds: { x: 0, y: 50, width: 100, height: 50 },
                target: {
                  bounds: { x: 20, y: 60, width: 20, height: 10 },
                  inner: { x: 22, y: 62, width: 16, height: 6 },
                },
              },
            ],
          },
        ],
      }}
      contestIds={[contest.id]}
      onAdjudicationComplete={onAdjudicationComplete}
    />
  )

  screen.getByText('Write-In Adjudication')
  screen.getByText(contest.title)

  userEvent.type(
    screen.getByTestId('write-in-input-__write-in-0'),
    'Lizard People'
  )

  expect(onAdjudicationComplete).not.toHaveBeenCalled()
  userEvent.click(screen.getByText('Save & Continue Scanning'))

  await waitFor(() => {
    expect(onAdjudicationComplete).toHaveBeenCalledWith('test-sheet', 'front', {
      [contest.id]: { '__write-in-0': 'Lizard People' },
    })
  })
})
