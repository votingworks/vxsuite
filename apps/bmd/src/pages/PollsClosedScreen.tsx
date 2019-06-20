import React from 'react'

import { Election } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import TestMode from '../components/TestMode'
import Seal from '../components/Seal'

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
          <h1>Polls Closed</h1>
          <p>Insert Poll Worker card to open.</p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
