import React from 'react'

import { Election } from '../config/types'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'

interface Props {
  election: Election
  hideTestDeck: () => void
}

const TestingDeckScreen = ({ election, hideTestDeck }: Props) => {
  return (
    <React.Fragment>
      <Main>
        <MainChild>
          <Prose className="no-print">
            <p>title: {election.title}</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Print Test Deck">
        <Button small onClick={hideTestDeck}>
          back
        </Button>
      </MainNav>
      <div className="print-only">print me</div>
    </React.Fragment>
  )
}

export default TestingDeckScreen
