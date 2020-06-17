import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { BallotMark } from '@votingworks/hmpb-interpreter'
import Prose from '../components/Prose'
import { Ballot } from '../config/types'
import fetchJSON from '../util/fetchJSON'

function markKey(mark: BallotMark): string | undefined {
  if (mark.type === 'candidate') {
    return mark.option.id
  }

  if (mark.type === 'yesno') {
    return mark.option
  }
}

export default function BallotScreen() {
  const { batchId, ballotId } = useParams<{
    batchId?: string
    ballotId?: string
  }>()
  const [ballot, setBallot] = useState<Ballot>()

  useEffect(() => {
    if (!ballot) {
      fetchJSON<Ballot>(`/scan/batch/${batchId}/ballot/${ballotId}`).then(
        setBallot
      )
    }
  }, [ballot, batchId, ballotId, setBallot])

  return (
    <React.Fragment>
      <Prose maxWidth={false}>
        <h1>
          <Link to={`/batch/${batchId}`}>Batch {batchId}</Link> / Ballot{' '}
          {ballotId}
        </h1>
        <div style={{ position: 'relative' }}>
          <img
            src={`/scan/batch/${batchId}/ballot/${ballotId}/image`}
            alt="Scanned Ballot"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: ballot?.marks?.ballotSize.width,
              height: ballot?.marks?.ballotSize.height,
            }}
          />
          {ballot?.marks?.marks.map((mark, i) => (
            <div
              key={`${mark.contest?.id}-${markKey(mark) ?? i}`}
              title={`Mark - ${mark.contest?.id ?? 'unknown'}`}
              style={{
                position: 'absolute',
                left: mark.bounds.x,
                top: mark.bounds.y,
                width: mark.bounds.width,
                height: mark.bounds.height,
                backgroundColor:
                  mark.type === 'stray'
                    ? '#ff000066'
                    : mark.score >= 0.7
                    ? '#00ff0066'
                    : mark.score >= 0.1
                    ? '#ffff0066'
                    : '#00000066',
              }}
            />
          ))}
        </div>
      </Prose>
    </React.Fragment>
  )
}
