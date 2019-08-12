import React, { useContext } from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import BallotContext from '../contexts/ballotContext'

const PreReviewPage = () => {
  const { election } = useContext(BallotContext)
  const { bmdConfig } = election!
  const { showSettingsPage } = bmdConfig!
  return (
    <React.Fragment>
      <Main>
        <MainChild centerVertical maxWidth={false}>
          <Breadcrumbs step={2} />
          <Prose textCenter id="audiofocus">
            <h1 aria-label="Review Your Selections.">Review Your Selections</h1>
            <Text narrow>Confirm and change any votes as necessary.</Text>
            <div aria-label="Use the down arrow, then" />
            <p>
              <LinkButton
                primary
                big
                to="/review"
                aria-label="Use the select button to begin your review."
              >
                Review Selections
              </LinkButton>
            </p>
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

export default PreReviewPage
