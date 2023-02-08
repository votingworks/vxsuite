import React from 'react';
import styled from 'styled-components';

import { Button, Main, Screen, Prose, Text } from '@votingworks/ui';

const SingleGraphic = styled.img`
  margin: 0 auto 1em;
  height: 20vw;
`;

const Instructions = styled.ol`
  display: flex;
  padding: 1rem;
  list-style: none;
  text-align: center;
  > li {
    flex: 1;
    margin-right: 3em;
    &:last-child {
      margin-right: 0;
    }
    img {
      position: relative;
    }
  }
`;

const Done = styled.div`
  position: absolute;
  right: 1em;
  bottom: 1em;
`;

interface Props {
  hidePostVotingInstructions: () => void;
}

export function CastBallotPage({
  hidePostVotingInstructions,
}: Props): JSX.Element {
  return (
    <Screen white>
      <Main centerChild>
        <Prose textCenter maxWidth={false} id="audiofocus">
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
              <Text>1. Verify your official ballot.</Text>
            </li>
            <li>
              <SingleGraphic
                aria-hidden
                alt="Scan Your Ballot"
                src="/images/instructions-2-scan.svg"
              />
              <Text>2. Scan your official ballot.</Text>
            </li>
          </Instructions>
          <h3>
            <strong>Need help?</strong> Ask a poll worker.
          </h3>
        </Prose>
        <Done>
          <Button onPress={hidePostVotingInstructions}>Done</Button>
        </Done>
      </Main>
    </Screen>
  );
}
