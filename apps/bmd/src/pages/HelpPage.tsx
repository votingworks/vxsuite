import React from 'react'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const HelpPage = () => {
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
      <ButtonBar>
        <div />
        <LinkButton goBack>Back</LinkButton>
        <div />
        <div />
      </ButtonBar>
    </>
  )
}

export default HelpPage
