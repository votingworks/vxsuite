import React, { useContext, useState } from 'react'

import { ButtonEventFunction } from '../config/types'

import sleep from '../lib/sleep'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import NavigationScreen from '../components/NavigationScreen'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'
import Loading from '../components/Loading'

const SmartCardsScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!

  const [isProgrammingCard, setIsProgrammingCard] = useState(false)

  const programCard: ButtonEventFunction = async event => {

    const id = event.currentTarget.dataset.id
    setIsProgrammingCard(true)

    if (id === 'override') {
      await fetch('/card/write_protect_override', {
        method: 'post',
      })
      window.setTimeout(() => {
        setIsProgrammingCard(false)
      }, 1000)
      return
    }

    const electionJSON = JSON.stringify(election)
    // TODO: https://github.com/votingworks/ems/issues/8
    const hash = 'bogusfornow'
    const shortValue = JSON.stringify({
      t: id,
      h: hash,
    })

    let formData = new FormData()

    switch (id) {
      case 'pollworker':
        await fetch('/card/write', {
          method: 'post',
          body: shortValue,
        })
        break
      case 'clerk':
        formData.append('short_value', shortValue)
        formData.append('long_value', electionJSON)
        await fetch('/card/write_short_and_long', {
          method: 'post',
          body: formData,
        })
        break
      default:
        break
    }

    await sleep()
    setIsProgrammingCard(false)
  }

  if (isProgrammingCard) {
    return (
      <Screen>
        <Main>
          <MainChild center>
            <Loading>Programming card</Loading>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  return (
    <NavigationScreen>
      <h1>Create SmartCards</h1>
      <p>
        Insert SmartCard for <strong>{election.title}</strong> on {election.date} then select type of card to create.
      </p>
      <p>
        <Button onPress={programCard} data-id="clerk">
          Create Admin Card
        </Button>{' '}
        <Button onPress={programCard} data-id="pollworker">
          Create Poll Worker Card
        </Button>
      </p>
      <p>
        If you are re-programming an existing Admin Card, you will first need to override the write protection on the card.
      </p>
      <p>
        <Button onPress={programCard} data-id="override">
          Override Write Protection
        </Button>
      </p>
    </NavigationScreen>
  )
}

export default SmartCardsScreen
