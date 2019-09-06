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
  isVoterCardExpired: boolean
  isVoterCardInvalid: boolean
}

const ActivationScreen = ({
  election,
  isLiveMode,
  isVoterCardExpired,
  isVoterCardInvalid,
}: Props) => {
  const { title, state, county, date, seal, sealURL } = election
  const showInvalid = isVoterCardInvalid
  const showExpired = !showInvalid && isVoterCardExpired
  const showDefault = !showInvalid && !showExpired
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <TestMode isLiveMode={isLiveMode} />
          {showInvalid && (
            <React.Fragment>
              <h1>Inactive Card</h1>
              <p>Please return this card to a poll worker.</p>
            </React.Fragment>
          )}
          {showExpired && (
            <React.Fragment>
              <h1>Expired Card</h1>
              <p>Please return this card to a poll worker for assistance.</p>
            </React.Fragment>
          )}
          {showDefault && (
            <React.Fragment>
              <Seal seal={seal} sealURL={sealURL} />
              <h1 aria-label={`${title}.`}>{title}</h1>
              <p aria-hidden="true">
                {date}
                <br />
                {county.name}, {state}
              </p>
              <hr />
              <p>
                <InsertCardImage
                  src="/insert-card.svg"
                  alt="Insert Card Diagram"
                />
              </p>
              <h1>Insert Card</h1>
              <p>Insert voter card to load ballot.</p>
            </React.Fragment>
          )}
        </Prose>
      </MainChild>
    </Main>
  )
}

export default ActivationScreen
