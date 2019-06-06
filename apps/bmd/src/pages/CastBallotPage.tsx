import React, { useContext } from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import BallotContext from '../contexts/ballotContext'

const VoteInstructionsPage = () => {
  const { election } = useContext(BallotContext)
  const { bmdConfig } = election!
  const { showHelpPage, showSettingsPage } = bmdConfig!
  return (
    <React.Fragment>
      <Main>
        <MainChild centerVertical maxWidth={false}>
          <Breadcrumbs step={4} />
          <Prose textCenter id="audiofocus">
            <h1 aria-label="Cast your ballot.">Cast your printed ballot</h1>
            <Text narrow>
              Before you cast your official printed ballot in the ballot box,
              double-check your printed ballot to confirm your selections.
            </Text>
            <Text narrow>
              If you find a mistake, ask a poll worker for help.
            </Text>
            <div aria-label="Press the down arrow to continue, then" />
            <p>
              <LinkButton
                primary
                big
                to="/"
                aria-label="Press the select button to confirm that you will review and cast your printed ballot."
              >
                Okay, I will review and cast my printed ballot.
              </LinkButton>
            </p>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary separatePrimaryButton>
        <div />
        {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default VoteInstructionsPage
