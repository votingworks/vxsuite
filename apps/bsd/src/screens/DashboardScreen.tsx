import React from 'react'
import styled from 'styled-components'

import { ButtonEventFunction } from '../config/types'

import Button from '../components/Button'
import Prose from '../components/Prose'

const Table = styled.table`
  width: 100%;
  & th,
  & td {
    border-bottom: 1px solid rgb(194, 200, 203);
    padding: 0.25rem 0.5rem;
    text-align: left;
    &:last-child {
      text-align: right;
    }
  }
  & th {
    border-top: 1px solid rgb(194, 200, 203);
  }
  & tr:nth-child(2n) {
    td {
      background-color: rgb(222, 225, 227);
    }
  }
`

interface Props {
  programCard: ButtonEventFunction
}

const PrecinctsScreen = ({ programCard }: Props) => {
  return (
    <React.Fragment>
      <Prose>
        <h1>Scanned Ballot Batches</h1>
        <p>1037 ballots scanned in 33 batches.</p>
        <Table>
          <thead>
            <tr>
              <th>id</th>
              <th>count</th>
              <th>start time</th>
              <th>end time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1234</td>
              <td>57</td>
              <td>10:01am</td>
              <td>10:07am</td>
              <td>
                <Button onClick={programCard} data-id="admin">
                  Invalidate
                </Button>
              </td>
            </tr>
            <tr>
              <td>1234</td>
              <td>57</td>
              <td>10:01am</td>
              <td>10:07am</td>
              <td>
                <Button onClick={programCard} data-id="admin">
                  Invalidate
                </Button>
              </td>
            </tr>
            <tr>
              <td>1234</td>
              <td>57</td>
              <td>10:01am</td>
              <td>10:07am</td>
              <td>
                <Button onClick={programCard} data-id="admin">
                  Invalidate
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
      </Prose>
    </React.Fragment>
  )
}

export default PrecinctsScreen
