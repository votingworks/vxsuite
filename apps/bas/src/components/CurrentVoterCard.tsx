import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const CardContainer = styled.div`
  padding: 1rem;
  white-space: nowrap;
  color: #ffffff;
`

interface Props {
  ballotStyleId?: string
  precinctName?: string
}

const CurrentCard = ({ ballotStyleId, precinctName }: Props) => (
  <ButtonBar secondary>
    {precinctName || ballotStyleId ? (
      <CardContainer>
        Current Card:{' '}
        <strong>
          {precinctName && ballotStyleId
            ? `${precinctName}, ${ballotStyleId}`
            : 'no data'}
        </strong>
      </CardContainer>
    ) : (
      <CardContainer>Insert Voter Card</CardContainer>
    )}
  </ButtonBar>
)

export default CurrentCard
