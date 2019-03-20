import React from 'react'
import { RouteComponentProps } from 'react-router-dom'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const NotFoundPage = (props: RouteComponentProps) => {
  const { pathname } = props.location
  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Page Not Found.</h1>
          <p>
            No page exists at <code>{pathname}</code>.
          </p>
          <p>
            <LinkButton primary to={`/`}>
              Start Page
            </LinkButton>
          </p>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default NotFoundPage
