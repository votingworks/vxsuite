import React, { useContext } from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import BallotContext from '../contexts/ballotContext'

const InstructionsPage = () => {
  const { contests, election } = useContext(BallotContext)
  const { bmdConfig } = election!
  const { showSettingsPage } = bmdConfig!
  return (
    <React.Fragment>
      <Main>
        <MainChild centerVertical maxWidth={false} id="audiofocus">
          <Breadcrumbs step={1} />
          <Prose textCenter>
            <h1 aria-label="Mark your ballot.">Mark your ballot</h1>
            <Text narrow>{`This ballot has ${contests.length} contests.`}</Text>
            <p>
              <LinkButton
                primary
                big
                to="/contests/"
                id="next"
                aria-label="Select Next to Start Voting."
              >
                Start Voting
              </LinkButton>
            </p>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary separatePrimaryButton>
        <div />
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default InstructionsPage
