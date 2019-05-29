import React, { useContext } from 'react'
import styled from 'styled-components'

import BallotContext from '../contexts/ballotContext'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const Seal = styled.div`
  margin: 0 auto 1rem;
  max-width: 320px;
`

const StartPage = () => {
  const { ballotStyleId, election, precinctId } = useContext(BallotContext)
  const { title, state, county, date, seal } = election!

  return (
    <Main>
      <MainChild center>
        <Seal aria-hidden="true" dangerouslySetInnerHTML={{ __html: seal }} />
        <Prose textCenter>
          <h1 aria-label={`${title}.`}>{title}</h1>
          <p aria-hidden="true">
            {date}
            <br />
            {county.name}, {state}
            <br />
            Ballot Style {ballotStyleId}
            <br />
            Precinct {precinctId}
          </p>
          <p>
            <LinkButton
              primary
              to="/instructions/"
              id="next"
              aria-label="Select Next to Get Started."
            >
              Get Started
            </LinkButton>
          </p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default StartPage
