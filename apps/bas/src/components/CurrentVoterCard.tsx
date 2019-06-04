import React from 'react'
import styled from 'styled-components'

const CardContainer = styled.div`
  text-align: right;
  color: #ffffff;
`

interface Props {
  ballotStyleId?: string
  precinctName?: string
}

const CurrentCard = ({ ballotStyleId, precinctName }: Props) =>
  precinctName && ballotStyleId ? (
    <CardContainer>
      Current Card:{' '}
      <strong>
        {precinctName}, {ballotStyleId}
      </strong>
    </CardContainer>
  ) : (
    <CardContainer>Insert Voter Card</CardContainer>
  )

export default CurrentCard
