import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Seal from '../components/Seal'

const StartPage = (props: RouteComponentProps) => {
  const { election } = useContext(BallotContext)
  const { title, state, county, date, seal } = election!
  return (
    <Main>
      <MainChild center>
        <Seal dangerouslySetInnerHTML={{ __html: seal }} />
        <Prose textCenter>
          <h1>{title}</h1>
          <p>
            {date}
            <br />
            {county}, {state}
          </p>
          <p>
            <LinkButton autoFocus primary to={`/contests`}>
              Get Started
            </LinkButton>
          </p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default StartPage
