import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const HelpPage = (props: RouteComponentProps) => {
  return (
    <>
      <Main>
        <MainChild>
          <Prose>
            <h1>Help</h1>
            <p>Help content will be available here.</p>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary>
        <div />
        <LinkButton goBack>Back</LinkButton>
        <div />
        <div />
      </ButtonBar>
    </>
  )
}

export default HelpPage
