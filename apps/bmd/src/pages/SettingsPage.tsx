import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const SettingsPage = (props: RouteComponentProps) => {
  return (
    <>
      <Main>
        <MainChild>
          <Prose>
            <h1>Settings</h1>
            <p>Settings will be available here.</p>
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

export default SettingsPage
