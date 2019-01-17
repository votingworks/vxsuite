import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import Article from '../components/Article'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'

const StartPage = (props: RouteComponentProps) => {
  return (
    <React.Fragment>
      <Article>
        <h1>Demo Election</h1>
      </Article>
      <ButtonBar
        centerContent={<LinkButton to={`/contests`}>Get Started</LinkButton>}
      />
    </React.Fragment>
  )
}

export default StartPage
