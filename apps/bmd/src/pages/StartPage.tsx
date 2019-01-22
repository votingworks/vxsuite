import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import Article from '../components/Article'
import LinkButton from '../components/LinkButton'

const StartPage = (props: RouteComponentProps) => {
  return (
    <React.Fragment>
      <Article>
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
            <LinkButton to={`/contests`}>Get Started</LinkButton>
          </p>
        </div>
      </Article>
    </React.Fragment>
  )
}

export default StartPage
