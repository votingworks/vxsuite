import React, { useContext, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import { ActivationData, Election, Precinct } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import QRCode from '../components/QRCode'

const Legend = styled.legend`
  margin: auto;
`
const CodeBox = styled.div`
  margin: auto;
  border: 1rem solid #ffffff;
  max-width: 320px;
`

let resetBallotCode: number

let checkCard: number

const StartPage = (props: RouteComponentProps) => {
  const { election: contextElection, activateBallot } = useContext(
    BallotContext
  )
  const election = contextElection as Election
  const [activationCode, setActivationCode] = useState('')
  const setBallot = (activationData: ActivationData) => {
    clearTimeout(resetBallotCode)
    activateBallot(activationData)
    props.history.push('/start')
  }

  /* istanbul ignore next - shortcut will not exist in official release */
  const takeShortcut = () => {
    const ballotStyle = election.ballotStyles[0]
    setBallot({
      ballotStyle,
      precinct: election.precincts.find(
        p => p.id === ballotStyle.precincts[0]
      ) as Precinct,
    })
  }
  const decodeActivationCode = () => {
    const [brand, precinctId, ballotStyleId] = activationCode.split('.')
    const ballotStyle = election.ballotStyles.find(b => b.id === ballotStyleId)
    const precinct = election.precincts.find(p => p.id === precinctId)
    /* istanbul ignore else */
    if (
      brand === 'VX' &&
      !!precinct &&
      !!ballotStyle &&
      ballotStyle.precincts.includes(precinct.id)
    ) {
      setBallot({ ballotStyle, precinct })
    }
    // TODO: add invalid code state? - https://github.com/votingworks/bmd/issues/289
  }
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    decodeActivationCode()
  }
  // TODO: Mock jest timers
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(resetBallotCode)
    setActivationCode(event.target.value)
    resetBallotCode = window.setTimeout(() => {
      setActivationCode('')
    }, 1000)
  }
  // TODO: testing for onBlur causes stack overflow error
  const onBlur = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.target.focus()
  }

  checkCard = window.setInterval(() => {
    fetch('/card/read')
      .then(result => result.json())
      .then(resultJSON => {
        const cardState = resultJSON.card
        if (cardState) {
          window.clearInterval(checkCard)
          setActivationCode(cardState)
          decodeActivationCode()
        }
      })
      .catch(() => {
        // if it's an error, aggressively assume there's no backend and stop hammering
        window.clearInterval(checkCard)
      })
  }, 1000)

  return (
    <Main>
      <MainChild center>
        <form onSubmit={onSubmit}>
          <fieldset>
            <Legend>
              <Prose textCenter>
                <h1>Scan Your Activation Code</h1>
                <p>Your ballot will be displayed after scan is complete.</p>
                <CodeBox onClick={takeShortcut}>
                  <QRCode value="VX.21.5" />
                </CodeBox>
              </Prose>
            </Legend>
            <label
              aria-hidden="true"
              className="visually-hidden"
              htmlFor="BallotCode"
            >
              <div>Activation Code</div>
              <input
                data-testid="activation-code"
                type="text"
                id="BallotCode"
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                onBlur={onBlur}
                onChange={onChange}
                value={activationCode}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              className="visually-hidden"
              aria-hidden="true"
            >
              Submit
            </button>
          </fieldset>
        </form>
      </MainChild>
    </Main>
  )
}

export default StartPage
