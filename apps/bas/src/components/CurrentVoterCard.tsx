import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const CardContainer = styled.div`
  padding: 1rem;
  white-space: nowrap;
  color: #ffffff;
`

interface Props {
  cardBallotStyleId?: string
  cardPrecinctName?: string
}

const CurrentVoterCard: React.FC<Props> = ({
  cardBallotStyleId,
  cardPrecinctName,
}) => (
  <ButtonBar secondary>
    {cardPrecinctName || cardBallotStyleId ? (
      <CardContainer>
        Current Card:{' '}
        <strong>
          {cardPrecinctName && cardBallotStyleId
            ? `${cardPrecinctName}, ${cardBallotStyleId}`
            : 'no data'}
        </strong>
      </CardContainer>
    ) : (
      <CardContainer>Insert Voter Card</CardContainer>
    )}
  </ButtonBar>
)

export default CurrentVoterCard
