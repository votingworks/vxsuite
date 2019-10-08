import React from 'react'
import styled from 'styled-components'

import { Election } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Sidebar from '../components/Sidebar'
import TestMode from '../components/TestMode'
import ElectionInfo from '../components/ElectionInfo'

const InsertCardImage = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`

interface Props {
  appPrecinctId: string
  election: Election
  isLiveMode: boolean
  isPollsOpen: boolean
}

const ActivationScreen = ({
  appPrecinctId,
  election,
  isLiveMode,
  isPollsOpen,
}: Props) => {
  return (
    <Screen flexDirection="row-reverse" white>
      <Sidebar>
        <ElectionInfo election={election} precinctId={appPrecinctId} />
      </Sidebar>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <TestMode isLiveMode={isLiveMode} />
            <p>
              <InsertCardImage
                src="/images/insert-card.svg"
                alt="Insert Card Diagram"
              />
            </p>
            {isPollsOpen ? (
              <React.Fragment>
                <h1>Insert Card</h1>
                <p>Insert voter card to load ballot.</p>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <h1>Polls Closed</h1>
                <p>Insert Poll Worker card to open.</p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ActivationScreen
