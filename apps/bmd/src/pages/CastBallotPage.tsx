import React from 'react'
import styled from 'styled-components'

import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'

const Directions = styled.div`
  margin: auto;
  & h1 {
    text-align: center;
  }
`

const Instructions = styled.ol`
  margin: 0 auto;
  border-radius: 0.25rem;
  background: #ffffff;
  max-width: 24rem;
  padding: 1.5rem 1rem;
  list-style: none;
  @media (min-width: 480px) {
    padding: 2.5rem;
  }
  & > li {
    position: relative;
    margin-bottom: 1.75rem;
    padding-left: 1.75rem;
    counter-increment: asdf;
  }
  & > li:last-child {
    margin-bottom: 0;
  }
  & > li::before {
    position: absolute;
    top: 0;
    left: 0;
    font-size: 1.25rem;
    font-weight: 700;
    content: counter(asdf) '.';
  }
`

const StartPage = () => {
  return (
    <Main>
      <MainChild center>
        <Directions>
          <Prose>
            <h1 aria-label="Verify and Cast Your Ballot.">
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
