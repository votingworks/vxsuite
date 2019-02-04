import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import LinkButton from '../components/LinkButton'
import Main from '../components/Main'

const StartPage = (props: RouteComponentProps) => {
  return (
    <Main>
      <div className="prose">
        <h1>Demo Election</h1>
        <p>
          For each contest, measure, or proposition, select your vote and then
          press the “Next” button.
        </p>
        <h2>Heading 2</h2>
        <p>More text about the election.</p>
        <p>More text about the election.</p>
        <p>
          <LinkButton autoFocus to={`/contests`}>
            Get Started
          </LinkButton>
        </p>
      </div>
    </Main>
  )
}

export default StartPage
