import React from 'react'
import styled from 'styled-components'
import Button from '../components/Button'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import { PostVotingInstructions } from '../config/types'

const SingleGraphic = styled.img`
  margin: 0 auto 1em;
  height: 20vw;
`

const Instructions = styled.ol`
  display: flex;
  padding: 1rem 1rem 1rem 2rem;
  list-style: none;
  text-align: center;
  > li {
    flex: 1;
    margin-right: 1em;
    &:last-child {
      margin-right: 0;
    }
    img {
      position: relative;
    }
  }
`

const Done = styled.div`
  position: absolute;
  right: 1em;
  bottom: 1em;
`

interface Props {
  hidePostVotingInstructions: () => void
  showPostVotingInstructions: PostVotingInstructions
}

const CastBallotPage: React.FC<Props> = ({
  hidePostVotingInstructions,
  showPostVotingInstructions,
}) => (
  <Screen white>
    <Main>
      <MainChild centerVertical maxWidth={false}>
        <Prose textCenter id="audiofocus" style={{ maxWidth: '65%' }}>
          <h1 aria-label="You’re almost done.">You’re Almost Done</h1>
          <p>Your official ballot is printing. To finish voting you need to…</p>
          <Instructions>
            <li>
              <SingleGraphic
                aria-hidden
                alt="Verify Your Printed Ballot"
                src="/images/instructions-1-verify.svg"
                style={{ left: '-0.75em' }}
              />
              <p>1. Review the votes on your printed ballot.</p>
            </li>
            <li>
              <SingleGraphic
                aria-hidden
                alt="Cast Your Ballot"
                src="/images/instructions-2-cast.svg"
              />
              <p>2. Place your ballot in the ballot box.</p>
            </li>
            {showPostVotingInstructions === 'card' && (
              <li>
                <SingleGraphic
                  aria-hidden
                  alt="Return Voter Card"
                  src="/images/instructions-3-return-card.svg"
                  style={{ left: '0.5em' }}
                />
                <p>3. Return the card to a poll worker.</p>
              </li>
            )}
          </Instructions>
          <h3>
            <strong>Need help?</strong> Ask a poll worker.
          </h3>
        </Prose>
        <Done>
          <Button onPress={hidePostVotingInstructions}>Done</Button>
        </Done>
      </MainChild>
    </Main>
  </Screen>
)

export default CastBallotPage
