import React from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

interface Props {
  unsetIsRecentVoterPrint: () => void
}

const CastBallotPage = ({ unsetIsRecentVoterPrint }: Props) => (
  <React.Fragment>
    <Main>
      <MainChild centerVertical maxWidth={false}>
        <Breadcrumbs step={4} />
        <Prose textCenter id="audiofocus">
          <h1 aria-label="Cast your ballot.">Cast your printed ballot</h1>
          <p>
            Double check your official printed ballot.
            <br />
            <em>To make any changes, ask a poll worker for help.</em>
          </p>
          <p>
            Cast your official printed ballot in the ballot box
            <br />
            and return your voter card to a poll worker.
          </p>
          <div aria-label="Press the down arrow to continue, then" />
          <p>
            <Button
              primary
              big
              onPress={unsetIsRecentVoterPrint}
              aria-label="Press the select button to confirm that you will review and cast your printed ballot."
            >
              Okay, I will review and cast my printed ballot.
            </Button>
          </p>
        </Prose>
      </MainChild>
    </Main>
  </React.Fragment>
)

export default CastBallotPage
