import React from 'react'
import styled from 'styled-components'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'

const Directions = styled.div`
  margin: auto;
  /* outline: 1px solid tan; */
  & h1 {
    text-align: center;
  }
`

const Instructions = styled.ol`
  max-width: 24rem;
  list-style: none;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  background: white;
  border-radius: 0.25rem;
  @media (min-width: 480px) {
    padding: 2.5rem;
  }
  & > li {
    margin-bottom: 1.75rem;
    position: relative;
    counter-increment: asdf;
    padding-left: 1.75rem;
  }
  & > li:last-child {
    margin-bottom: 0;
  }
  & > li:before {
    content: counter(asdf) '.';
    position: absolute;
    top: 0;
    left: 0;
    font-weight: bold;
    font-size: 1.25rem;
  }
`

const StartPage = () => {
  return (
    <Main>
      <MainChild center>
        <Directions>
          <Prose>
            <h1 aria-label={`Verify and Cast Your Ballot.`}>
              Verify and Cast Your Ballot
            </h1>
            <Text center>Retrieve your printed ballot from the printer.</Text>
            <Instructions>
              {/* <li>
                <h2>Collect Printed Ballot.</h2>
                <p>The printer has printed your ballot.</p>
              </li> */}
              <li>
                <h2>Verify Ballot Selections.</h2>
                <p>Review and confirm all selections on your printed ballot.</p>
              </li>
              <li>
                <h2>Cast in Ballot Box.</h2>
                <p>Deposit your ballot into the secured ballot box.</p>
              </li>
            </Instructions>
            <Text center>
              I have verified my selections and will cast my ballot.
            </Text>
            <Text center>
              <LinkButton primary to="/">
                Start Over
              </LinkButton>
            </Text>
          </Prose>
        </Directions>
      </MainChild>
    </Main>
  )
}

export default StartPage
