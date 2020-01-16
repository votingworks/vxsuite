import React, { useEffect } from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'
import { PartialUserSettings } from '../config/types'
import { DEFAULT_FONT_SIZE, LARGE_DISPLAY_FONT_SIZE } from '../config/globals'

interface Props {
  setUserSettings: (partial: PartialUserSettings) => void
}

const ExpiredCardScreen = ({ setUserSettings }: Props) => {
  useEffect(() => {
    setUserSettings({ textSize: LARGE_DISPLAY_FONT_SIZE })
    return () => {
      setUserSettings({ textSize: DEFAULT_FONT_SIZE })
    }
  }, [setUserSettings])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Card Reader Not Detected</h1>
            <p>Please ask a poll worker to connect card reader.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ExpiredCardScreen
