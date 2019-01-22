import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import Article from '../components/Article'
import LinkButton from '../components/LinkButton'

const StartPage = (props: RouteComponentProps) => {
  return (
    <React.Fragment>
      <Article>
        <h1>Demo Election</h1>
        <LinkButton to={`/contests`}>Get Started</LinkButton>
      </Article>
    </React.Fragment>
  )
}

export default StartPage
