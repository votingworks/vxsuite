import React from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'

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
          <Text narrow>
            Before you cast your official printed ballot in the ballot box,
            double-check your printed ballot to confirm your selections.
          </Text>
          <Text narrow>If you find a mistake, ask a poll worker for help.</Text>
          <div aria-label="Press the down arrow to continue, then" />
          <p>
            <Button
              primary
              big
              onClick={unsetIsRecentVoterPrint}
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
