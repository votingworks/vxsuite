import React, { useContext, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import BallotContext from '../contexts/ballotContext'

import { MyVoiceIsMyPassword } from '../assets/BarCodes'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const Legend = styled.legend`
  margin: auto;
`
const CodeBox = styled.div`
  max-width: 320px;
  margin: auto;
`

// TODO: Codes will eventually be derived from the election file.
const validBallotCodes = [
  'MyVoiceIsMyPassword',
  'Foo',
  'Password',
  'VotingWorks',
]

let resetBallotCode: number

const StartPage = (props: RouteComponentProps) => {
  const { setBallotKey } = useContext(BallotContext)
  const [ballotCode, setBallotCode] = useState('')
  const setBallot = (code: string) => {
    clearTimeout(resetBallotCode)
    setBallotKey(code)
    props.history.push('/start')
  }

  /* istanbul ignore next */
  const takeShortcut = () => {
    setBallot(validBallotCodes[0])
  }
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    // TODO: add invalid code state?
    /* istanbul ignore else */
    if (validBallotCodes.includes(ballotCode)) {
      setBallot(ballotCode)
    }
  }
  // TODO: Mock jest timers
  /* istanbul ignore next */
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(resetBallotCode)
    setBallotCode(event.target.value)
    resetBallotCode = window.setTimeout(() => {
      setBallotCode('')
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
                    <MyVoiceIsMyPassword />
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
              value={ballotCode}
              aria-hidden="true"
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
