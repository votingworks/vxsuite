import React, { useEffect } from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'
import { PartialUserSettings } from '../config/types'

interface Props {
  setUserSettings: (partial: PartialUserSettings) => void
}

const UsedCardScreen = ({ setUserSettings }: Props) => {
  useEffect(() => {
    setUserSettings({ textSize: 3 })
    return () => {
      setUserSettings({ textSize: 1 })
    }
  }, [setUserSettings])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Used Card</h1>
            <p>Please return card to a poll worker.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default UsedCardScreen
