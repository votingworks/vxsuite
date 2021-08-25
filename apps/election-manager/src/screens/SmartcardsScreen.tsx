import React, { useContext, useState } from 'react'

import { EventTargetFunction } from '../config/types'
import AppContext from '../contexts/AppContext'

import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Loading from '../components/Loading'

const DefinitionScreen: React.FC = () => {
  const { electionDefinition } = useContext(AppContext)
  const { electionData, electionHash } = electionDefinition!

  const [isProgrammingCard, setIsProgrammingCard] = useState(false)

  const programCard: EventTargetFunction = async (event) => {
    const target = event.currentTarget as HTMLButtonElement
    const { id } = target.dataset
    setIsProgrammingCard(true)

    if (id === 'override') {
      await fetch('/card/write_protect_override', {
        method: 'post'
      })
      window.setTimeout(() => {
        setIsProgrammingCard(false)
      }, 1000)
      return
    }

    const shortValue = JSON.stringify({
      t: id,
      h: electionHash
    })

    const formData = new FormData()

    switch (id) {
      case 'pollworker':
        await fetch('/card/write', {
          method: 'post',
          body: shortValue
        })
        break
      case 'admin':
        formData.append('short_value', shortValue)
        formData.append('long_value', electionData)
        await fetch('/card/write_short_and_long', {
          method: 'post',
          body: formData
        })
        break
      default:
        break
    }

    setIsProgrammingCard(false)
  }

  return (
    <>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h1>Smartcards</h1>
          <p>
            Insert a card into the reader and then select the type of card to
            create.
          </p>
          <p>
            <Button onPress={programCard} data-id='admin'>
              Encode Admin Card
            </Button>{' '}
            <Button onPress={programCard} data-id='pollworker'>
              Encode Poll Worker Card
            </Button>
          </p>
          <p>
            You will first need to override write protection before
            re-programming an existing Admin card.
          </p>
          <p>
            <Button small onPress={programCard} data-id='override'>
              Override Write Protection
            </Button>
          </p>
          {isProgrammingCard && <p>Is programming card…</p>}
        </Prose>
      </NavigationScreen>
      {isProgrammingCard && (
        <Modal content={<Loading>Programming card</Loading>} />
      )}
    </>
  )
}

export default DefinitionScreen
