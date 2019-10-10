import React, { useEffect, useState } from 'react'
import { Redirect } from 'react-router-dom'

import styled from 'styled-components'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'

interface Props {
  progress: number
  saveDelay: number
}

const ProgressBar = styled.div<Props>`
  margin: 0 auto;
  border: 0.4rem solid #000000;
  border-radius: 10rem;
  width: 30vw;
  & > div > div {
    border: 0.35rem solid #ffffff;
    border-radius: 10rem;
    background: #9958a4;
    width: ${({ progress }) => `${progress * 100}%`};
    min-width: 3rem;
    height: 2.4rem;
    transition: width ${({ saveDelay }) => saveDelay + 500}ms ease-out;
  }
`

const SaveCardScreen = () => {
  const saveDelay = 2500
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setProgress(1)
    }, 1)
    setTimeout(() => {
      setDone(true)
    }, saveDelay)
  }, [])

  if (done) {
    return <Redirect to="/remove" />
  }
  return (
    <Screen white>
      <Main>
        <MainChild centerVertical maxWidth={false}>
          <Prose textCenter id="audiofocus">
            <ProgressBar progress={progress} saveDelay={saveDelay}>
              <div>
                <div />
              </div>
            </ProgressBar>
            <h1>Saving your votes to the card…</h1>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default SaveCardScreen
