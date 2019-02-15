import React from 'react'
import { RouteComponentProps } from 'react-router-dom'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const StartPage = (props: RouteComponentProps) => {
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>General Election</h1>
          <p>
            November 3, 2020
            <br />
            Lorem County, State of Ipsumana
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
