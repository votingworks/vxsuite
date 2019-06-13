import React from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const CastBallotPage = () => (
  <React.Fragment>
    <Main>
      <MainChild centerVertical maxWidth={false}>
        <Breadcrumbs step={4} />
        <Prose textCenter id="audiofocus">
          <h1 aria-label="You’re almost done.">You’re Almost Done.</h1>
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
        </Prose>
      </MainChild>
    </Main>
  </React.Fragment>
)

export default CastBallotPage
