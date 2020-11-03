import React from 'react'
import { HandMarkedPaperBallotProps } from '../HandMarkedPaperBallot'

const HandMarkedPaperBallot: React.FC<HandMarkedPaperBallotProps> = ({
  ballotStyleId,
  election,
  precinctId,
  onRendered,
}) => {
  if (onRendered) {
    setImmediate(onRendered)
  }

  return (
    <div>
      <h1>Mocked HMPB</h1>
      Election: {election.title}
      <br />
      Ballot Style {ballotStyleId}, precinct {precinctId}.
    </div>
  )
}

export default HandMarkedPaperBallot
