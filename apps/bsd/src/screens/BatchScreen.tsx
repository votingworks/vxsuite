import React, { useState, useEffect } from 'react'
import { useHistory, useParams, Link } from 'react-router-dom'
import Prose from '../components/Prose'
import Table from '../components/Table'
import { Ballot, HmpbBallotInfo, BmdBallotInfo } from '../config/types'
import fetchJSON from '../util/fetchJSON'

export default function BatchScreen() {
  const history = useHistory()
  const { batchId }: { batchId?: string } = useParams()
  const [ballots, setBallots] = useState<Ballot[]>()

  useEffect(() => {
    if (!batchId) {
      history.push('/')
    } else if (!ballots) {
      fetchJSON<Ballot[]>(`/scan/batch/${batchId}`).then(setBallots)
    }
  }, [batchId, ballots, history, setBallots])

  return (
    <React.Fragment>
      <Prose maxWidth={false}>
        <h1>Batch {batchId}</h1>
        <Table>
          <thead>
            <tr>
              <th>Ballot ID</th>
              <th>Precinct</th>
              <th>Ballot Style ID</th>
              <th>&nbsp;</th>
            </tr>
            {ballots
              ?.filter(
                (ballot): ballot is HmpbBallotInfo | BmdBallotInfo =>
                  'cvr' in ballot
              )
              .map((ballot) => (
                <tr key={ballot.id}>
                  <td>{ballot.id}</td>
                  {/* eslint-disable-next-line no-underscore-dangle */}
                  <td>{ballot.cvr._precinctId}</td>
                  {/* eslint-disable-next-line no-underscore-dangle */}
                  <td>{ballot.cvr._ballotStyleId}</td>
                  <td>
                    <Link to={`/batch/${batchId}/ballot/${ballot.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
          </thead>
        </Table>
      </Prose>
    </React.Fragment>
  )
}
