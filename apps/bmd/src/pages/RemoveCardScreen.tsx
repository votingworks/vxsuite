import React, { useContext } from 'react'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import BallotContext from '../contexts/ballotContext'

const RemoveCardScreen = () => {
  const { election } = useContext(BallotContext)
  const { bmdConfig } = election!
  const { showSettingsPage } = bmdConfig!
  return (
    <React.Fragment>
      <Main>
        <MainChild centerVertical maxWidth={false}>
          <Prose textCenter id="audiofocus">
            <h1 aria-label="Take card to the Ballot Printer.">
              Take card to the Ballot Printer
            </h1>
            <Text narrow>You will print and cast your official ballot.</Text>
            <Text bold narrow aria-label="You may remove the voter card now.">
              Remove the voter card.
            </Text>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar>
        <div />
        <LinkButton goBack id="previous">
          Back
        </LinkButton>
        <div />
        <div />
      </ButtonBar>
      <ButtonBar secondary separatePrimaryButton>
        <div />
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default RemoveCardScreen
