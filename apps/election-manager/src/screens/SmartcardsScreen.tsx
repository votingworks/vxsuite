import { strict as assert } from 'assert'
import React, { useContext, useState } from 'react'

import { NumberPad, useCancelablePromise } from '@votingworks/ui'
import styled from 'styled-components'
import { sleep } from '@votingworks/utils'
import AppContext from '../contexts/AppContext'

import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import { SECURITY_PIN_LENGTH } from '../config/globals'

export const Passcode = styled.div`
  text-align: center;
  color: rgba(71, 167, 75, 1);
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  > div {
    width: 300px;
  }
`

const DefinitionScreen = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext)
  assert(electionDefinition)
  const { electionData, electionHash } = electionDefinition

  const makeCancelable = useCancelablePromise()

  const [isProgrammingCard, setIsProgrammingCard] = useState(false)
  const [
    isPromptingForAdminPasscode,
    setIsPromptingForAdminPasscode,
  ] = useState(false)
  const [currentPasscode, setCurrentPasscode] = useState('')

  const [isShowingError, setIsShowingError] = useState(false)
  const closeErrorDialog = () => setIsShowingError(false)

  const overrideWriteProtection = async () => {
    setIsProgrammingCard(true)
    await fetch('/card/write_protect_override', {
      method: 'post',
    })
    await makeCancelable(sleep(1000))
    setIsProgrammingCard(false)
  }

  const programPollWorkerCard = async () => {
    setIsProgrammingCard(true)

    const shortValue = JSON.stringify({
      t: 'pollworker',
      h: electionHash,
    })
    const response = await fetch('/card/write', {
      method: 'post',
      body: shortValue,
    })
    const body = await response.json()
    if (!body.success) {
      setIsShowingError(true)
    }
    setIsProgrammingCard(false)
  }
  const programAdminCard = async (passcode: string) => {
    const formData = new FormData()
    setIsProgrammingCard(true)
    setIsPromptingForAdminPasscode(false)
    const shortValue = JSON.stringify({
      t: 'admin',
      h: electionHash,
      p: passcode,
    })
    formData.append('short_value', shortValue)
    formData.append('long_value', electionData)
    const response = await fetch('/card/write_short_and_long', {
      method: 'post',
      body: formData,
    })
    const body = await response.json()
    if (!body.success) {
      setIsShowingError(true)
    }

    setIsProgrammingCard(false)
  }

  const initiateAdminCardProgramming = () => {
    setCurrentPasscode('')
    setIsPromptingForAdminPasscode(true)
  }

  const addNumberToPin = (passcode: string) => {
    if (currentPasscode.length >= SECURITY_PIN_LENGTH) {
      // do nothing
      return
    }
    setCurrentPasscode((prev) => prev + passcode)
  }

  // Add hyphens for any missing digits in the pin and separate all characters with a space.
  const pinDisplayString = currentPasscode
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ')

  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h1>Smartcards</h1>
          <p>
            Insert a card into the reader and then select the type of card to
            create.
          </p>
          <p>
            <Button onPress={initiateAdminCardProgramming} data-id="admin">
              Encode Admin Card
            </Button>{' '}
            <Button onPress={programPollWorkerCard}>
              Encode Poll Worker Card
            </Button>
          </p>
          <p>
            You will first need to override write protection before
            re-programming an existing Admin card.
          </p>
          <p>
            <Button small onPress={overrideWriteProtection}>
              Override Write Protection
            </Button>
          </p>
          {isProgrammingCard && <p>Is programming card…</p>}
        </Prose>
      </NavigationScreen>
      {isProgrammingCard && (
        <Modal content={<Loading>Programming card</Loading>} />
      )}
      {isShowingError && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Failed to Create Card</h1>
              <p>
                Please make sure a card is in the card reader and try again. If
                you are trying to reprogram an existing admin card you first
                need to overwrite write protection.
              </p>
            </Prose>
          }
          actions={<Button onPress={closeErrorDialog}>Close</Button>}
          onOverlayClick={closeErrorDialog}
        />
      )}
      {isPromptingForAdminPasscode && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Create Card Security Code</h1>
              <Passcode>{pinDisplayString}</Passcode>
              <NumberPadWrapper>
                <NumberPad onButtonPress={addNumberToPin} />
              </NumberPadWrapper>
              <p>This code will be required when using the new card.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={() => setIsPromptingForAdminPasscode(false)}>
                Cancel
              </Button>
              <Button
                primary
                disabled={currentPasscode.length !== SECURITY_PIN_LENGTH}
                onPress={() => programAdminCard(currentPasscode)}
              >
                Create Card
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  )
}

export default DefinitionScreen
