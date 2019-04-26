import React, { useState } from 'react'
import styled from 'styled-components'

import './App.css'

import electionSample from './data/electionSample.json'

type ButtonEvent = React.MouseEvent<HTMLButtonElement>

const Body = styled.div`
  background: #ad7af7;
  height: 100%;
  padding: 2rem;
`
const Content = styled.div`
  background: #c8a9f5;
  padding: 2rem;
`

const App: React.FC = () => {
  const [precinct, setPrecinct] = useState('')
  const updatePrecinct = (event: ButtonEvent) => {
    const { id = '' } = (event.target as HTMLElement).dataset
    setPrecinct(id)
  }
  const [ballot, setBallot] = useState('')
  const updateBallot = (event: ButtonEvent) => {
    const { id = '' } = (event.target as HTMLElement).dataset
    setBallot(id)
  }
  const reset = () => {
    setPrecinct('')
    setBallot('')
  }
  if (precinct && ballot) {
    return (
      <Body>
        <Content>
          <h1>Activation Code</h1>
          <p>
            <button onClick={reset} type="button">
              Reset
            </button>
          </p>
          <p>{`{ ballot: ${ballot}, precinct: ${precinct} }`}</p>
        </Content>
      </Body>
    )
  }
  if (precinct) {
    return (
      <Body>
        <Content>
          <h1>Ballot Styles</h1>
          <p>
            <button onClick={reset} type="button">
              Reset
            </button>
          </p>
          {electionSample.ballotStyles
            .filter(b => b.precincts.find(p => p === precinct))
            .map(ballot => (
              <div key={ballot.id}>
                <button
                  data-id={ballot.id}
                  onClick={updateBallot}
                  type="button"
                >
                  {ballot.id}
                </button>
              </div>
            ))}
        </Content>
      </Body>
    )
  }
  return (
    <Body>
      <Content>
        <h1>Precincts</h1>
        {electionSample.precincts.map(p => (
          <div key={p.id}>
            <button data-id={p.id} onClick={updatePrecinct} type="button">
              {p.name}
            </button>
          </div>
        ))}
      </Content>
    </Body>
  )
}

export default App
