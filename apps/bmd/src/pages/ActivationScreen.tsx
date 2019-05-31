import React from 'react'
import styled from 'styled-components'

import { Election } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Seal from '../components/Seal'
import TestMode from '../components/TestMode'

const InsertCardImage = styled.img`
  margin: 1rem auto -1rem;
  max-width: 150px;
`

interface Props {
  election: Election
  isLiveMode: boolean
}

const ActivationScreen = ({ election, isLiveMode }: Props) => {
  const { title, state, county, date, seal, sealURL } = election
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <TestMode isLiveMode={isLiveMode} />
          <Seal seal={seal} sealURL={sealURL} />
          <h1 aria-label={`${title}.`}>{title}</h1>
          <p aria-hidden="true">
            {date}
            <br />
            {county.name}, {state}
          </p>
          <hr />
          <p>
            <InsertCardImage src="/insert-card.svg" alt="Insert Card Diagram" />
          </p>
          <h1>Insert Card</h1>
          <p>Insert voter card to load ballot.</p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
