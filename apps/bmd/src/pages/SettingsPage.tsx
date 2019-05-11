import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import GLOBALS from '../config/globals'

import { ButtonEvent, InputEvent, TextSizeSetting } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import RangeInput from '../components/RangeInput'
import Text from '../components/Text'

const SettingLabel = styled.label`
  display: block;
  margin: 1.5rem 0 1rem;
  font-size: 1.25rem;
  font-weight: bold;
`
const FontSizeControlsContainer = styled.div`
  display: flex;
  & input {
    flex: 1;
    margin-right: 0.5rem;
    margin-left: 0.5rem;
  }
  button {
    border-radius: 50%;
    height: 2.5rem;
    width: 2.5rem;
    padding: 0 0 0.2rem;
  }
`

const SettingsPage = () => {
  const { resetBallot, userSettings, setUserSettings, votes } = useContext(
    BallotContext
  )
  const [showResetBallotAlert, setResetBallotAlert] = useState(false)
  const cancelResetBallot = () => {
    setResetBallotAlert(false)
  }
  const requestResetBallot = () => {
    resetBallot()
  }
  const requestNewBallot = () => {
    Object.keys(votes).length === 0 ? resetBallot() : setResetBallotAlert(true)
  }
  const onFontSizeChange = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    const textSize = +target.value as TextSizeSetting
    setUserSettings({ textSize })
  }
  const adjustFontSize = (event: ButtonEvent) => {
    const target = event.target as HTMLButtonElement
    const textSize = (userSettings.textSize + +target.value) as TextSizeSetting
    setUserSettings({ textSize })
  }
  return (
    <>
      <Main>
        <MainChild>
          <Prose>
            <h1>Settings</h1>
            <p>Adjust the following settings to meet your needs.</p>
            <SettingLabel htmlFor="font-size">Font Size</SettingLabel>
            <FontSizeControlsContainer>
              <Button
                aria-hidden
                data-testid="decrease-font-size-button"
                disabled={userSettings.textSize === 0}
                onClick={adjustFontSize}
                value={-1}
              >
                -
              </Button>
              <RangeInput
                id="font-size"
                min={0}
                max={3}
                step={1}
                value={userSettings.textSize}
                onChange={onFontSizeChange}
              />
              <Button
                aria-hidden
                data-testid="increase-font-size-button"
                disabled={
                  userSettings.textSize === GLOBALS.FONT_SIZES.length - 1
                }
                onClick={adjustFontSize}
                value={1}
              >
                +
              </Button>
            </FontSizeControlsContainer>
            <h2>Clear Selections</h2>
            <p>Clear all selections and start over.</p>
            <Button onClick={requestNewBallot}>Start Over</Button>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar>
        <div />
        <LinkButton goBack>Back</LinkButton>
        <div />
        <div />
      </ButtonBar>
      <Modal
        isOpen={showResetBallotAlert}
        content={
          <Prose>
            <Text>
              Are you sure you want to clear all selections and start over?
            </Text>
          </Prose>
        }
        actions={
          <>
            <Button danger onClick={requestResetBallot}>
              Yes, Remove All Votes
            </Button>
            <Button onClick={cancelResetBallot}>Cancel</Button>
          </>
        }
      />
    </>
  )
}

export default SettingsPage
