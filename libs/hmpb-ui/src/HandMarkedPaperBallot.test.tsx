import { render } from '@testing-library/react'
import { electionSample } from '@votingworks/ballot-encoder'
import { sha256 } from 'js-sha256'
import React from 'react'
import { HandMarkedPaperBallot } from './HandMarkedPaperBallot'

test('renders using the title of the election', () => {
  const election = electionSample
  const ballotStyle = election.ballotStyles[0]
  const precinctId = ballotStyle.precincts[0]

  expect(
    render(
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyle.id}
        election={election}
        electionHash={sha256(JSON.stringify(election))}
        locales={{ primary: 'en-US' }}
        precinctId={precinctId}
        t={(key: string) => key}
        Trans={({ children }) => <React.Fragment>{children}</React.Fragment>}
      />
    ).getAllByText(election.title).length
  ).toBeGreaterThanOrEqual(1)
})
