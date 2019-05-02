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
  border: 1rem solid white;
  max-width: 320px;
  margin: auto;
`

let resetBallotCode: number

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
    // TODO: add invalid code state?
  }
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    decodeActivationCode()
  }
  // TODO: Mock jest timers
  /* istanbul ignore next */
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(resetBallotCode)
    setActivationCode(event.target.value)
    resetBallotCode = window.setTimeout(() => {
      setActivationCode('')
    }, 1000)
  }
  // TODO: testing for onBlur causes stack overflow error
  /* istanbul ignore next */
  const onBlur = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.target.focus()
  }

  return (
    <Main>
      <MainChild center>
        <form onSubmit={onSubmit}>
          <fieldset>
            <Legend>
              <label htmlFor="BallotCode">
                <Prose textCenter>
                  <h1>Scan Your Activation Code</h1>
                  <p>Your ballot will be displayed after scan is complete.</p>
                  <CodeBox onClick={takeShortcut}>
                    <QRCode value="VX.21.5R" />
                  </CodeBox>
                </Prose>
              </label>
            </Legend>
            <input
              data-testid="activation-code"
              type="text"
              id="BallotCode"
              autoFocus
              className="visually-hidden"
              onBlur={onBlur}
              onChange={onChange}
              value={activationCode}
              aria-hidden="true"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
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
